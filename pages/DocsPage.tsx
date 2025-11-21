import React from 'react';

const DocsPage: React.FC = () => {
    return (
        <div className="flex h-full">
            <aside className="w-64 border-r bg-white p-4 overflow-y-auto sticky top-0 h-screen">
                <h2 className="text-lg font-semibold mb-4">Docs</h2>
                <nav className="space-y-2 text-sm">
                    {['getting-started', 'installation', 'run-dev', 'frontend', 'backend', 'api-reference', 'llm-rag', 'activities', 'excel-import', 'security', 'troubleshooting', 'faq', 'contact'].map(id => (
                        <a key={id} href={`#/docs#${id}`} className="block text-gray-700 hover:text-primary-600" onClick={(e) => { e.preventDefault(); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>{id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</a>
                    ))}
                </nav>
            </aside>

            <main className="flex-1 p-8 overflow-y-auto">
                <header className="mb-6">
                    <h1 className="text-3xl font-bold">Intelliform — Documentation</h1>
                    <p className="text-sm text-gray-600 mt-1">Complete developer and user guide for installing, running, integrating, and extending Intelliform.</p>
                </header>

                <section id="getting-started" className="mb-8">
                    <h2 className="text-2xl font-semibold">Getting Started</h2>
                    <p className="mt-2">This guide helps you run Intelliform locally for development and understand the main concepts: Activities, Forms, RAG schemas, and the LLM SQL assistant.</p>
                </section>

                <section id="installation" className="mb-8">
                    <h3 className="text-xl font-semibold">Installation</h3>
                    <p className="mt-2">Clone the repository and install dependencies for both frontend and backend.</p>
                    <pre className="mt-3 p-4 bg-gray-100 rounded text-sm overflow-auto">{`git clone <repo-url>
cd intelliform
npm install
`}</pre>
                    <p className="mt-2">Environment: create a `.env` file for the server with DB and SMTP settings. Example keys:</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`DATABASE_URL=postgres://user:pass@localhost:5432/intelliform
PORT=3000
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=secret
`}</pre>
                </section>

                <section id="run-dev" className="mb-8">
                    <h3 className="text-xl font-semibold">Running (Dev)</h3>
                    <p className="mt-2">Start frontend and server in separate terminals:</p>
                    <pre className="mt-3 p-4 bg-gray-100 rounded text-sm overflow-auto">{`# frontend (Vite)
npm run dev

# server (Express)
npm run start:server
`}</pre>
                    <p className="mt-2">If your server runs on a different port, adjust API calls accordingly. In development the frontend may proxy requests to the server.</p>
                </section>

                <section id="frontend" className="mb-8">
                    <h3 className="text-xl font-semibold">Frontend</h3>
                    <p className="mt-2">Built with React + Vite and TypeScript. Key pages:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li><strong>`pages/BuildFormPage.tsx`</strong> — form builder and bulk import.</li>
                        <li><strong>`pages/FillFormPage.tsx`</strong> — standalone form renderer for collecting responses.</li>
                        <li><strong>`pages/ActivitiesPage.tsx`</strong> — list, create, and manage activities (sharing, QR, embed planned).</li>
                        <li><strong>`pages/SettingsPage.tsx`</strong> — RAG manager and provider settings.</li>
                    </ul>
                </section>

                <section id="backend" className="mb-8">
                    <h3 className="text-xl font-semibold">Backend</h3>
                    <p className="mt-2">Node.js + Express with Postgres. The server exposes APIs under `/api/*`. The database uses `dqai_`-prefixed tables for RAG and bookkeeping.</p>
                    <p className="mt-2">Important files:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li><strong>`server/index.js`</strong> — initializes DB, RAG persistence, provider dispatch, Chromadb bookkeeping, and exposes LLM & SQL endpoints.</li>
                    </ul>
                </section>

                <section id="api-reference" className="mb-8">
                    <h3 className="text-xl font-semibold">API Reference</h3>
                    <p className="mt-2">The following examples use <code>http://localhost:3000</code> as the server base URL — replace the host/port as needed.</p>

                    <h4 className="mt-4 font-semibold">GET /api/public/activity_links</h4>
                    <p className="mt-2">Returns a list of activities with a client-side path for the standalone form.</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`curl --request GET 'http://localhost:3000/api/public/activity_links'

Response:
[
    {
        "id": 123,
        "title": "Site Inspection",
        "program_name": "Safety",
        "path": "#/standalone/fill/123"
    }
]
`}</pre>

                    <h4 className="mt-4 font-semibold">POST /api/llm/generate_sql</h4>
                    <p className="mt-2">Ask the LLM to generate a read-only SQL query given a natural language prompt. The response includes an explanation ('think first') and a constrained SQL string. Example:</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`curl --request POST 'http://localhost:3000/api/llm/generate_sql' \
    --header 'Content-Type: application/json' \
    --data-raw '{"prompt":"List all activities for program Safety with their start and end dates","provider":"local-ollama"}'

Response:
{
    "text": "I will use the dqai_activities and dqai_programs tables...\n\nAction to Be Taken:\nSELECT a.id, a.title, a.start_date FROM dqai_activities a JOIN dqai_programs p ON p.id=a.program_id WHERE p.name='Safety' LIMIT 100;",
    "sql": "SELECT ...",
    "ragTables": ["dqai_activities","dqai_programs"],
    "providerUsed": "local-ollama"
}
`}</pre>

                    <h4 className="mt-4 font-semibold">POST /api/execute_sql</h4>
                    <p className="mt-2">Executes a read-only SQL query (SELECT only). The server enforces read-only and a single statement. Example:</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`curl --request POST 'http://localhost:3000/api/execute_sql' \
    --header 'Content-Type: application/json' \
    --data-raw '{"sql":"SELECT id, title FROM dqai_activities LIMIT 10"}'

Response:
{
    "rows": [ { "id": 1, "title": "Site Inspection" }, ... ]
}
`}</pre>

                    <h4 className="mt-4 font-semibold">RAG Admin Endpoints</h4>
                    <p className="mt-2">Manage RAG schemas (persisted contexts used for SQL generation and RAG searches):</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`GET /api/admin/rag_schemas
POST /api/admin/rag_schemas  { table_name, schema: {...}, sample_rows: [...] }
DELETE /api/admin/rag_schemas/:id
`}</pre>
                </section>

                <section id="llm-rag" className="mb-8">
                    <h3 className="text-xl font-semibold">RAG & LLM SQL Flow</h3>
                    <p className="mt-2">High-level behavior:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li>The server persists RAG schemas into <code>dqai_rag_schemas</code> with table/column info and sample rows (truncated).</li>
                        <li>When generating SQL, the LLM is given the available tables and columns and asked to "think first" — returning an explanation and a constrained SQL statement only using known fields/tables.</li>
                        <li>By default the SQL is read-only; execution is performed via <code>/api/execute_sql</code> that enforces SELECT-only semantics.</li>
                        <li>Chroma indexing is optional; sample rows may be pushed to Chromadb and tracked in <code>dqai_rag_chroma_ids</code>.</li>
                    </ul>
                </section>

                <section id="activities" className="mb-8">
                    <h3 className="text-xl font-semibold">Activities — Sharing, QR, Embed</h3>
                    <p className="mt-2">Each activity has a standalone client-side route: </p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`https://your-host.example.com/#/standalone/fill/<activityId>`}</pre>
                    <p className="mt-2">Embed as an iframe (example):</p>
                    <pre className="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">{`<iframe src="https://your-host.example.com/#/standalone/fill/<activityId>" width="800" height="900"></iframe>`}</pre>
                    <p className="mt-2">Suggested UI controls in Activities list:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li>Copy link (clipboard) — full origin + path</li>
                        <li>Generate QR — encode the full URL</li>
                        <li>Embed modal — provide iframe snippet to copy</li>
                    </ul>
                </section>

                <section id="excel-import" className="mb-8">
                    <h3 className="text-xl font-semibold">Excel Bulk Import (questions template)</h3>
                    <p className="mt-2">The import expects a `.xlsx` workbook with two sheets: <code>questions</code> and <code>options</code>. Columns include:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li><code>label</code>, <code>type</code>, <code>options_key</code>, <code>score</code>, <code>reviewers_comment</code>, <code>group_name</code>, and others.</li>
                    </ul>
                    <p className="mt-2">The frontend generates a sample template via ExcelJS (see Build Form page).</p>
                </section>

                <section id="security" className="mb-8">
                    <h3 className="text-xl font-semibold">Security & Best Practices</h3>
                    <ul className="list-disc list-inside mt-2">
                        <li>SQL execution endpoint is read-only and validates single-statement SELECT queries only.</li>
                        <li>Do not expose provider credentials in client-side code.</li>
                        <li>Use HTTPS in production and secure SMTP credentials upstream.</li>
                    </ul>
                </section>

                <section id="troubleshooting" className="mb-8">
                    <h3 className="text-xl font-semibold">Troubleshooting</h3>
                    <p className="mt-2">Common issues and fixes:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li><strong>Dropdowns not showing:</strong> Remove Materialize CSS/JS (conflicts with Tailwind). This app already removed those includes.</li>
                        <li><strong>Excel template download broken:</strong> Use the client-side ExcelJS generator (already implemented).</li>
                        <li><strong>JSONB insert errors:</strong> Ensure objects are stringified before database bind parameters.</li>
                    </ul>
                </section>

                <section id="faq" className="mb-8">
                    <h3 className="text-xl font-semibold">FAQ</h3>
                    <p className="mt-2"><strong>Q:</strong> How do I change the LLM provider?<br /><strong>A:</strong> Use the Settings page to add or reorder providers. The server will attempt local Ollama first if configured.</p>
                </section>

                <section id="contact" className="mb-8">
                    <h3 className="text-xl font-semibold">Contact & Contribution</h3>
                    <p className="mt-2">For contributions, open pull requests against the repository. For runtime issues, check server logs and restart the server after config changes.</p>
                </section>
            </main>
        </div>
    );
};

export default DocsPage;
