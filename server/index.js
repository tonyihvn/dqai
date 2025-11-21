
import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
// Allow public admin-like endpoints in development or when explicitly enabled
const allowPublicAdmin = (process.env.ALLOW_PUBLIC_ADMIN === 'true') || (process.env.NODE_ENV !== 'production');

// Middleware - MUST be registered before route handlers so req.body is available
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Simple Session Setup (No Passport needed for dev mode)
app.use(
    cookieSession({
        name: 'session',
        keys: ['key1', 'key2'],
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    })
);

// Serve uploaded files (images/videos) from /uploads
const uploadsRoot = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
app.use('/uploads', express.static(uploadsRoot));

// LLM SQL generation endpoint (provider dispatch + fallback)
async function tryCallProvider(providerRow, prompt, ragContext) {
    try {
        const cfg = providerRow.config || {};
        const base = (cfg.url || process.env.OLLAMA_URL || cfg.endpoint || '').toString().replace(/\/$/, '') || 'http://localhost:11434';
        const model = providerRow.model || cfg.model || undefined;
        // Provide a strict instruction template so LLMs 'think' and then return a safe, read-only SQL
        const instruction = `INSTRUCTIONS: You are a SQL assistant.\n- First, provide a concise explanation (1-3 sentences) of how you interpreted the user's request and what you will do (label this 'Thoughts:').\n- Then, under the heading 'Action to Be Taken:', return a single read-only SELECT SQL statement only using the provided tables and columns. Wrap the SQL in a fenced block like \`\`\`sql ... \`\`\`.\n- DO NOT reference or use any tables/columns not present in the context.\n- Do not produce DML/DDL or multiple statements.\n`;
        const payload = { prompt: `${instruction}\nContext:\n${ragContext || ''}\n\nUser: ${prompt}`, model };

        const attempts = [`${base}/v1/generate`, `${base}/generate`, `${base}/llms/generate`, `${base}/llms`, base];
        for (const ep of attempts) {
            try {
                const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!r.ok) continue;
                let j = null;
                try { j = await r.json(); } catch (e) { const txt = await r.text(); j = { text: txt }; }
                let text = '';
                if (typeof j === 'string') text = j;
                else if (j.text) text = j.text;
                else if (j.output && j.output[0] && j.output[0].content) text = j.output[0].content;
                else if (j.choices && Array.isArray(j.choices) && j.choices[0]) {
                    const c = j.choices[0];
                    text = c.message?.content || c.text || JSON.stringify(c);
                } else {
                    text = JSON.stringify(j);
                }
                let sql = null;
                const fenced = text.match(/```sql\s*([\s\S]*?)```/i);
                if (fenced) sql = fenced[1].trim();
                else {
                    const sel = text.match(/(SELECT[\s\S]*)/i);
                    if (sel) sql = sel[1].trim();
                }
                return { text, sql };
            } catch (e) {
                continue;
            }
        }
        return null;
    } catch (e) {
        console.error('tryCallProvider error', e);
        return null;
    }
}

// Helper: truncate every field in sample rows to 50 characters
function truncateSampleRows(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(r => {
        if (!r || typeof r !== 'object') return r;
        const out = {};
        for (const k of Object.keys(r)) {
            const v = r[k];
            if (v === null || v === undefined) { out[k] = v; continue; }
            let s;
            if (typeof v === 'string') s = v;
            else {
                try { s = JSON.stringify(v); } catch (e) { s = String(v); }
            }
            if (s.length > 50) s = s.slice(0, 50);
            out[k] = s;
        }
        return out;
    });
}

app.post('/api/llm/generate_sql', async (req, res) => {
    try {
        const { prompt, context, scope, providerId } = req.body || {};
        if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

        const rres = await pool.query('SELECT * FROM dqai_rag_schemas');
        const ragRows = rres.rows || [];

        const tokens = (String(prompt).toLowerCase().match(/\w+/g) || []);
        const lowerPrompt = String(prompt).toLowerCase();
        const scored = ragRows.map(r => {
            const table = (r.table_name || '').toString().toLowerCase();
            const cols = (r.schema || []).map(c => (c.column_name || c.name || '').toString().toLowerCase());
            let score = 0;
            for (const t of tokens) {
                if (!t) continue;
                if (table === t) score += 10; // exact table name match
                else if (table.includes(t)) score += 5; // table name contains token
                for (const c of cols) {
                    if (c === t) score += 3;
                    else if (c.includes(t)) score += 1;
                }
            }
            // Heuristics for statistical/score queries: boost schemas that contain score-like columns
            try {
                if (/\b(total|total score|overall score|score|sum|average|avg|mean)\b/.test(lowerPrompt)) {
                    const lowCols = cols;
                    if (lowCols.includes('overall_score') || lowCols.includes('overallscore')) score += 80;
                    if (lowCols.includes('score') || lowCols.includes('scores') || lowCols.includes('score_value')) score += 50;
                    if (lowCols.some(c => c.includes('answer') || c.includes('answer_value') || c.includes('answers'))) score += 40;
                    if (table.includes('report')) score += 30;
                    if (table.includes('answer') || table.includes('answers')) score += 30;
                }
            } catch (e) { }
            return { r, score, cols };
        });

        scored.sort((a, b) => (b.score - a.score));
        const best = scored[0];
        if (!best || best.score <= 0) {
            const available = ragRows.map(rr => rr.table_name).filter(Boolean).slice(0, 50);
            return res.json({ text: `I couldn't confidently match your request to any table schema. Please clarify which table/fields you mean. Available tables: ${available.join(', ')}` });
        }

        // Choose the table to use (allow keyword-driven overrides)
        let tableName = best.r.table_name;
        let overrideNote = '';
        try {
            const wantsProgram = tokens.some(t => t === 'program' || t === 'programs');
            if (wantsProgram) {
                const progRow = ragRows.find(rr => ((rr.table_name || '').toString().toLowerCase().includes('program')));
                if (progRow) {
                    tableName = progRow.table_name;
                    overrideNote = `Overrode initial match because prompt explicitly mentions programs; using table "${tableName}" from RAG records.`;
                }
            }
        } catch (e) { /* ignore */ }

        const chosenRow = ragRows.find(rr => (rr.table_name || '') === tableName) || best.r;
        const matchedCols = [];
        for (const c of (chosenRow.schema || [])) {
            const cname = (c.column_name || c.name || '').toString();
            const low = cname.toLowerCase();
            if (tokens.some(t => low.includes(t) || t === low)) matchedCols.push(cname);
        }

        // Include any RAG records marked as 'Compulsory' into the LLM context so the model always sees them
        let compulsoryRags = (ragRows || []).filter(rr => String(rr.category || '').toLowerCase() === 'compulsory');
        // If no explicit compulsory entries exist, prefer core tables that are likely required for SQL generation
        if (!compulsoryRags || compulsoryRags.length === 0) {
            const coreNames = ['dqai_activity_reports', 'dqai_answers', 'dqai_questions'];
            compulsoryRags = ragRows.filter(rr => coreNames.includes(((rr.table_name || '')).toString()));
        }
        let compulsoryContext = '';
        if (compulsoryRags.length) {
            // Prefer using a short human-readable summary if available
            compulsoryContext = compulsoryRags.map(cr => {
                if (cr.summary_text && String(cr.summary_text).trim()) return `RAG Summary: ${String(cr.summary_text).trim()}${cr.business_rules ? '\nBusiness Rules: ' + cr.business_rules : ''}`;
                const crCols = (cr.schema || []).map(c => (c.column_name || c.name)).filter(Boolean).join(', ');
                const crSample = JSON.stringify((cr.sample_rows || []).slice(0, 2));
                const br = cr.business_rules ? `Business Rules: ${cr.business_rules}` : '';
                return `RAG Table: ${cr.table_name}\nColumns: ${crCols}\nSample: ${crSample}${br ? '\n' + br : ''}`;
            }).join('\n\n');
        }

        // Build structured RAG context as JSON to send to LLMs (reduces token waste and keeps schema precise)
        const buildRagObj = (row) => ({
            table_name: row.table_name,
            schema: Array.isArray(row.schema) ? row.schema.map(c => ({ data_type: c.data_type || '', column_name: c.column_name || c.name || '', is_nullable: c.is_nullable || (c.nullable ? 'YES' : 'NO') })) : [],
            sample_rows: Array.isArray(row.sample_rows) ? (row.sample_rows || []).slice(0, 3) : [],
            category: row.category || null,
            business_rules: row.business_rules || null,
            summary_text: row.summary_text || null
        });

        const chosenObj = buildRagObj(chosenRow || best.r);
        const compulsoryObjs = (compulsoryRags || []).map(buildRagObj);
        const ragContextObj = { compulsory: compulsoryObjs, chosen: chosenObj };
        const ragContext = JSON.stringify(ragContextObj);

        let providerUsed = null;
        let providerResponse = null;
        try {
            if (providerId) {
                const pr = await pool.query('SELECT * FROM dqai_llm_providers WHERE id = $1', [providerId]);
                if (pr.rows.length) {
                    const prov = pr.rows[0];
                    providerResponse = await tryCallProvider(prov, prompt, ragContext);
                    if (providerResponse) providerUsed = prov.name || prov.provider_id;
                }
            } else {
                const pres = await pool.query('SELECT * FROM dqai_llm_providers ORDER BY priority ASC NULLS LAST');
                for (const prov of pres.rows) {
                    try {
                        const r = await tryCallProvider(prov, prompt, ragContext);
                        if (r) { providerResponse = r; providerUsed = prov.name || prov.provider_id; break; }
                    } catch (e) { }
                }
            }
        } catch (e) { console.error('provider dispatch error', e); }

        if (providerResponse && (providerResponse.sql || providerResponse.text)) {
            const text = providerResponse.text || '';
            const sql = providerResponse.sql || '';
            return res.json({ text, sql, ragTables: [tableName], matchedColumns: matchedCols, providerUsed });
        }

        const lower = String(prompt).toLowerCase();
        let sql = '';
        const numericCol = (best.r.schema || []).find(c => /(int|numeric|decimal|real|double|smallint|bigint)/i.test(String(c.data_type || '')));

        // A: average / mean requests
        if (/(average|avg|mean)/.test(lower) && numericCol) {
            const agg = `AVG("${numericCol.column_name}") as avg_${numericCol.column_name}`;
            const byMatch = prompt.match(/by\s+([a-zA-Z0-9_]+)/i);
            if (byMatch) {
                const groupCol = byMatch[1];
                sql = `SELECT ${agg}, "${groupCol}" FROM "${tableName}" GROUP BY "${groupCol}" LIMIT 200`;
            } else {
                sql = `SELECT ${agg} FROM "${tableName}" LIMIT 200`;
            }

            // B: count / how many requests — improved handling for "by", "per", and quoted values
        } else if (/(count|how many|number of)/.test(lower)) {
            // prefer explicit "by <col>" or "per <col>"
            const byMatch = prompt.match(/(?:by|per|group by)\s+([a-zA-Z0-9_]+)/i);
            if (byMatch) {
                const groupCol = byMatch[1];
                sql = `SELECT "${groupCol}", COUNT(*) as count FROM "${tableName}" GROUP BY "${groupCol}" LIMIT 200`;
            } else {
                // if the prompt contains a quoted value or "for <value>", try to add a WHERE clause on a text column
                const whereMatch = prompt.match(/where\s+([a-zA-Z0-9_]+)\s*(=|is|:)\s*['"]?([^'"\n]+)['"]?/i) || prompt.match(/for\s+'?([^']+)'?/i);
                if (whereMatch && whereMatch[1] && whereMatch[2]) {
                    // pattern matched as where <col> = <val>
                    const col = whereMatch[1]; const val = whereMatch[2];
                    const hasCol = (best.r.schema || []).some(c => (c.column_name || c.name || '') === col);
                    if (hasCol) {
                        sql = `SELECT COUNT(*) as count FROM "${tableName}" WHERE "${col}" = '${String(val).replace(/'/g, "''")}'`;
                    }
                }

                // fallback: simple count of rows
                if (!sql) sql = `SELECT COUNT(*) as count FROM "${tableName}"`;
            }

            // C: generic select with heuristic WHERE handling
        } else {
            let selectCols = [];
            if (matchedCols.length > 0) selectCols = matchedCols.slice(0, 10);
            else selectCols = (best.r.schema || []).map(c => (c.column_name || c.name)).filter(Boolean).slice(0, 10);
            const selectClause = (selectCols.length > 0) ? selectCols.map(c => `"${c}"`).join(', ') : '*';
            let where = '';

            // try to capture explicit where clauses including quoted values with spaces
            const whereMatch = prompt.match(/where\s+([a-zA-Z0-9_]+)\s*(=|is|:)\s*['"]?([^'"\n]+)['"]?/i);
            if (whereMatch) {
                const col = whereMatch[1]; const val = whereMatch[3];
                const hasCol = (best.r.schema || []).some(c => (c.column_name || c.name || '') === col);
                if (hasCol) where = ` WHERE "${col}" = '${String(val).replace(/'/g, "''")}'`;
            } else {
                // try "for <value>" or "in <value>" and match to a text column
                const forMatch = prompt.match(/(?:for|in)\s+['"]?([^'"\n]+)['"]?/i);
                if (forMatch) {
                    const val = forMatch[1].trim();
                    const textCol = (best.r.schema || []).find(c => /(char|text|varchar)/i.test(String(c.data_type || '')));
                    if (textCol) where = ` WHERE "${textCol.column_name || textCol.name}" ILIKE '%${String(val).replace(/'/g, "''")}%'`;
                }
            }

            // If the prompt mentions "program" and we have other RAGs with program in their table name,
            // hint a join by selecting important columns and adding a where clause if a program value was provided.
            if (!where && /program\b/.test(lower) && (ragRows || []).some(rr => (rr.table_name || '').toLowerCase().includes('program'))) {
                const programTable = (ragRows || []).find(rr => (rr.table_name || '').toLowerCase().includes('program'));
                if (programTable) {
                    // try to find a likely program name column in the program table
                    const progSchema = programTable.schema || [];
                    const progNameCol = (progSchema.find(c => /(name|title|program)/i.test(String(c.column_name || c.name || ''))) || {}).column_name || (progSchema.find(c => /(name|title|program)/i.test(String(c.column_name || c.name || ''))) || {}).name;
                    const textCol = (best.r.schema || []).find(c => /(char|text|varchar)/i.test(String(c.data_type || '')));
                    if (progNameCol && textCol) {
                        // if user provided a program name, capture it
                        const progMatch = prompt.match(/(?:for|in)\s+['"]?([^'"\n]+)['"]?/i);
                        if (progMatch) {
                            const progVal = progMatch[1].trim();
                            where = ` WHERE "${textCol.column_name || textCol.name}" ILIKE '%${String(progVal).replace(/'/g, "''")}%'`;
                            sql = `SELECT ${selectClause} FROM "${tableName}"${where} LIMIT 500`;
                        }
                    }
                }
            }

            if (!sql) sql = `SELECT ${selectClause} FROM "${tableName}"${where} LIMIT 500`;
        }

        // Add autogenerated business-rule guidance when relevant and include any stored business_rules
        let businessRule = '';
        try {
            if ((ragRows || []).some(rr => (rr.table_name || '').toString().toLowerCase().includes('program'))) {
                businessRule = `Business rule (autogenerated): Use the table that contains program records (e.g. any table with 'program' in its name) for organization-level program counts.`;
            }
        } catch (e) { }
        // Append explicit business rules from the chosen RAG and any compulsory RAGs
        try {
            if (chosenRow && chosenRow.business_rules) businessRule = (businessRule ? businessRule + '\n' : '') + `Business Rules (from selected RAG): ${chosenRow.business_rules}`;
            if (compulsoryRags.length) {
                const crules = compulsoryRags.map(cr => cr.business_rules).filter(Boolean);
                if (crules.length) businessRule = (businessRule ? businessRule + '\n' : '') + `Business Rules (compulsory RAGs):\n- ${crules.join('\n- ')}`;
            }
        } catch (e) { console.error('business_rules append error', e); }

        const explanation = `${overrideNote ? overrideNote + '\n' : ''}I selected the RAG schema for table "${tableName}" as the best match based on your prompt. Matched columns: ${matchedCols.join(', ') || '(none)'}.\nI will produce a safe, read-only SQL query constrained to the discovered table schema and return results formatted per your request.${businessRule ? '\n' + businessRule : ''}`;

        // Put Action on its own line and bold the SQL for clearer UI rendering
        const responseText = `${explanation}\n\nAction to Be Taken:\n**${sql}**`;
        return res.json({ text: responseText, sql, ragTables: [tableName], matchedColumns: matchedCols, providerUsed });

    } catch (e) {
        console.error('LLM/generate_sql error', e);
        res.status(500).json({ error: 'Failed to generate SQL', details: String(e) });
    }
});

// Execute safe read-only SQL against the configured target DB (uses process.env DB_* settings)
app.post('/api/execute_sql', async (req, res) => {
    try {
        const { sql } = req.body || {};
        if (!sql) return res.status(400).json({ error: 'Missing sql' });
        // Enforce read-only single-statement SELECT queries for safety
        const trimmed = sql.trim();
        if (!/^select\s+/i.test(trimmed)) return res.status(400).json({ error: 'Only SELECT queries are allowed' });
        if (/;/.test(trimmed.replace(/\s+/g, ' ')) && !/;\s*\z/.test(trimmed)) {
            // multiple statements detected (naive check)
            return res.status(400).json({ error: 'Multiple statements are not allowed' });
        }

        const targetConfig = {
            user: process.env.DB_USER || process.env.TARGET_DB_USER,
            host: process.env.DB_HOST || process.env.TARGET_DB_HOST,
            database: process.env.DB_NAME || process.env.TARGET_DB_NAME,
            password: process.env.DB_PASSWORD || process.env.TARGET_DB_PASSWORD,
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
            connectionTimeoutMillis: 10000
        };

        const targetPool = new Pool(targetConfig);
        try {
            const result = await targetPool.query(trimmed);
            await targetPool.end();
            return res.json({ rows: result.rows, rowCount: result.rowCount });
        } catch (e) {
            await targetPool.end().catch(() => { });
            console.error('execute_sql query error', e);
            return res.status(500).json({ error: String(e.message || e) });
        }
    } catch (e) {
        console.error('execute_sql error', e);
        res.status(500).json({ error: String(e) });
    }
});

// ...existing middleware registered earlier

// Database Connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'dqappdb',
    password: process.env.DB_PASSWORD || 'admin',
    port: process.env.DB_PORT || 5432,
});

// Initialize database schema if tables don't exist
async function initDb() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS dqai_users (
            id SERIAL PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT,
            status TEXT,
            facility_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_programs (
            id SERIAL PRIMARY KEY,
            name TEXT,
            details TEXT,
            type TEXT,
            category TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_facilities (
            id SERIAL PRIMARY KEY,
            name TEXT,
            state TEXT,
            lga TEXT,
            address TEXT,
            category TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_activities (
            id SERIAL PRIMARY KEY,
            title TEXT,
            subtitle TEXT,
            program_id INTEGER REFERENCES dqai_programs(id) ON DELETE SET NULL,
            details TEXT,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            response_type TEXT,
            category TEXT,
            status TEXT,
            created_by INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            form_definition JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_activity_reports (
            id SERIAL PRIMARY KEY,
            activity_id INTEGER REFERENCES dqai_activities(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            facility_id INTEGER REFERENCES dqai_facilities(id) ON DELETE SET NULL,
            status TEXT,
            answers JSONB,
            reviewers_report TEXT,
            overall_score NUMERIC,
            reported_by INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            submission_date TIMESTAMP DEFAULT NOW()
        )`
        ,
        `CREATE TABLE IF NOT EXISTS dqai_questions (
            id TEXT PRIMARY KEY,
            activity_id INTEGER REFERENCES dqai_activities(id) ON DELETE CASCADE,
            page_name TEXT,
            section_name TEXT,
            question_text TEXT,
            question_helper TEXT,
            answer_type TEXT,
            category TEXT,
            question_group TEXT,
            column_size INTEGER,
            status TEXT,
            options JSONB,
            metadata JSONB,
                created_by INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_answers (
            id SERIAL PRIMARY KEY,
            report_id INTEGER REFERENCES dqai_activity_reports(id) ON DELETE CASCADE,
            activity_id INTEGER REFERENCES dqai_activities(id) ON DELETE CASCADE,
            question_id TEXT,
            answer_value JSONB,
            facility_id INTEGER REFERENCES dqai_facilities(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            recorded_by INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            answer_datetime TIMESTAMP DEFAULT NOW(),
            reviewers_comment TEXT,
            quality_improvement_followup TEXT,
            score NUMERIC,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS dqai_uploaded_docs (
            id SERIAL PRIMARY KEY,
            activity_id INTEGER REFERENCES dqai_activities(id) ON DELETE CASCADE,
            facility_id INTEGER REFERENCES dqai_facilities(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            uploaded_by INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
                report_id INTEGER REFERENCES dqai_activity_reports(id) ON DELETE CASCADE,
                file_content JSONB,
            filename TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`
        ,
        `CREATE TABLE IF NOT EXISTS dqai_rag_schemas (
            id SERIAL PRIMARY KEY,
            table_name TEXT UNIQUE,
            schema JSONB,
            sample_rows JSONB,
            generated_at TIMESTAMP DEFAULT NOW()
        )`
    ];

    for (const q of queries) {
        try {
            await pool.query(q);
        } catch (err) {
            console.error('DB init error:', err);
            throw err;
        }
    }
    // Ensure answers table has reviewer/score columns and remove them from questions if present
    try {
        await pool.query(`ALTER TABLE dqai_answers ADD COLUMN IF NOT EXISTS reviewers_comment TEXT`);
        await pool.query(`ALTER TABLE dqai_answers ADD COLUMN IF NOT EXISTS quality_improvement_followup TEXT`);
        await pool.query(`ALTER TABLE dqai_answers ADD COLUMN IF NOT EXISTS score NUMERIC`);
        await pool.query(`ALTER TABLE dqai_questions ADD COLUMN IF NOT EXISTS required BOOLEAN`);
        // Add profile_image to users
        await pool.query(`ALTER TABLE dqai_users ADD COLUMN IF NOT EXISTS profile_image TEXT`);
        // Create roles, permissions and settings tables
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_roles (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_permissions (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_role_permissions (
            role_id INTEGER REFERENCES dqai_roles(id) ON DELETE CASCADE,
            permission_id INTEGER REFERENCES dqai_permissions(id) ON DELETE CASCADE,
            PRIMARY KEY (role_id, permission_id)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_user_roles (
            user_id INTEGER REFERENCES dqai_users(id) ON DELETE CASCADE,
            role_id INTEGER REFERENCES dqai_roles(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, role_id)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_settings (
            key TEXT PRIMARY KEY,
            value JSONB
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_llm_providers (
            id SERIAL PRIMARY KEY,
            provider_id TEXT,
            name TEXT,
            model TEXT,
            config JSONB,
            priority INTEGER
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_rag_schemas (
            id SERIAL PRIMARY KEY,
            table_name TEXT UNIQUE,
            schema JSONB,
            sample_rows JSONB,
            generated_at TIMESTAMP DEFAULT NOW()
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_rag_chroma_ids (
            id SERIAL PRIMARY KEY,
            rag_table_name TEXT,
            chroma_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
        // Audit batches: store arrays of events pushed from clients (minimalistic records)
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_audit_batches (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES dqai_users(id) ON DELETE SET NULL,
            events JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
        // Ensure RAG schemas table has category and business rules fields
        await pool.query(`ALTER TABLE dqai_rag_schemas ADD COLUMN IF NOT EXISTS category TEXT`);
        await pool.query(`ALTER TABLE dqai_rag_schemas ADD COLUMN IF NOT EXISTS business_rules TEXT`);
        // Add a minimal text summary field for RAG records to provide concise context to LLMs
        await pool.query(`ALTER TABLE dqai_rag_schemas ADD COLUMN IF NOT EXISTS summary_text TEXT`);
        // Ensure uploaded_docs has a report_id reference so files can be tied to a specific report
        await pool.query(`ALTER TABLE dqai_uploaded_docs ADD COLUMN IF NOT EXISTS report_id INTEGER`);
        // Ensure activities has response_type and form_definition (sync with schema)
        await pool.query(`ALTER TABLE dqai_activities ADD COLUMN IF NOT EXISTS response_type TEXT`);
        await pool.query(`ALTER TABLE dqai_activities ADD COLUMN IF NOT EXISTS form_definition JSONB`);
        // Remove legacy columns from questions if they exist
        await pool.query(`ALTER TABLE dqai_questions DROP COLUMN IF EXISTS reviewers_comment`);
        await pool.query(`ALTER TABLE dqai_questions DROP COLUMN IF EXISTS quality_improvement_followup`);
        await pool.query(`ALTER TABLE dqai_questions DROP COLUMN IF EXISTS score`);
        // Ensure activity_reports schema: remove uploaded_files and data_collection_level, add reviewer report fields
        await pool.query(`ALTER TABLE dqai_activity_reports DROP COLUMN IF EXISTS uploaded_files`);
        await pool.query(`ALTER TABLE dqai_activity_reports DROP COLUMN IF EXISTS data_collection_level`);
        await pool.query(`ALTER TABLE dqai_activity_reports ADD COLUMN IF NOT EXISTS reviewers_report TEXT`);
        await pool.query(`ALTER TABLE dqai_activity_reports ADD COLUMN IF NOT EXISTS overall_score NUMERIC`);
        await pool.query(`ALTER TABLE dqai_activity_reports ADD COLUMN IF NOT EXISTS reported_by INTEGER`);
    } catch (err) {
        console.error('Failed to sync reviewer/score columns between questions and answers:', err);
        throw err;
    }
    // Ensure legacy tables get required columns (safe check + alter if missing)
    try {
        const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='dqai_users' AND column_name='password'");
        if (colCheck.rowCount === 0) {
            console.log('dqai_users.password column missing — adding column');
            await pool.query('ALTER TABLE dqai_users ADD COLUMN password TEXT');
            console.log('dqai_users.password column added');
        } else {
            console.log('users.password column already exists');
        }
    } catch (err) {
        console.error('Failed to ensure users.password column exists:', err);
        throw err;
    }
    console.log('Database initialized (tables ensured).');
    // Ensure default admin user exists
    try {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234';
        // Hash default admin password before storing
        let hashedAdminPassword = null;
        try {
            hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
        } catch (e) {
            console.error('Failed to hash default admin password:', e);
            hashedAdminPassword = adminPassword; // fallback to plaintext (will be attempted to migrate on login)
        }
        const res = await pool.query('SELECT * FROM dqai_users WHERE email = $1', [adminEmail]);
        if (res.rows.length === 0) {
            await pool.query(
                'INSERT INTO dqai_users (first_name, last_name, email, password, role, status) VALUES ($1, $2, $3, $4, $5, $6)',
                ['System', 'Administrator', adminEmail, hashedAdminPassword, 'Admin', 'Active']
            );
            console.log('Default admin user created:', adminEmail);
        } else {
            // If user exists but password is empty or null, set it to the default admin password
            try {
                const existing = res.rows[0];
                if (!existing.password || String(existing.password).trim() === '') {
                    try {
                        await pool.query('UPDATE dqai_users SET password = $1 WHERE id = $2', [hashedAdminPassword, existing.id]);
                        console.log('Default admin user existed with empty password; password was set (hashed) from env for:', adminEmail);
                    } catch (ue) {
                        console.error('Failed to update existing admin password with hashed value:', ue);
                        // fallback to plain update
                        await pool.query('UPDATE dqai_users SET password = $1 WHERE id = $2', [adminPassword, existing.id]);
                    }
                }
            } catch (e) {
                console.error('Failed to ensure default admin password:', e);
            }
        }
    } catch (err) {
        console.error('Failed to ensure default admin user', err);
    }



    // Seed default roles and permissions if missing
    try {
        const perms = [
            ['manage_users', 'Create, update and delete users'],
            ['manage_roles', 'Manage roles and permissions'],
            ['manage_settings', 'Update system settings and LLM providers'],
            ['edit_forms', 'Create and edit form definitions'],
            ['submit_reports', 'Submit reports/responses'],
            ['view_reports', 'View reports and dashboards'],
            ['manage_llm', 'Manage LLM providers and RAG settings']
        ];
        for (const [name, desc] of perms) {
            await pool.query('INSERT INTO dqai_permissions (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, desc]);
        }

        const roles = [
            ['Admin', 'Full system administrator'],
            ['Form Builder', 'Design and publish forms'],
            ['Data Collector', 'Collect and submit data in the field'],
            ['Reviewer', 'Review submitted reports and provide feedback'],
            ['Viewer', 'Read-only access to reports and dashboards']
        ];
        for (const [name, desc] of roles) {
            await pool.query('INSERT INTO dqai_roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, desc]);
        }

        // Map role to permissions
        const rolePermMap = {
            'Admin': ['manage_users', 'manage_roles', 'manage_settings', 'edit_forms', 'submit_reports', 'view_reports', 'manage_llm'],
            'Form Builder': ['edit_forms', 'view_reports'],
            'Data Collector': ['submit_reports', 'view_reports'],
            'Reviewer': ['view_reports', 'manage_llm'],
            'Viewer': ['view_reports']
        };
        for (const [roleName, permNames] of Object.entries(rolePermMap)) {
            const r = await pool.query('SELECT id FROM dqai_roles WHERE name = $1', [roleName]);
            if (r.rows.length === 0) continue;
            const roleId = r.rows[0].id;
            for (const pname of permNames) {
                const p = await pool.query('SELECT id FROM dqai_permissions WHERE name = $1', [pname]);
                if (p.rows.length === 0) continue;
                const permId = p.rows[0].id;
                await pool.query('INSERT INTO dqai_role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleId, permId]);
            }
        }
        console.log('Default roles and permissions seeded (if they were missing).');
    } catch (err) {
        console.error('Failed to seed roles/permissions:', err);
    }

    // After seeding roles, ensure default admin user is assigned the Admin role in user_roles
    try {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
        const ures = await pool.query('SELECT id FROM dqai_users WHERE email = $1', [adminEmail]);
        const rres = await pool.query("SELECT id FROM dqai_roles WHERE name = 'Admin'");
        if (ures.rows.length > 0 && rres.rows.length > 0) {
            const userId = ures.rows[0].id;
            const roleId = rres.rows[0].id;
            await pool.query('INSERT INTO dqai_user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleId]);
            console.log('Assigned Admin role to default admin user (post-seed)');
        } else {
            console.log('Admin user or Admin role not found during post-seed assignment');
        }
    } catch (err) {
        console.error('Failed to assign Admin role to default admin user (post-seed):', err);
    }
}

// Helper: connect to an arbitrary target DB (Postgres or MySQL). Returns { type: 'pg'|'mysql', client }
async function connectToTargetDB(cfg) {
    // cfg: { user, host, database, password, port, type }
    const typeHint = (cfg.type || '').toString().toLowerCase();
    const port = Number(cfg.port || 0);
    if (typeHint === 'mysql' || port === 3306) {
        // dynamic import to avoid hard dependency unless used
        try {
            const mysql = await import('mysql2/promise');
            const conn = await mysql.createConnection({ host: cfg.host, user: cfg.user, database: cfg.database, password: cfg.password, port: cfg.port ? Number(cfg.port) : undefined });
            return { type: 'mysql', client: conn };
        } catch (e) {
            throw new Error('mysql2 is required to connect to MySQL target DB. Install it: npm install mysql2');
        }
    }

    // default: Postgres
    const pool = new Pool({ user: cfg.user, host: cfg.host, database: cfg.database, password: cfg.password, port: cfg.port ? Number(cfg.port) : undefined, connectionTimeoutMillis: 10000 });
    // test
    await pool.query('SELECT 1');
    return { type: 'pg', client: pool };
}

// Create the app tables in the target DB with prefix (e.g., dqai_)
async function createAppTablesInTarget(cfg, prefix = 'dqai_') {
    const connObj = await connectToTargetDB(cfg);
    try {
        if (connObj.type === 'pg') {
            const p = connObj.client;
            const q = async (sql) => await p.query(sql);
            // Use JSONB in Postgres
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}users" (
                id SERIAL PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                email TEXT UNIQUE,
                password TEXT,
                role TEXT,
                status TEXT,
                facility_id INTEGER,
                profile_image TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}programs" (
                id SERIAL PRIMARY KEY,
                name TEXT,
                details TEXT,
                type TEXT,
                category TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}facilities" (
                id SERIAL PRIMARY KEY,
                name TEXT,
                state TEXT,
                lga TEXT,
                address TEXT,
                category TEXT
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}activities" (
                id SERIAL PRIMARY KEY,
                title TEXT,
                subtitle TEXT,
                program_id INTEGER,
                details TEXT,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                response_type TEXT,
                category TEXT,
                status TEXT,
                created_by INTEGER,
                form_definition JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}activity_reports" (
                id SERIAL PRIMARY KEY,
                activity_id INTEGER,
                user_id INTEGER,
                facility_id INTEGER,
                status TEXT,
                answers JSONB,
                reviewers_report TEXT,
                overall_score NUMERIC,
                reported_by INTEGER,
                submission_date TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}questions" (
                id TEXT PRIMARY KEY,
                activity_id INTEGER,
                page_name TEXT,
                section_name TEXT,
                question_text TEXT,
                question_helper TEXT,
                answer_type TEXT,
                category TEXT,
                question_group TEXT,
                column_size INTEGER,
                status TEXT,
                options JSONB,
                metadata JSONB,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}answers" (
                id SERIAL PRIMARY KEY,
                report_id INTEGER,
                activity_id INTEGER,
                question_id TEXT,
                answer_value JSONB,
                facility_id INTEGER,
                user_id INTEGER,
                recorded_by INTEGER,
                answer_datetime TIMESTAMP DEFAULT NOW(),
                reviewers_comment TEXT,
                quality_improvement_followup TEXT,
                score NUMERIC,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}uploaded_docs" (
                id SERIAL PRIMARY KEY,
                activity_id INTEGER,
                facility_id INTEGER,
                user_id INTEGER,
                uploaded_by INTEGER,
                file_content JSONB,
                filename TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}roles" (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}permissions" (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}role_permissions" (
                role_id INTEGER,
                permission_id INTEGER,
                PRIMARY KEY (role_id, permission_id)
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}user_roles" (
                user_id INTEGER,
                role_id INTEGER,
                PRIMARY KEY (user_id, role_id)
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}settings" (
                key TEXT PRIMARY KEY,
                value JSONB
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}llm_providers" (
                id SERIAL PRIMARY KEY,
                provider_id TEXT,
                name TEXT,
                model TEXT,
                config JSONB,
                priority INTEGER
            )`);
            await q(`CREATE TABLE IF NOT EXISTS "${prefix}rag_schemas" (
                id SERIAL PRIMARY KEY,
                table_name TEXT UNIQUE,
                schema JSONB,
                sample_rows JSONB,
                generated_at TIMESTAMP DEFAULT NOW()
            )`);
            return { ok: true };
        } else if (connObj.type === 'mysql') {
            const c = connObj.client;
            const exec = async (sql) => await c.execute(sql);
            // Use JSON type in MySQL (5.7+); fallback to LONGTEXT if not supported by target
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}users\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                email TEXT UNIQUE,
                password TEXT,
                role TEXT,
                status TEXT,
                facility_id INT,
                profile_image TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}programs\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT,
                details TEXT,
                type TEXT,
                category TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}facilities\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT,
                state TEXT,
                lga TEXT,
                address TEXT,
                category TEXT
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}activities\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title TEXT,
                subtitle TEXT,
                program_id INT,
                details TEXT,
                start_date DATETIME,
                end_date DATETIME,
                response_type TEXT,
                category TEXT,
                status TEXT,
                created_by INT,
                form_definition JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}activity_reports\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                activity_id INT,
                user_id INT,
                facility_id INT,
                status TEXT,
                answers JSON,
                reviewers_report TEXT,
                overall_score DECIMAL(10,2),
                reported_by INT,
                submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}questions\` (
                id VARCHAR(255) PRIMARY KEY,
                activity_id INT,
                page_name TEXT,
                section_name TEXT,
                question_text TEXT,
                question_helper TEXT,
                answer_type TEXT,
                category TEXT,
                question_group TEXT,
                column_size INT,
                status TEXT,
                options JSON,
                metadata JSON,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}answers\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                report_id INT,
                activity_id INT,
                question_id VARCHAR(255),
                answer_value JSON,
                facility_id INT,
                user_id INT,
                recorded_by INT,
                answer_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewers_comment TEXT,
                quality_improvement_followup TEXT,
                score DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}uploaded_docs\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                activity_id INT,
                facility_id INT,
                user_id INT,
                uploaded_by INT,
                file_content JSON,
                filename TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}roles\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT UNIQUE,
                description TEXT
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}permissions\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT UNIQUE,
                description TEXT
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}role_permissions\` (
                role_id INT,
                permission_id INT,
                PRIMARY KEY (role_id, permission_id)
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}user_roles\` (
                user_id INT,
                role_id INT,
                PRIMARY KEY (user_id, role_id)
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}settings\` (
                \`key\` TEXT PRIMARY KEY,
                value JSON
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}llm_providers\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                provider_id TEXT,
                name TEXT,
                model TEXT,
                config JSON,
                priority INT
            )`);
            await exec(`CREATE TABLE IF NOT EXISTS \`${prefix}rag_schemas\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_name TEXT,
                schema JSON,
                sample_rows JSON,
                generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            return { ok: true };
        }
    } finally {
        try { if (connObj.type === 'pg') await connObj.client.end(); else await connObj.client.end(); } catch (e) { /* ignore */ }
    }
}

// Generate RAG schemas (columns + samples) from target DB and store in local rag_schemas and optionally push to CHROMA
async function generateRagFromTarget(cfg, prefix = 'dqai_') {
    const connObj = await connectToTargetDB(cfg);
    try {
        let tables = [];
        if (connObj.type === 'pg') {
            const p = connObj.client;
            const tres = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
            tables = tres.rows.map(r => r.table_name).filter(t => t && t.startsWith(prefix));
            for (const t of tables) {
                const colsRes = await p.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1', [t]);
                let sample = [];
                try { const sres = await p.query(`SELECT * FROM "${t}" LIMIT 5`); sample = truncateSampleRows(sres.rows); } catch (e) { sample = []; }
                // upsert into local rag_schemas (without prefix in stored name)
                const shortName = t.startsWith(prefix) ? t.slice(prefix.length) : t;
                await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows) VALUES ($1,$2,$3) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, generated_at = NOW()', [shortName, JSON.stringify(colsRes.rows), JSON.stringify(sample)]);
                // optional: push to Chroma/Vector DB if configured via CHROMA_API_URL
                if (process.env.CHROMA_API_URL) {
                    try {
                        const chromaUrl = (process.env.CHROMA_API_URL || '').replace(/\/$/, '');
                        for (let i = 0; i < sample.length; i++) {
                            const row = sample[i];
                            const chromaId = `${shortName}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
                            try {
                                await fetch(chromaUrl + '/index', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chromaId, text: JSON.stringify(row), metadata: { table: shortName, rowIndex: i } }) });
                                try { await pool.query('INSERT INTO dqai_rag_chroma_ids (rag_table_name, chroma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [shortName, chromaId]); } catch (e) { /* ignore */ }
                            } catch (e) { console.error('Failed to index row to Chroma for', shortName, e); }
                        }
                    } catch (e) { console.error('Failed to push to CHROMA for', shortName, e); }
                }
            }
        } else if (connObj.type === 'mysql') {
            const c = connObj.client;
            const [trows] = await c.execute("SHOW TABLES");
            const key = Object.keys(trows[0] || {})[0];
            tables = trows.map(r => r[key]).filter(t => t && t.startsWith(prefix));
            for (const t of tables) {
                const [cols] = await c.execute(`DESCRIBE \`${t}\``);
                let sample = [];
                try { const [srows] = await c.execute(`SELECT * FROM \`${t}\` LIMIT 5`); sample = truncateSampleRows(srows); } catch (e) { sample = []; }
                const shortName = t.startsWith(prefix) ? t.slice(prefix.length) : t;
                await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows) VALUES ($1,$2,$3) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, generated_at = NOW()', [shortName, JSON.stringify(cols), JSON.stringify(sample)]);
                if (process.env.CHROMA_API_URL) {
                    try {
                        const chromaUrl = (process.env.CHROMA_API_URL || '').replace(/\/$/, '');
                        for (let i = 0; i < sample.length; i++) {
                            const row = sample[i];
                            const chromaId = `${shortName}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
                            try {
                                await fetch(chromaUrl + '/index', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chromaId, text: JSON.stringify(row), metadata: { table: shortName, rowIndex: i } }) });
                                try { await pool.query('INSERT INTO dqai_rag_chroma_ids (rag_table_name, chroma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [shortName, chromaId]); } catch (e) { /* ignore */ }
                            } catch (e) { console.error('Failed to index row to Chroma for', shortName, e); }
                        }
                    } catch (e) { console.error('Failed to push to CHROMA for', shortName, e); }
                }
            }
        }
        return { ok: true, processed: tables.length };
    } finally {
        try { if (connObj.type === 'pg') await connObj.client.end(); else await connObj.client.end(); } catch (e) { }
    }
}

// Helper: require admin middleware
async function requireAdmin(req, res, next) {
    try {
        if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const r = await pool.query('SELECT role FROM dqai_users WHERE id = $1', [req.session.userId]);
        if (r.rows.length === 0) return res.status(401).json({ error: 'Unauthorized' });
        const roleFromUser = (r.rows[0].role || '').toString().toLowerCase();
        if (roleFromUser === 'admin') return next();
        // Also allow admin if the user has an Admin role assignment in user_roles -> roles
        try {
            const rr = await pool.query('SELECT r.name FROM dqai_user_roles ur JOIN dqai_roles r ON ur.role_id = r.id WHERE ur.user_id = $1', [req.session.userId]);
            for (const row of rr.rows) {
                if (row && row.name && row.name.toString().toLowerCase() === 'admin') return next();
            }
        } catch (innerErr) {
            console.error('requireAdmin role-check error', innerErr);
            // continue to forbidden if lookup fails
        }
        return res.status(403).json({ error: 'Forbidden - admin only' });
    } catch (e) { console.error('requireAdmin error', e); return res.status(500).json({ error: 'Server error' }); }
}

// Admin: read .env DB-related settings
app.get('/api/admin/env', requireAdmin, async (req, res) => {
    try {
        // Also attempt to read .env.local if present and merge values (env.local takes precedence)
        const envPathLocal = path.resolve(process.cwd(), '.env.local');
        let localMap = {};
        try {
            const raw = await fs.promises.readFile(envPathLocal, 'utf8');
            raw.split(/\r?\n/).forEach(l => { const idx = l.indexOf('='); if (idx > -1) localMap[l.slice(0, idx)] = l.slice(idx + 1); });
        } catch (e) { /* ignore missing */ }
        const env = {
            dbUser: localMap.DB_USER || process.env.DB_USER || '',
            dbHost: localMap.DB_HOST || process.env.DB_HOST || '',
            dbName: localMap.DB_NAME || process.env.DB_NAME || '',
            dbPort: localMap.DB_PORT || process.env.DB_PORT || '',
            dbPassword: localMap.DB_PASSWORD || process.env.DB_PASSWORD || ''
        };
        res.json(env);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to read env' }); }
});

// Admin: write DB env values to .env file (merges existing values)
app.post('/api/admin/env', requireAdmin, async (req, res) => {
    try {
        const payload = req.body || {};
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try { content = await fs.promises.readFile(envPath, 'utf8'); } catch (e) { content = ''; }
        const lines = content.split(/\r?\n/).filter(Boolean);
        const map = {};
        for (const l of lines) {
            const idx = l.indexOf('='); if (idx > -1) { map[l.slice(0, idx)] = l.slice(idx + 1); }
        }
        if (payload.dbUser !== undefined) map['DB_USER'] = String(payload.dbUser);
        if (payload.dbHost !== undefined) map['DB_HOST'] = String(payload.dbHost);
        if (payload.dbName !== undefined) map['DB_NAME'] = String(payload.dbName);
        if (payload.dbPort !== undefined) map['DB_PORT'] = String(payload.dbPort);
        if (payload.dbPassword !== undefined) map['DB_PASSWORD'] = String(payload.dbPassword);
        const out = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
        await fs.promises.writeFile(envPath, out, 'utf8');
        // also update process.env (effective until restart)
        process.env.DB_USER = map['DB_USER']; process.env.DB_HOST = map['DB_HOST']; process.env.DB_NAME = map['DB_NAME']; process.env.DB_PORT = map['DB_PORT']; process.env.DB_PASSWORD = map['DB_PASSWORD'];
        // also write to .env.local for frontend defaults
        try {
            const localPath = path.resolve(process.cwd(), '.env.local');
            await fs.promises.writeFile(localPath, out, 'utf8');
        } catch (e) { console.error('Failed to write .env.local', e); }

        // Attempt to generate RAG schemas for the target DB
        (async () => {
            try {
                const targetConfig = {
                    user: map['DB_USER'], host: map['DB_HOST'], database: map['DB_NAME'], password: map['DB_PASSWORD'], port: map['DB_PORT'] ? Number(map['DB_PORT']) : undefined
                };
                const tempPool = new Pool(targetConfig);
                // get list of tables in public schema
                const tablesRes = await tempPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
                for (const r of tablesRes.rows) {
                    const tname = r.table_name;
                    // columns
                    const colsRes = await tempPool.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1', [tname]);
                    const schema = colsRes.rows;
                    // sample rows
                    let sample = [];
                    try {
                        const sres = await tempPool.query(`SELECT * FROM "${tname}" LIMIT 5`);
                        sample = truncateSampleRows(sres.rows);
                    } catch (e) { /* ignore sampling errors */ }
                    // upsert into rag_schemas
                    await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows) VALUES ($1,$2,$3) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, generated_at = NOW()', [tname, JSON.stringify(schema), JSON.stringify(sample)]);
                }
                await tempPool.end();
                console.log('RAG schemas generated/updated based on provided DB settings');
            } catch (e) { console.error('Failed to generate RAG schemas:', e); }
        })();
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to write env' }); }
});

// Public write env (no auth) - used by Settings UI when no admin session is present
app.post('/api/env', async (req, res) => {
    try {
        const payload = req.body || {};
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try { content = await fs.promises.readFile(envPath, 'utf8'); } catch (e) { content = ''; }
        const lines = content.split(/\r?\n/).filter(Boolean);
        const map = {};
        for (const l of lines) {
            const idx = l.indexOf('='); if (idx > -1) { map[l.slice(0, idx)] = l.slice(idx + 1); }
        }
        if (payload.dbUser !== undefined) map['DB_USER'] = String(payload.dbUser);
        if (payload.dbHost !== undefined) map['DB_HOST'] = String(payload.dbHost);
        if (payload.dbName !== undefined) map['DB_NAME'] = String(payload.dbName);
        if (payload.dbPort !== undefined) map['DB_PORT'] = String(payload.dbPort);
        if (payload.dbPassword !== undefined) map['DB_PASSWORD'] = String(payload.dbPassword);
        const out = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
        await fs.promises.writeFile(envPath, out, 'utf8');
        process.env.DB_USER = map['DB_USER']; process.env.DB_HOST = map['DB_HOST']; process.env.DB_NAME = map['DB_NAME']; process.env.DB_PORT = map['DB_PORT']; process.env.DB_PASSWORD = map['DB_PASSWORD'];
        try {
            const localPath = path.resolve(process.cwd(), '.env.local');
            await fs.promises.writeFile(localPath, out, 'utf8');
        } catch (e) { console.error('Failed to write .env.local', e); }

        // Attempt to generate RAG schemas asynchronously (best-effort)
        (async () => {
            try {
                const targetConfig = {
                    user: map['DB_USER'], host: map['DB_HOST'], database: map['DB_NAME'], password: map['DB_PASSWORD'], port: map['DB_PORT'] ? Number(map['DB_PORT']) : undefined
                };
                const tempPool = new Pool(targetConfig);
                const tablesRes = await tempPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
                for (const r of tablesRes.rows) {
                    const tname = r.table_name;
                    const colsRes = await tempPool.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1', [tname]);
                    const schema = colsRes.rows;
                    let sample = [];
                    try { const sres = await tempPool.query(`SELECT * FROM "${tname}" LIMIT 5`); sample = truncateSampleRows(sres.rows); } catch (e) { /* ignore */ }
                    await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows) VALUES ($1,$2,$3) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, generated_at = NOW()', [tname, JSON.stringify(schema), JSON.stringify(sample)]);
                }
                await tempPool.end();
                console.log('RAG schemas generated/updated (public env update)');
            } catch (e) { console.error('Failed to generate RAG schemas (public env):', e); }
        })();

        res.json({ success: true });
    } catch (e) { console.error('public env write error', e); res.status(500).json({ error: 'Failed to write env' }); }
});

// Switch the application's data DB to an external target and create required tables there (admin only)
app.post('/api/admin/switch-db', requireAdmin, async (req, res) => {
    try {
        const { dbType, dbHost, dbPort, dbUser, dbPassword, dbName, prefix } = req.body || {};
        if (!dbType || !dbHost || !dbPort || !dbUser || !dbName) return res.status(400).json({ ok: false, error: 'Missing parameters' });
        const cfg = { type: dbType, host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: dbName };
        // Create tables in target
        const pfx = prefix || 'dqai_';
        try {
            await createAppTablesInTarget(cfg, pfx);
        } catch (e) {
            console.error('Failed to create tables in target DB', e);
            return res.status(500).json({ ok: false, error: String(e.message || e) });
        }

        // Generate RAG schemas from the new DB and save into local rag_schemas and optional Chroma
        try {
            const gen = await generateRagFromTarget(cfg, pfx);
            // Persist the target DB settings to local .env so execute_sql uses them
            const envPath = path.resolve(process.cwd(), '.env');
            const map = { DB_USER: dbUser, DB_HOST: dbHost, DB_NAME: dbName, DB_PORT: String(dbPort), DB_PASSWORD: dbPassword, DB_PREFIX: pfx, DB_TYPE: dbType };
            const out = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
            try { await fs.promises.writeFile(envPath, out, 'utf8'); } catch (e) { console.error('Failed to write .env', e); }
            try {
                const localPath = path.resolve(process.cwd(), '.env.local');
                await fs.promises.writeFile(localPath, out, 'utf8');
            } catch (e) { console.error('Failed to write .env.local', e); }

            return res.json({ ok: true, ragGenerated: gen.processed || 0 });
        } catch (e) {
            console.error('RAG generation failed', e);
            return res.status(500).json({ ok: false, error: String(e) });
        }
    } catch (e) { console.error('switch-db error', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// SMTP/POP settings endpoints (stored in settings table under key 'smtp')
app.get('/api/admin/smtp', requireAdmin, async (req, res) => {
    try {
        const r = await pool.query("SELECT value FROM dqai_settings WHERE key = 'smtp'");
        if (r.rows.length === 0) return res.json(null);
        return res.json(r.rows[0].value);
    } catch (e) { console.error('Failed to get smtp settings', e); res.status(500).json({ error: String(e) }); }
});

app.post('/api/admin/smtp', requireAdmin, async (req, res) => {
    try {
        const payload = req.body || {};
        await pool.query("INSERT INTO dqai_settings (key, value) VALUES ('smtp',$1) ON CONFLICT (key) DO UPDATE SET value = $1", [payload]);
        res.json({ ok: true });
    } catch (e) { console.error('Failed to save smtp settings', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// Test SMTP send (admin only)
app.post('/api/admin/test-smtp', requireAdmin, async (req, res) => {
    try {
        const { to, subject, text } = req.body || {};
        if (!to) return res.status(400).json({ ok: false, error: 'Missing to' });
        // load smtp settings
        const sres = await pool.query("SELECT value FROM dqai_settings WHERE key = 'smtp'");
        const smtp = sres.rows[0] ? sres.rows[0].value : null;
        if (!smtp) return res.status(400).json({ ok: false, error: 'SMTP not configured' });
        // dynamic import nodemailer
        try {
            const nm = await import('nodemailer');
            const transporter = nm.createTransport(smtp);
            await transporter.sendMail({ from: smtp.from || smtp.user || 'no-reply@example.com', to, subject: subject || 'Test', text: text || 'Test message' });
            return res.json({ ok: true });
        } catch (e) {
            console.error('Failed to send test smtp', e);
            return res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    } catch (e) { console.error('test-smtp error', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// Password reset: request token
app.post('/auth/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
        const ures = await pool.query('SELECT id, email, first_name FROM dqai_users WHERE email = $1', [email]);
        if (ures.rows.length === 0) return res.status(404).json({ ok: false, error: 'User not found' });
        const user = ures.rows[0];
        // ensure password_resets table exists
        await pool.query(`CREATE TABLE IF NOT EXISTS dqai_password_resets (user_id INTEGER, token TEXT PRIMARY KEY, expires_at TIMESTAMP)`);
        const token = crypto.randomBytes(24).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await pool.query('INSERT INTO dqai_password_resets (user_id, token, expires_at) VALUES ($1,$2,$3)', [user.id, token, expires]);
        // load smtp
        const sres = await pool.query("SELECT value FROM dqai_settings WHERE key = 'smtp'");
        const smtp = sres.rows[0] ? sres.rows[0].value : null;
        if (!smtp) return res.status(400).json({ ok: false, error: 'SMTP not configured' });
        const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontend.replace(/\/$/, '')}/reset-password?token=${token}`;
        try {
            const nm = await import('nodemailer');
            const transporter = nm.createTransport(smtp);
            const mailText = `Hello ${user.first_name || ''},\n\nYou requested a password reset. Click the link to reset your password: ${resetUrl}\n\nIf you didn't request this, ignore.`;
            await transporter.sendMail({ from: smtp.from || smtp.user || 'no-reply@example.com', to: user.email, subject: 'Password Reset', text: mailText });
        } catch (e) { console.error('Failed to send reset email', e); }
        return res.json({ ok: true });
    } catch (e) { console.error('request-password-reset error', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// Password reset: perform reset
app.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        if (!token || !newPassword) return res.status(400).json({ ok: false, error: 'Missing token or newPassword' });
        const tres = await pool.query('SELECT user_id, expires_at FROM dqai_password_resets WHERE token = $1', [token]);
        if (tres.rows.length === 0) return res.status(400).json({ ok: false, error: 'Invalid token' });
        const row = tres.rows[0];
        if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'Token expired' });
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE dqai_users SET dqai_password = $1 WHERE id = $2', [hash, row.user_id]);
        await pool.query('DELETE FROM dqai_password_resets WHERE token = $1', [token]);
        return res.json({ ok: true });
    } catch (e) { console.error('reset-password error', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// Admin: generic settings store (key/value JSON)
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_settings');
        const out = {};
        for (const r of result.rows) out[r.key] = r.value;
        res.json(out);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const payload = req.body || {};
        for (const [k, v] of Object.entries(payload)) {
            await pool.query('INSERT INTO dqai_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2', [k, v]);
        }
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save settings' }); }
});

// Admin: detect local Ollama models (server-side probe to avoid CORS issues)
app.get('/api/admin/detect-ollama', requireAdmin, async (req, res) => {
    const endpoints = [
        'http://127.0.0.1:11434/models',
        'http://127.0.0.1:11434/list',
        'http://127.0.0.1:11434/v1/models',
        'http://127.0.0.1:11434/llms',
        'http://localhost:11434/models',
        'http://localhost:11434/list',
        'http://localhost:11434/v1/models',
        'http://[::1]:11434/models',
        'https://127.0.0.1:11434/models',
        'https://localhost:11434/models'
    ];
    try {
        for (const url of endpoints) {
            try {
                const r = await fetch(url, { method: 'GET' });
                if (!r.ok) continue;
                const j = await r.json();
                let found = [];
                if (Array.isArray(j)) found = j.map(m => m.name || m.id || m.model || String(m));
                else if (j.models && Array.isArray(j.models)) found = j.models.map(m => m.name || m.id || m.model || String(m));
                else if (j.model) found = [j.model];
                if (found.length) return res.json({ ok: true, models: found, url });
            } catch (e) {
                // try next
            }
        }
        return res.status(404).json({ ok: false, models: [] });
    } catch (e) {
        console.error('detect-ollama error', e);
        return res.status(500).json({ ok: false, error: String(e) });
    }
});

// Admin: test DB connection for provided config (used by Settings "Test Connection")
app.post('/api/admin/test-db', requireAdmin, async (req, res) => {
    try {
        const { dbHost, dbPort, dbUser, dbPassword, dbName } = req.body || {};
        if (!dbHost || !dbPort || !dbUser || !dbName) return res.status(400).json({ ok: false, error: 'Missing parameters (dbHost, dbPort, dbUser, dbName required)' });
        const tempPool = new Pool({ host: dbHost, port: Number(dbPort), user: dbUser, password: dbPassword, database: dbName, connectionTimeoutMillis: 5000 });
        try {
            await tempPool.query('SELECT 1');
            // Generate RAG schemas (indexes/cols/sample rows) for this target DB
            try {
                const tablesRes = await tempPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
                for (const r of tablesRes.rows) {
                    const tname = r.table_name;
                    try {
                        const colsRes = await tempPool.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1', [tname]);
                        const schema = colsRes.rows;
                        let sample = [];
                        try {
                            const sres = await tempPool.query(`SELECT * FROM "${tname}" LIMIT 5`);
                            sample = truncateSampleRows(sres.rows);
                        } catch (e) {
                            // sampling failure is non-fatal
                            sample = [];
                        }
                        await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows) VALUES ($1,$2,$3) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, generated_at = NOW()', [tname, JSON.stringify(schema), JSON.stringify(sample)]);
                    } catch (e) {
                        console.error('Failed processing table', tname, e);
                    }
                }
            } catch (e) {
                console.error('Failed to generate RAG schemas during test-db:', e);
            }
            await tempPool.end();
            return res.json({ ok: true, generated: true });
        } catch (err) {
            await tempPool.end().catch(() => { });
            console.error('test-db connection error', err);
            return res.status(500).json({ ok: false, error: String(err.message || err) });
        }
    } catch (e) { console.error('test-db error', e); return res.status(500).json({ ok: false, error: String(e) }); }
});

// Public test DB endpoint (no auth) - useful for testing DB connectivity from Settings form
app.post('/api/test-db', async (req, res) => {
    try {
        const { dbHost, dbPort, dbUser, dbPassword, dbName } = req.body || {};
        if (!dbHost || !dbPort || !dbUser || !dbName) return res.status(400).json({ ok: false, error: 'Missing parameters (dbHost, dbPort, dbUser, dbName required)' });
        const tempPool = new Pool({ host: dbHost, port: Number(dbPort), user: dbUser, password: dbPassword, database: dbName, connectionTimeoutMillis: 3000 });
        try {
            await tempPool.query('SELECT 1');
            await tempPool.end();
            return res.json({ ok: true });
        } catch (err) {
            await tempPool.end().catch(() => { });
            return res.status(500).json({ ok: false, error: String(err.message || err) });
        }
    } catch (e) { console.error('test-db public error', e); return res.status(500).json({ ok: false, error: String(e) }); }
});

// Admin: manual seed roles & permissions endpoint (idempotent)
app.post('/api/admin/seed-roles', requireAdmin, async (req, res) => {
    try {
        // Re-run seeding logic from initDb (simple approach)
        const perms = [
            ['manage_users', 'Create, update and delete users'],
            ['manage_roles', 'Manage roles and permissions'],
            ['manage_settings', 'Update system settings and LLM providers'],
            ['edit_forms', 'Create and edit form definitions'],
            ['submit_reports', 'Submit reports/responses'],
            ['view_reports', 'View reports and dashboards'],
            ['manage_llm', 'Manage LLM providers and RAG settings']
        ];
        for (const [name, desc] of perms) {
            await pool.query('INSERT INTO dqai_permissions (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, desc]);
        }
        const roles = [
            ['Admin', 'Full system administrator'],
            ['Form Builder', 'Design and publish forms'],
            ['Data Collector', 'Collect and submit data in the field'],
            ['Reviewer', 'Review submitted reports and provide feedback'],
            ['Viewer', 'Read-only access to reports and dashboards']
        ];
        for (const [name, desc] of roles) {
            await pool.query('INSERT INTO dqai_roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, desc]);
        }
        const rolePermMap = {
            'Admin': ['manage_users', 'manage_roles', 'manage_settings', 'edit_forms', 'submit_reports', 'view_reports', 'manage_llm'],
            'Form Builder': ['edit_forms', 'view_reports'],
            'Data Collector': ['submit_reports', 'view_reports'],
            'Reviewer': ['view_reports', 'manage_llm'],
            'Viewer': ['view_reports']
        };
        for (const [roleName, permNames] of Object.entries(rolePermMap)) {
            const r = await pool.query('SELECT id FROM dqai_roles WHERE name = $1', [roleName]);
            if (r.rows.length === 0) continue;
            const roleId = r.rows[0].id;
            for (const pname of permNames) {
                const p = await pool.query('SELECT id FROM dqai_permissions WHERE name = $1', [pname]);
                if (p.rows.length === 0) continue;
                const permId = p.rows[0].id;
                await pool.query('INSERT INTO dqai_role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleId, permId]);
            }
        }
        // Ensure default admin user is assigned Admin role
        try {
            const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
            const ures = await pool.query('SELECT id FROM dqai_users WHERE email = $1', [adminEmail]);
            const rres = await pool.query("SELECT id FROM dqai_roles WHERE name = 'Admin'");
            if (ures.rows.length > 0 && rres.rows.length > 0) {
                const userId = ures.rows[0].id;
                const roleId = rres.rows[0].id;
                await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleId]);
            }
        } catch (e) { console.error('Failed to assign Admin role during seed-roles:', e); }
        res.json({ ok: true });
    } catch (e) { console.error('seed-roles error', e); res.status(500).json({ ok: false, error: String(e) }); }
});

// Admin: CRUD for llm_providers
app.get('/api/admin/llm_providers', requireAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM dqai_llm_providers ORDER BY priority ASC');
        res.json(r.rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list llm providers' }); }
});

app.post('/api/admin/llm_providers', requireAdmin, async (req, res) => {
    try {
        const { id, provider_id, name, model, config, priority } = req.body;
        if (id) {
            const r = await pool.query('UPDATE dqai_llm_providers SET provider_id=$1, name=$2, model=$3, config=$4, priority=$5 WHERE id=$6 RETURNING *', [provider_id, name, model, config || {}, priority || 0, id]);
            return res.json(r.rows[0]);
        }
        const r = await pool.query('INSERT INTO dqai_llm_providers (provider_id, name, model, config, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *', [provider_id, name, model, config || {}, priority || 0]);
        res.json(r.rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save provider' }); }
});

// Public (dev) LLM providers endpoints - enabled only when allowPublicAdmin is true
if (allowPublicAdmin) {
    app.get('/api/llm_providers', async (req, res) => {
        try {
            const r = await pool.query('SELECT * FROM dqai_llm_providers ORDER BY priority ASC');
            return res.json(r.rows);
        } catch (e) { console.error('public llm_providers list failed', e); return res.status(500).json({ error: 'Failed to list llm providers' }); }
    });

    app.post('/api/llm_providers', async (req, res) => {
        try {
            const { id, provider_id, name, model, config, priority } = req.body;
            if (id) {
                const r = await pool.query('UPDATE dqai_llm_providers SET provider_id=$1, name=$2, model=$3, config=$4, priority=$5 WHERE id=$6 RETURNING *', [provider_id, name, model, config || {}, priority || 0, id]);
                return res.json(r.rows[0]);
            }
            const r = await pool.query('INSERT INTO dqai_llm_providers (provider_id, name, model, config, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *', [provider_id, name, model, config || {}, priority || 0]);
            return res.json(r.rows[0]);
        } catch (e) { console.error('public llm_providers save failed', e); return res.status(500).json({ error: 'Failed to save provider' }); }
    });

    // Public (dev) RAG schemas listing
    app.get('/api/rag_schemas', async (req, res) => {
        try {
            const r = await pool.query('SELECT * FROM dqai_rag_schemas ORDER BY id');
            return res.json(r.rows);
        } catch (e) { console.error('public rag_schemas list failed', e); return res.status(500).json({ error: 'Failed to list rag schemas' }); }
    });

    // Public detect-ollama endpoint (dev only)
    app.get('/api/detect-ollama', async (req, res) => {
        const endpoints = [
            'http://127.0.0.1:11434/models',
            'http://127.0.0.1:11434/list',
            'http://127.0.0.1:11434/v1/models',
            'http://127.0.0.1:11434/llms',
            'http://localhost:11434/models',
            'http://localhost:11434/list',
            'http://localhost:11434/v1/models',
            'http://[::1]:11434/models'
        ];
        try {
            for (const url of endpoints) {
                try {
                    const r = await fetch(url, { method: 'GET' });
                    if (!r.ok) continue;
                    const j = await r.json();
                    let found = [];
                    if (Array.isArray(j)) found = j.map(m => m.name || m.id || m.model || String(m));
                    else if (j.models && Array.isArray(j.models)) found = j.models.map(m => m.name || m.id || m.model || String(m));
                    else if (j.model) found = [j.model];
                    if (found.length) return res.json({ ok: true, models: found, url });
                } catch (e) { /* continue */ }
            }
            return res.status(404).json({ ok: false, models: [] });
        } catch (e) { console.error('public detect-ollama error', e); return res.status(500).json({ ok: false, error: String(e) }); }
    });
}

// Admin: CRUD for RAG schemas (list/create/update/delete)
app.get('/api/admin/rag_schemas', requireAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM dqai_rag_schemas ORDER BY id');
        res.json(r.rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list rag schemas' }); }
});

app.post('/api/admin/rag_schemas', requireAdmin, async (req, res) => {
    try {
        const { id, table_name, schema, sample_rows, category, business_rules } = req.body || {};
        if (!table_name) return res.status(400).json({ error: 'Missing table_name' });
        if (!business_rules || !String(business_rules).trim()) return res.status(400).json({ error: 'Business rules (natural language) are required for every RAG record' });
        const schemaJson = schema ? JSON.stringify(schema) : JSON.stringify([]);
        const processedSamples = Array.isArray(sample_rows) ? truncateSampleRows(sample_rows) : [];
        const sampleJson = JSON.stringify(processedSamples || []);
        const cat = category ? String(category) : null;
        const br = business_rules ? String(business_rules) : null;
        let saved;
        if (id) {
            const r = await pool.query('UPDATE dqai_rag_schemas SET table_name=$1, schema=$2, sample_rows=$3, category=$4, business_rules=$5, generated_at = NOW() WHERE id=$6 RETURNING *', [table_name, schemaJson, sampleJson, cat, br, id]);
            saved = r.rows[0];
        } else {
            // Compute a minimal textual summary for the RAG record if not provided
            const computeSummary = () => {
                try {
                    const cols = (schema || []).map((c) => (c.column_name || c.name)).filter(Boolean);
                    const previewRows = (processedSamples || []).slice(0, 3).map((r) => {
                        try {
                            // join first few column values into a short string
                            const vals = cols.slice(0, 4).map(cn => `${cn}: ${String(r[cn] ?? '')}`);
                            return vals.join(' | ');
                        } catch (e) { return JSON.stringify(r).slice(0, 100); }
                    });
                    const colPart = cols.length ? `Columns: ${cols.slice(0, 8).join(', ')}` : '';
                    const samplePart = previewRows.length ? ` Sample: ${previewRows.join(' || ')}` : '';
                    return `${table_name}${colPart ? ' — ' + colPart : ''}${samplePart}`.slice(0, 800);
                } catch (e) { return `${table_name}`; }
            };
            const summaryText = computeSummary();
            const r = await pool.query('INSERT INTO dqai_rag_schemas (table_name, schema, sample_rows, category, business_rules, summary_text) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (table_name) DO UPDATE SET schema = $2, sample_rows = $3, category = $4, business_rules = $5, summary_text = $6, generated_at = NOW() RETURNING *', [table_name, schemaJson, sampleJson, cat, br, summaryText]);
            saved = r.rows[0];
        }

        // If configured, push samples to Chroma and record ids
        if (process.env.CHROMA_API_URL && Array.isArray(processedSamples) && processedSamples.length) {
            const chromaUrl = (process.env.CHROMA_API_URL || '').replace(/\/$/, '');
            try {
                // cleanup existing chroma ids for this table
                const existing = await pool.query('SELECT chroma_id FROM dqai_rag_chroma_ids WHERE rag_table_name = $1', [table_name]);
                for (const row of existing.rows) {
                    try { await fetch(chromaUrl + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.chroma_id }) }); } catch (e) { /* ignore */ }
                }
                await pool.query('DELETE FROM dqai_rag_chroma_ids WHERE rag_table_name = $1', [table_name]);

                for (let i = 0; i < processedSamples.length; i++) {
                    const rrow = processedSamples[i];
                    const chromaId = `${table_name}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
                    try {
                        await fetch(chromaUrl + '/index', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chromaId, text: JSON.stringify(rrow), metadata: { table: table_name, rag_id: saved.id, rowIndex: i } }) });
                        try { await pool.query('INSERT INTO dqai_rag_chroma_ids (rag_table_name, chroma_id) VALUES ($1,$2)', [table_name, chromaId]); } catch (e) { /* ignore */ }
                    } catch (e) { console.error('Failed to push sample to Chroma', e); }
                }
            } catch (e) { console.error('Chroma push error', e); }
        }

        res.json(saved);
    } catch (e) { console.error('Failed to save rag schema', e); res.status(500).json({ error: 'Failed to save rag schema' }); }
});

app.delete('/api/admin/rag_schemas/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const r = await pool.query('SELECT table_name FROM dqai_rag_schemas WHERE id = $1', [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const tableName = r.rows[0].table_name;
        // delete DB record
        await pool.query('DELETE FROM dqai_rag_schemas WHERE id = $1', [id]);
        // delete indexed chroma items if present
        if (process.env.CHROMA_API_URL) {
            const chromaUrl = (process.env.CHROMA_API_URL || '').replace(/\/$/, '');
            const ids = await pool.query('SELECT chroma_id FROM dqai_rag_chroma_ids WHERE rag_table_name = $1', [tableName]);
            for (const row of ids.rows) {
                try { await fetch(chromaUrl + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.chroma_id }) }); } catch (e) { /* ignore */ }
            }
            await pool.query('DELETE FROM dqai_rag_chroma_ids WHERE rag_table_name = $1', [tableName]);
        }
        res.json({ ok: true });
    } catch (e) { console.error('Failed to delete rag schema', e); res.status(500).json({ error: 'Failed to delete rag schema' }); }
});

// Roles & Permissions management endpoints
app.get('/api/admin/roles', requireAdmin, async (req, res) => {
    try { const r = await pool.query('SELECT * FROM dqai_roles ORDER BY id ASC'); res.json(r.rows); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list roles' }); }
});
app.post('/api/admin/roles', requireAdmin, async (req, res) => {
    try { const { id, name, description } = req.body; if (id) { const r = await pool.query('UPDATE dqai_roles SET name=$1, description=$2 WHERE id=$3 RETURNING *', [name, description, id]); return res.json(r.rows[0]); } const r = await pool.query('INSERT INTO dqai_roles (name, description) VALUES ($1,$2) RETURNING *', [name, description]); res.json(r.rows[0]); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save role' }); }
});
// Delete a role (admin only)
app.delete('/api/admin/roles/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM dqai_role_permissions WHERE role_id = $1', [id]);
        await pool.query('DELETE FROM dqai_user_roles WHERE role_id = $1', [id]);
        await pool.query('DELETE FROM dqai_roles WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) { console.error('Failed to delete role', e); res.status(500).json({ error: 'Failed to delete role' }); }
});

app.get('/api/admin/permissions', requireAdmin, async (req, res) => {
    try { const r = await pool.query('SELECT * FROM dqai_permissions ORDER BY id ASC'); res.json(r.rows); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list permissions' }); }
});
app.post('/api/admin/permissions', requireAdmin, async (req, res) => {
    try { const { id, name, description } = req.body; if (id) { const r = await pool.query('UPDATE dqai_permissions SET name=$1, description=$2 WHERE id=$3 RETURNING *', [name, description, id]); return res.json(r.rows[0]); } const r = await pool.query('INSERT INTO dqai_permissions (name, description) VALUES ($1,$2) RETURNING *', [name, description]); res.json(r.rows[0]); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save permission' }); }
});
// Delete a permission (admin only)
app.delete('/api/admin/permissions/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM dqai_role_permissions WHERE permission_id = $1', [id]);
        await pool.query('DELETE FROM dqai_permissions WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) { console.error('Failed to delete permission', e); res.status(500).json({ error: 'Failed to delete permission' }); }
});

app.post('/api/admin/roles/assign', requireAdmin, async (req, res) => {
    try { const { userId, roleId } = req.body; await pool.query('INSERT INTO dqai_user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleId]); res.json({ success: true }); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to assign role' }); }
});

app.post('/api/admin/roles/unassign', requireAdmin, async (req, res) => {
    try { const { userId, roleId } = req.body; await pool.query('DELETE FROM dqai_user_roles WHERE user_id=$1 AND role_id=$2', [userId, roleId]); res.json({ success: true }); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to unassign role' }); }
});

app.get('/api/admin/user_roles', requireAdmin, async (req, res) => {
    try { const userId = req.query.userId; if (!userId) return res.status(400).json({ error: 'Missing userId' }); const r = await pool.query('SELECT ur.role_id, r.name FROM dqai_user_roles ur JOIN dqai_roles r ON ur.role_id = r.id WHERE ur.user_id = $1', [userId]); res.json(r.rows); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list user roles' }); }
});

app.post('/api/admin/role_permissions', requireAdmin, async (req, res) => {
    try { const { roleId, permissionId } = req.body; await pool.query('INSERT INTO dqai_role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleId, permissionId]); res.json({ success: true }); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to assign permission to role' }); }
});

// Remove a permission from a role
app.post('/api/admin/role_permissions/remove', requireAdmin, async (req, res) => {
    try { const { roleId, permissionId } = req.body; await pool.query('DELETE FROM dqai_role_permissions WHERE role_id=$1 AND permission_id=$2', [roleId, permissionId]); res.json({ success: true }); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to remove permission from role' }); }
});

// List permissions assigned to a role
app.get('/api/admin/role_permissions', requireAdmin, async (req, res) => {
    try {
        const roleId = req.query.roleId;
        if (!roleId) return res.status(400).json({ error: 'Missing roleId' });
        const r = await pool.query('SELECT p.* FROM dqai_role_permissions rp JOIN dqai_permissions p ON rp.permission_id = p.id WHERE rp.role_id = $1 ORDER BY p.id', [roleId]);
        res.json(r.rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to list role permissions' }); }
});

// Roles with their permissions (convenience endpoint)
app.get('/api/admin/roles_with_perms', requireAdmin, async (req, res) => {
    try {
        const rolesRes = await pool.query('SELECT * FROM dqai_roles ORDER BY id');
        const out = [];
        for (const r of rolesRes.rows) {
            const permsRes = await pool.query('SELECT p.* FROM dqai_role_permissions rp JOIN dqai_permissions p ON rp.permission_id = p.id WHERE rp.role_id = $1 ORDER BY p.id', [r.id]);
            out.push({ ...r, permissions: permsRes.rows });
        }
        res.json(out);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch roles with permissions' }); }
});

// Accept bulk audit events from clients (clients should batch localStorage events and POST them here)
app.post('/api/audit/bulk', async (req, res) => {
    try {
        const payload = req.body || {};
        const events = Array.isArray(payload.events) ? payload.events : (payload.events ? [payload.events] : []);
        if (!events.length) return res.status(400).json({ error: 'Missing events array' });
        const uid = (req.session && req.session.userId) ? req.session.userId : (payload.userId || null);
        // store the entire batch as one JSONB entry for minimalistic audit
        await pool.query('INSERT INTO dqai_audit_batches (user_id, events) VALUES ($1,$2)', [uid, JSON.stringify(events)]);
        return res.json({ ok: true });
    } catch (e) {
        console.error('Failed to accept audit bulk', e);
        return res.status(500).json({ error: 'Failed to accept audit events' });
    }
});

// Sync questions from either a form-definition object or a flat questions array into the `questions` table
async function syncQuestions(activityId, formDefOrQuestions) {
    if (!activityId) return;
    try {
        await pool.query('DELETE FROM dqai_questions WHERE activity_id = $1', [activityId]);
        const insertText = `INSERT INTO dqai_questions (id, activity_id, page_name, section_name, question_text, question_helper, answer_type, category, question_group, column_size, status, required, options, metadata, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`;

        // If an array is provided, treat it as a flat list of question objects
        if (Array.isArray(formDefOrQuestions)) {
            for (const q of formDefOrQuestions) {
                const qId = q.id || q.questionId || (`q_${activityId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
                const pageName = q.pageName || q.page_name || q.page || null;
                const sectionName = q.sectionName || q.section_name || q.section || null;
                const questionText = q.questionText || q.question_text || q.text || null;
                const questionHelper = q.questionHelper || q.question_helper || q.helper || null;
                const answerType = q.answerType || q.answer_type || q.type || null;
                const category = q.category || null;
                const questionGroup = q.questionGroup || q.question_group || null;
                const columnSize = q.columnSize || q.column_size || null;
                const status = q.status || 'Active';
                const options = q.options ? JSON.stringify(q.options) : null;
                const metadata = q.metadata ? JSON.stringify(q.metadata) : null;
                let createdBy = q.createdBy || q.created_by || null;
                // coerce createdBy to integer id or null to avoid invalid input syntax errors
                const createdByParam = (createdBy === null || createdBy === undefined) ? null : (Number.isInteger(Number(createdBy)) ? Number(createdBy) : null);
                await pool.query(insertText, [qId, activityId, pageName, sectionName, questionText, questionHelper, answerType, category, questionGroup, columnSize, status, q.required || false, options, metadata, createdByParam]);
            }
            return;
        }

        // Otherwise assume a form-definition object with pages->sections->questions
        const formDef = formDefOrQuestions || {};
        for (const page of formDef.pages || []) {
            const pageName = page.name || page.id || null;
            for (const section of page.sections || []) {
                const sectionName = section.name || section.id || null;
                for (const q of section.questions || []) {
                    const qId = q.id || q.questionId || (`q_${activityId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
                    const questionText = q.questionText || q.text || null;
                    const questionHelper = q.questionHelper || q.helper || null;
                    const answerType = q.answerType || q.type || null;
                    const category = q.category || null;
                    const questionGroup = q.questionGroup || null;
                    const columnSize = q.columnSize || null;
                    const status = q.status || 'Active';
                    const options = q.options ? JSON.stringify(q.options) : null;
                    const metadata = q.metadata ? JSON.stringify(q.metadata) : null;
                    let createdBy = q.createdBy || null;
                    const createdByParam = (createdBy === null || createdBy === undefined) ? null : (Number.isInteger(Number(createdBy)) ? Number(createdBy) : null);
                    await pool.query(insertText, [qId, activityId, pageName, sectionName, questionText, questionHelper, answerType, category, questionGroup, columnSize, status, q.required || false, options, metadata, createdByParam]);
                }
            }
        }
    } catch (err) {
        console.error('syncQuestions error:', err);
    }
}



// --- Auth Routes (Dev Mode) ---

// Login Route: Simulates login by finding or creating a user with the specific role
app.post('/auth/login', async (req, res) => {
    const { role, email, password } = req.body;

    try {
        if (email && password) {
            // Authenticate by email/password
            const result = await pool.query('SELECT * FROM dqai_users WHERE email = $1', [email]);
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const user = result.rows[0];
            // Verify password using bcrypt. If the stored password is plaintext, allow fallback and migrate to hashed.
            let passwordMatches = false;
            try {
                if (user.password) {
                    passwordMatches = await bcrypt.compare(password, user.password);
                }
            } catch (e) {
                console.warn('bcrypt compare failed, will attempt plaintext fallback', e);
                passwordMatches = false;
            }

            // Fallback: if stored password was plaintext and matches, migrate it to a bcrypt hash
            if (!passwordMatches && user.password === password) {
                try {
                    const newHash = await bcrypt.hash(password, 10);
                    await pool.query('UPDATE dqai_users SET password = $1 WHERE id = $2', [newHash, user.id]);
                    passwordMatches = true;
                    console.log('Migrated user password to bcrypt hash for user id', user.id);
                } catch (e) {
                    console.error('Failed to migrate plaintext password to hash for user id', user.id, e);
                }
            }

            if (!passwordMatches) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            req.session.userId = user.id;
            // Return sanitized user object (omit password)
            const safeUser = {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                role: user.role,
                status: user.status,
                profileImage: user.profile_image || null
            };
            // Record login in audit_batches for server-side traceability
            try {
                await pool.query('INSERT INTO dqai_audit_batches (user_id, events) VALUES ($1,$2)', [user.id, JSON.stringify([{ type: 'login', email: user.email, success: true, ts: new Date().toISOString(), ip: req.ip }])]);
            } catch (e) { console.error('Failed to write audit login record', e); }
            return res.json(safeUser);
        }

        // Fallback: role-based demo login (keeps old behavior)
        if (!role) return res.status(400).json({ error: 'Missing role' });
        const demoEmail = `${role.toLowerCase().replace(' ', '')}@example.com`;
        let result = await pool.query('SELECT * FROM dqai_users WHERE email = $1', [demoEmail]);

        let user;
        if (result.rows.length > 0) {
            user = result.rows[0];
        } else {
            const insertRes = await pool.query(
                'INSERT INTO dqai_users (first_name, last_name, email, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                ['Demo', role, demoEmail, role, 'Active']
            );
            user = insertRes.rows[0];
        }
        req.session.userId = user.id;
        try {
            await pool.query('INSERT INTO dqai_audit_batches (user_id, events) VALUES ($1,$2)', [user.id || null, JSON.stringify([{ type: 'login', email: user.email || null, success: true, ts: new Date().toISOString(), demo: true, ip: req.ip }])]);
        } catch (e) { console.error('Failed to write audit login record', e); }
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/current_user', async (req, res) => {
    if (!req.session.userId) {
        return res.send(null);
    }
    try {
        const result = await pool.query('SELECT * FROM dqai_users WHERE id = $1', [req.session.userId]);
        if (result.rows.length > 0) {
            // Snake_case to camelCase for frontend consistency
            const u = result.rows[0];
            res.send({
                id: u.id,
                firstName: u.first_name,
                lastName: u.last_name,
                email: u.email,
                role: u.role,
                status: u.status,
                facilityId: u.facility_id,
                profileImage: u.profile_image || null
            });
        } else {
            res.send(null);
        }
    } catch (err) {
        console.error(err);
        res.send(null);
    }
});

app.get('/api/logout', (req, res) => {
    req.session = null;
    res.sendStatus(200);
});

// --- API Routes ---

// Programs
app.get('/api/programs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_programs ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/programs', async (req, res) => {
    const { name, details, type, category, id } = req.body;
    try {
        if (id) {
            const result = await pool.query(
                'UPDATE dqai_programs SET name=$1, details=$2, type=$3, category=$4 WHERE id=$5 RETURNING *',
                [name, details, type, category, id]
            );
            res.json(result.rows[0]);
        } else {
            const result = await pool.query(
                'INSERT INTO dqai_programs (name, details, type, category) VALUES ($1, $2, $3, $4) RETURNING *',
                [name, details, type, category]
            );
            res.json(result.rows[0]);
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/programs/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM dqai_programs WHERE id = $1', [req.params.id]);
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e.message); }
});

// Activities
app.get('/api/activities', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_activities ORDER BY created_at DESC');
        const mapped = result.rows.map(row => ({
            ...row,
            programId: row.program_id,
            startDate: row.start_date,
            endDate: row.end_date,
            responseType: row.response_type || row.responsetype || null,
            formDefinition: row.form_definition || null,
        }));
        res.json(mapped);
    } catch (e) { res.status(500).send(e.message); }
});

// Public: list activities with program and standalone form path for sharing/embed
app.get('/api/public/activity_links', async (req, res) => {
    try {
        const r = await pool.query(`SELECT a.id, a.title, a.program_id, p.name as program_name FROM dqai_activities a LEFT JOIN dqai_programs p ON p.id = a.program_id ORDER BY a.created_at DESC`);
        const rows = (r.rows || []).map(row => ({
            id: row.id,
            title: row.title,
            program_name: row.program_name || null,
            // path to be used with client origin + path (HashRouter expects '#/standalone/fill/:id')
            path: `/#/standalone/fill/${row.id}`
        }));
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: String(e) }); }
});

app.post('/api/activities', async (req, res) => {
    const { title, programId, details, startDate, endDate, category, status, questions, id, createdBy } = req.body;
    try {
        if (id) {
            const result = await pool.query(
                'UPDATE dqai_activities SET title=$1, subtitle=$2, program_id=$3, details=$4, start_date=$5, end_date=$6, response_type=$7, category=$8, status=$9, created_by=$10 WHERE id=$11 RETURNING *',
                [title, req.body.subtitle || null, programId, details, startDate, endDate, req.body.responseType || req.body.response_type || null, category, status, createdBy, id]
            );
            const r = result.rows[0];
            // Persist questions from form definition into questions table
            await syncQuestions(r.id, questions || []);
            res.json({ ...r, programId: r.program_id, startDate: r.start_date, endDate: r.end_date });
        } else {
            const result = await pool.query(
                'INSERT INTO dqai_activities (title, subtitle, program_id, details, start_date, end_date, response_type, category, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
                [title, req.body.subtitle || null, programId, details, startDate, endDate, req.body.responseType || req.body.response_type || null, category, status, createdBy]
            );
            const r = result.rows[0];
            // Persist questions from form definition into questions table
            await syncQuestions(r.id, questions || []);
            res.json({ ...r, programId: r.program_id, startDate: r.start_date, endDate: r.end_date });
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/activities/:id/form', async (req, res) => {
    const { questions } = req.body;
    try {
        // No form_definition column to update; sync the provided questions into questions table
        await syncQuestions(req.params.id, questions || []);
        // Build a compact form_definition grouping by page_name and section_name
        const pagesMap = {};
        for (const q of (questions || [])) {
            const page = q.pageName || q.page_name || q.page || 'Page 1';
            const section = q.sectionName || q.section_name || q.section || 'Section 1';
            pagesMap[page] = pagesMap[page] || {};
            pagesMap[page][section] = pagesMap[page][section] || [];
            // keep necessary fields for formDefinition
            pagesMap[page][section].push({
                id: q.id,
                questionText: q.questionText || q.question_text || q.text || null,
                questionHelper: q.questionHelper || q.question_helper || null,
                answerType: q.answerType || q.answer_type || null,
                columnSize: q.columnSize || q.column_size || null,
                required: q.required || false,
                status: q.status || 'Active',
                options: q.options || null,
                metadata: q.metadata || null,
                fieldName: q.fieldName || q.field_name || null
            });
        }
        const pages = Object.entries(pagesMap).map(([pName, sectionsObj], idx) => ({
            id: `page${idx + 1}`,
            name: pName,
            sections: Object.entries(sectionsObj).map(([sName, qs], sidx) => ({ id: `sec${sidx + 1}`, name: sName, questions: qs }))
        }));
        const formDefinition = { id: `fd-${req.params.id}`, activityId: Number(req.params.id), pages };
        await pool.query('UPDATE dqai_activities SET form_definition = $1 WHERE id = $2', [formDefinition, req.params.id]);
        const updated = (await pool.query('SELECT * FROM dqai_activities WHERE id = $1', [req.params.id])).rows[0];
        res.json({ ...updated, formDefinition: updated.form_definition });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/activities/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM dqai_activities WHERE id = $1', [req.params.id]);
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e.message); }
});

// Facilities
app.get('/api/facilities', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_facilities ORDER BY name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/facilities', async (req, res) => {
    const { name, state, lga, address, category, id } = req.body;
    try {
        if (id) {
            const result = await pool.query(
                'UPDATE dqai_facilities SET name=$1, state=$2, lga=$3, address=$4, category=$5 WHERE id=$6 RETURNING *',
                [name, state, lga, address, category, id]
            );
            res.json(result.rows[0]);
        } else {
            const result = await pool.query(
                'INSERT INTO dqai_facilities (name, state, lga, address, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [name, state, lga, address, category]
            );
            res.json(result.rows[0]);
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/facilities/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM dqai_facilities WHERE id = $1', [req.params.id]);
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e.message); }
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_users ORDER BY created_at DESC');
        const mapped = result.rows.map(r => ({
            ...r,
            firstName: r.first_name,
            lastName: r.last_name,
            profileImage: r.profile_image || null
        }));
        res.json(mapped);
    } catch (e) { res.status(500).send(e.message); }
});

// Create or update user
app.post('/api/users', async (req, res) => {
    const { id, firstName, lastName, email, role, status, phoneNumber, password, facilityId, profileImage } = req.body;
    try {
        // If password provided, hash it before persisting
        let hashedPassword = null;
        if (password) {
            try {
                hashedPassword = await bcrypt.hash(password, 10);
            } catch (e) {
                console.error('Failed to hash provided password for user:', e);
                // fallback to storing plaintext (not ideal) if hashing fails
                hashedPassword = password;
            }
        }

        if (id) {
            const result = await pool.query(
                'UPDATE dqai_users SET first_name=$1, last_name=$2, email=$3, role=$4, status=$5, password=$6, facility_id=$7, profile_image=$8 WHERE id=$9 RETURNING *',
                [firstName, lastName, email, role, status, hashedPassword || null, facilityId || null, profileImage || null, id]
            );
            const u = result.rows[0];
            res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, status: u.status, profileImage: u.profile_image || null });
        } else {
            const result = await pool.query(
                'INSERT INTO dqai_users (first_name, last_name, email, role, status, password, facility_id, profile_image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
                [firstName, lastName, email, role, status, hashedPassword || null, facilityId || null, profileImage || null]
            );
            const u = result.rows[0];
            res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, status: u.status, profileImage: u.profile_image || null });
        }
    } catch (e) { console.error(e); res.status(500).send(e.message); }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        // remove role assignments
        await pool.query('DELETE FROM dqai_user_roles WHERE user_id = $1', [id]);
        await pool.query('DELETE FROM dqai_users WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) { console.error('Failed to delete user', e); res.status(500).json({ error: 'Failed to delete user' }); }
});

// Reports
app.get('/api/reports', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_activity_reports ORDER BY submission_date DESC');
        const mapped = result.rows.map(r => ({
            ...r,
            activityId: r.activity_id,
            userId: r.user_id,
            facilityId: r.facility_id,
            submissionDate: r.submission_date,
            reviewersReport: r.reviewers_report,
            overallScore: r.overall_score,
            reportedBy: r.reported_by
        }));
        res.json(mapped);
    } catch (e) { res.status(500).send(e.message); }
});

// Get a single report by id
app.get('/api/reports/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dqai_activity_reports WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).send('Report not found');
        const r = result.rows[0];
        res.json({
            ...r,
            activityId: r.activity_id,
            userId: r.user_id,
            facilityId: r.facility_id,
            submissionDate: r.submission_date,
            reviewersReport: r.reviewers_report,
            overallScore: r.overall_score,
            reportedBy: r.reported_by
        });
    } catch (e) { res.status(500).send(e.message); }
});

// Update a report (reviewers_report, overall_score, status)
app.put('/api/reports/:id', async (req, res) => {
    try {
        const { reviewers_report, overall_score, status } = req.body || {};
        const fields = [];
        const params = [];
        let idx = 1;
        if (reviewers_report !== undefined) { fields.push(`reviewers_report = $${idx++}`); params.push(reviewers_report); }
        if (overall_score !== undefined) { fields.push(`overall_score = $${idx++}`); params.push(overall_score); }
        if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
        if (fields.length === 0) return res.status(400).send('No fields to update');
        params.push(req.params.id);
        const sql = `UPDATE dqai_activity_reports SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await pool.query(sql, params);
        if (result.rowCount === 0) return res.status(404).send('Report not found');
        const r = result.rows[0];
        res.json({
            ...r,
            activityId: r.activity_id,
            userId: r.user_id,
            facilityId: r.facility_id,
            submissionDate: r.submission_date,
            reviewersReport: r.reviewers_report,
            overallScore: r.overall_score,
            reportedBy: r.reported_by
        });
    } catch (e) { res.status(500).send(e.message); }
});

// Accept base64 media uploads for reviews (images/videos). Body: { reportId, filename, contentBase64, mimeType }
app.post('/api/review_uploads', async (req, res) => {
    try {
        const { reportId, filename, contentBase64, mimeType } = req.body || {};
        if (!reportId || !filename || !contentBase64) return res.status(400).send('Missing parameters');
        const safeReportId = String(reportId).replace(/[^a-zA-Z0-9-_\.]/g, '_');
        const folder = path.join(uploadsRoot, 'reports', String(safeReportId));
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const ts = Date.now();
        const ext = path.extname(filename) || '';
        const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_\.]/g, '_');
        const savedName = `${ts}_${baseName}${ext}`;
        const filePath = path.join(folder, savedName);
        // contentBase64 may be a data URL or raw base64
        let base64 = contentBase64;
        const comma = base64.indexOf(',');
        if (comma !== -1) base64 = base64.slice(comma + 1);
        const buf = Buffer.from(base64, 'base64');
        fs.writeFileSync(filePath, buf);
        const publicUrl = `${req.protocol}://${req.get('host')}/uploads/reports/${encodeURIComponent(String(safeReportId))}/${encodeURIComponent(savedName)}`;
        res.json({ url: publicUrl, path: filePath });
    } catch (e) {
        console.error('review_uploads error', e);
        res.status(500).send(e.message);
    }
});

// Delete a report and its associated uploaded docs and media files
app.delete('/api/reports/:id', async (req, res) => {
    const id = req.params.id;
    try {
        // delete uploaded_docs rows and filesystem
        await pool.query('DELETE FROM dqai_uploaded_docs WHERE report_id = $1', [id]);
        const folder = path.join(uploadsRoot, 'reports', String(id));
        try { if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true }); } catch (e) { console.error('Failed to remove upload folder', e); }

        // delete the report (answers cascade if DB has FK)
        const result = await pool.query('DELETE FROM dqai_activity_reports WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) return res.status(404).send('Report not found');
        res.json({ ok: true });
    } catch (e) {
        console.error('Failed to delete report', e);
        res.status(500).send(e.message);
    }
});

// Get uploaded_docs by activityId or facilityId or userId
app.get('/api/uploaded_docs', async (req, res) => {
    const { activityId, facilityId, userId } = req.query;
    const reportId = req.query.reportId;
    try {
        const clauses = [];
        const params = [];
        let idx = 1;
        if (reportId) { clauses.push(`report_id = $${idx++}`); params.push(reportId); }
        if (activityId) { clauses.push(`activity_id = $${idx++}`); params.push(activityId); }
        if (facilityId) { clauses.push(`facility_id = $${idx++}`); params.push(facilityId); }
        if (userId) { clauses.push(`user_id = $${idx++}`); params.push(userId); }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const sql = `SELECT * FROM dqai_uploaded_docs ${where} ORDER BY created_at DESC`;
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

// Questions endpoint: get questions by activity
app.get('/api/questions', async (req, res) => {
    const { activityId } = req.query;
    try {
        if (!activityId) return res.status(400).send('Missing activityId');
        const result = await pool.query('SELECT * FROM dqai_questions WHERE activity_id = $1 ORDER BY created_at ASC', [activityId]);
        res.json(result.rows.map(q => ({
            id: q.id,
            activityId: q.activity_id,
            pageName: q.page_name,
            sectionName: q.section_name,
            questionText: q.question_text,
            questionHelper: q.question_helper,
            answerType: q.answer_type,
            category: q.category,
            questionGroup: q.question_group,
            columnSize: q.column_size,
            status: q.status,
            options: q.options,
            metadata: q.metadata,
            createdBy: q.created_by
        })));
    } catch (e) { res.status(500).send(e.message); }
});

// Answers endpoint: query by activityId, reportId, facilityId
app.get('/api/answers', async (req, res) => {
    const { activityId, reportId, facilityId } = req.query;
    try {
        const clauses = [];
        const params = [];
        let idx = 1;
        if (reportId) { clauses.push(`report_id = $${idx++}`); params.push(reportId); }
        if (activityId) { clauses.push(`activity_id = $${idx++}`); params.push(activityId); }
        if (facilityId) { clauses.push(`facility_id = $${idx++}`); params.push(facilityId); }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const sql = `SELECT * FROM dqai_answers ${where} ORDER BY created_at DESC`;
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

// Activity dashboard aggregation endpoint
app.get('/api/activity_dashboard/:activityId', async (req, res) => {
    const { activityId } = req.params;
    try {
        const activityRes = await pool.query('SELECT * FROM dqai_activities WHERE id = $1', [activityId]);
        if (activityRes.rowCount === 0) return res.status(404).send('Activity not found');
        const activity = activityRes.rows[0];

        const questionsRes = await pool.query('SELECT * FROM dqai_questions WHERE activity_id = $1 ORDER BY created_at ASC', [activityId]);
        const questions = questionsRes.rows;

        const reportsRes = await pool.query('SELECT * FROM dqai_activity_reports WHERE activity_id = $1 ORDER BY submission_date DESC', [activityId]);
        const reports = reportsRes.rows;

        const answersRes = await pool.query('SELECT * FROM dqai_answers WHERE activity_id = $1 ORDER BY created_at DESC', [activityId]);
        const answers = answersRes.rows;

        const docsRes = await pool.query('SELECT * FROM dqai_uploaded_docs WHERE activity_id = $1 ORDER BY created_at DESC', [activityId]);
        const uploadedDocs = docsRes.rows;

        // Simple aggregation: counts per question id
        const answersByQuestion = {};
        for (const a of answers) {
            const q = a.question_id || 'unknown';
            answersByQuestion[q] = answersByQuestion[q] || [];
            answersByQuestion[q].push(a);
        }

        res.json({ activity, questions, reports, answers, answersByQuestion, uploadedDocs });
    } catch (e) {
        console.error('activity_dashboard error', e);
        res.status(500).send(e.message);
    }
});

// Update question follow-up (quality_improvement_followup) and other fields
app.put('/api/questions/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body || {};
    const allowed = ['status'];
    const setParts = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            setParts.push(`${key} = $${idx++}`);
            params.push(updates[key]);
        }
    }
    if (setParts.length === 0) return res.status(400).send('No updatable fields provided');
    params.push(id);
    const sql = `UPDATE dqai_questions SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`;
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows[0]);
    } catch (e) {
        console.error('Failed to update question', e);
        res.status(500).send(e.message);
    }
});

// Update an answer's reviewer fields (reviewers_comment, quality_improvement_followup, score)
app.put('/api/answers/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body || {};
    const allowed = ['reviewers_comment', 'quality_improvement_followup', 'score', 'status'];
    const setParts = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            setParts.push(`${key} = $${idx++}`);
            params.push(updates[key]);
        }
    }
    if (setParts.length === 0) return res.status(400).send('No updatable fields provided');
    params.push(id);
    const sql = `UPDATE dqai_answers SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`;
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows[0]);
    } catch (e) {
        console.error('Failed to update answer', e);
        res.status(500).send(e.message);
    }
});

// Update a single cell in an uploaded_docs file_content JSONB (rowIndex, colKey, newValue)
app.put('/api/uploaded_docs/:id', async (req, res) => {
    const { id } = req.params;
    const { rowIndex, colKey, newValue } = req.body;
    try {
        const docRes = await pool.query('SELECT * FROM dqai_uploaded_docs WHERE id = $1', [id]);
        if (docRes.rowCount === 0) return res.status(404).json({ error: 'uploaded_doc not found' });
        const doc = docRes.rows[0];
        const content = doc.file_content || [];
        if (!Array.isArray(content)) return res.status(400).json({ error: 'file_content must be an array of rows' });
        if (typeof rowIndex !== 'number' || rowIndex < 0 || rowIndex >= content.length) return res.status(400).json({ error: 'rowIndex out of range' });
        const row = content[rowIndex] || {};
        row[colKey] = newValue;
        content[rowIndex] = row;
        await pool.query('UPDATE dqai_uploaded_docs SET file_content = $1 WHERE id = $2', [JSON.stringify(content), id]);
        res.json({ success: true, file_content: content });
    } catch (err) {
        console.error('Failed to update uploaded_doc', err);
        res.status(500).json({ error: 'Failed to update uploaded_doc' });
    }
});

// Delete an uploaded doc by id
app.delete('/api/uploaded_docs/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const docRes = await pool.query('SELECT * FROM dqai_uploaded_docs WHERE id = $1', [id]);
        if (docRes.rowCount === 0) return res.status(404).json({ error: 'uploaded_doc not found' });
        await pool.query('DELETE FROM dqai_uploaded_docs WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Failed to delete uploaded_doc', e);
        res.status(500).json({ error: 'Failed to delete uploaded_doc' });
    }
});

app.post('/api/reports', async (req, res) => {
    const { activityId, userId, facilityId, status, answers, uploadedFiles } = req.body;
    try {
        // Validate entity linking per activity response type
        try {
            const actRes = await pool.query('SELECT response_type FROM dqai_activities WHERE id = $1', [activityId]);
            if (actRes.rowCount === 0) return res.status(400).send('Invalid activityId');
            const respType = (actRes.rows[0].response_type || '').toString().toLowerCase();
            if (respType === 'facility' && !facilityId) return res.status(400).send('facilityId is required for this activity');
            if (respType === 'user' && !userId) return res.status(400).send('userId is required for this activity');
        } catch (err) {
            console.error('Failed to validate activity response type', err);
        }
        // Insert report row
        const result = await pool.query(
            'INSERT INTO dqai_activity_reports (activity_id, user_id, facility_id, status, answers) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [activityId, userId, facilityId, status, answers || null]
        );
        const report = result.rows[0];

        // Persist uploaded files into uploaded_docs table (one row per file)
        try {
            if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
                for (const file of uploadedFiles) {
                    try {
                        const filename = file.name || file.filename || file.fileName || null;
                        const content = file.content || file.data || file; // expect JSON-able representation
                        await pool.query('INSERT INTO dqai_uploaded_docs (activity_id, facility_id, user_id, uploaded_by, report_id, file_content, filename) VALUES ($1,$2,$3,$4,$5,$6,$7)', [activityId, facilityId, userId || null, req.session.userId || null, report.id, JSON.stringify(content), filename]);
                    } catch (e) {
                        console.error('Failed to persist uploaded file', e);
                    }
                }
            }
        } catch (e) {
            console.error('Error persisting uploaded files:', e);
        }

        // Persist individual answers to the answers table for querying
        try {
            if (answers && typeof answers === 'object') {
                for (const [qId, val] of Object.entries(answers)) {
                    try {
                        // support val as primitive or object { value, reviewersComment, qualityImprovementFollowup, score }
                        let answerVal = val;
                        let reviewersComment = null;
                        let qiFollowup = null;
                        let score = null;
                        if (val && typeof val === 'object' && !(val instanceof Array)) {
                            if (Object.prototype.hasOwnProperty.call(val, 'value')) answerVal = val.value;
                            reviewersComment = val.reviewersComment || val.reviewers_comment || null;
                            qiFollowup = val.qualityImprovementFollowup || val.quality_improvement_followup || null;
                            score = (typeof val.score !== 'undefined') ? val.score : null;
                        }
                        await pool.query('INSERT INTO dqai_answers (report_id, activity_id, question_id, answer_value, facility_id, user_id, recorded_by, answer_datetime, reviewers_comment, quality_improvement_followup, score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [report.id, activityId, qId, JSON.stringify(answerVal), facilityId || null, userId || null, req.session.userId || null, new Date(), reviewersComment, qiFollowup, score]);
                    } catch (e) {
                        console.error('Failed to insert answer for question', qId, e);
                    }
                }
            }
        } catch (e) {
            console.error('Error persisting answers:', e);
        }

        res.json(report);
    } catch (e) { res.status(500).send(e.message); }
});

// Initialize DB then start server
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize database. Server not started.', err);
        process.exit(1);
    });