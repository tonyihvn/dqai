const AUDIT_KEY = 'dqai_audit_events';

export function addAuditEvent(event: any) {
    try {
        const raw = localStorage.getItem(AUDIT_KEY) || '[]';
        const arr = JSON.parse(raw);
        arr.push({ ...event, ts: new Date().toISOString() });
        localStorage.setItem(AUDIT_KEY, JSON.stringify(arr));
    } catch (e) {
        console.error('Failed to add audit event to localStorage', e);
    }
}

export async function flushAudit(userId?: number) {
    try {
        const raw = localStorage.getItem(AUDIT_KEY) || '[]';
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) return { ok: true, pushed: 0 };
        const payload = { userId: userId || null, events: arr };
        const res = await fetch('/api/audit/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
        if (res.ok) {
            localStorage.removeItem(AUDIT_KEY);
            return { ok: true, pushed: arr.length };
        }
        const txt = await res.text();
        console.error('Failed to flush audit:', txt);
        return { ok: false, error: txt };
    } catch (e) {
        console.error('Failed to flush audit', e);
        return { ok: false, error: String(e) };
    }
}

export function getPendingAuditCount() {
    try {
        const raw = localStorage.getItem(AUDIT_KEY) || '[]';
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.length : 0;
    } catch (e) { return 0; }
}
