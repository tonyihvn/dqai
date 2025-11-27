import React, { useEffect, useState, useRef } from 'react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import TreeJsonEditor from '../components/ui/TreeJsonEditor';

const RelList: React.FC<{ raw: any, paths: string[] }> = ({ raw, paths }) => {
  const getByPath = (raw: any, path: string) => {
    try {
      if (!path || path === '') return raw;
      const parts = path.split('.');
      let cur = raw;
      for (const p of parts) {
        if (!cur) return null;
        cur = cur[p];
      }
      return cur;
    } catch (e) { return null; }
  };
  const getArrayForPath = (raw: any, path: string) => {
    try {
      if (!raw) return [];
      if (!path) return Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      const val = getByPath(raw, path);
      return Array.isArray(val) ? val : [];
    } catch (e) { return []; }
  };

  const relations: string[] = [];
  try {
    for (const parent of paths) {
      const parr = getArrayForPath(raw, parent) || [];
      const pfirst = parr.length > 0 ? parr[0] : null;
      const parentName = (parent || '').split('.').slice(-1)[0] || '';
      const singular = parentName.endsWith('s') ? parentName.slice(0, -1) : parentName;
      const parentIdCandidates = new Set<string>();
      if (pfirst && typeof pfirst === 'object') Object.keys(pfirst).forEach(k => parentIdCandidates.add(k));
      parentIdCandidates.add('id');

      for (const child of paths) {
        if (child === parent) continue;
        const carr = getArrayForPath(raw, child) || [];
        const cfirst = carr.length > 0 ? carr[0] : null;
        if (!cfirst || typeof cfirst !== 'object') continue;
        const ckeys = Object.keys(cfirst);
        // heuristics: look for fk keys in child that reference parent
        const fkCandidates = [ `${parentName}_id`, `${singular}_id`, `${parentName}Id`, `${singular}Id`, 'parent_id', 'parentId' ];
        const found = fkCandidates.find(fk => ckeys.includes(fk));
        if (found) relations.push(`${parent || '(root)'} → ${child} via ${found}`);
        else {
          // try matching if child has a key equal to any parent id key
          for (const pk of Array.from(parentIdCandidates)) {
            const alt = `${pk}`;
            if (ckeys.includes(alt)) { relations.push(`${parent || '(root)'} → ${child} via ${alt}`); break; }
          }
        }
      }
    }
  } catch (e) { /* ignore */ }

  if (relations.length === 0) return <div className="text-sm text-gray-500">No relationships detected automatically.</div>;
  return (
    <div className="space-y-1">
      {relations.map((r, idx) => <div key={idx} className="text-sm">{r}</div>)}
    </div>
  );
};

const JsonEditor: React.FC<{ value: any, onChange: (v: any) => void }> = ({ value, onChange }) => {
  return <TreeJsonEditor value={value} onChange={onChange} editable={true} />;
};

const ApiConnectorsPage: React.FC = () => {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [ingests, setIngests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ name: '', base_url: '', method: 'GET', auth_config: null, auth_type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' });
  const [editingConnector, setEditingConnector] = useState<any>(null);
  const [connectorModalOpen, setConnectorModalOpen] = useState(false);
  const [ingestViewerOpen, setIngestViewerOpen] = useState(false);
  const [selectedIngest, setSelectedIngest] = useState<any>(null);
  const [selectedArrayPath, setSelectedArrayPath] = useState<string>('');
  const [ingestArrayPaths, setIngestArrayPaths] = useState<string[]>([]);
  const [showAllArrays, setShowAllArrays] = useState<boolean>(false);
  const [editableRows, setEditableRows] = useState<any[] | null>(null);
  const [editingPath, setEditingPath] = useState<string>('');
  const [jsonViewerOpen, setJsonViewerOpen] = useState(false);
  const [jsonViewerContent, setJsonViewerContent] = useState<any>(null);
  const [jsonViewerEditable, setJsonViewerEditable] = useState(false);
  const [jsonViewerIngestId, setJsonViewerIngestId] = useState<number | null>(null);
  const [expandedNestedRows, setExpandedNestedRows] = useState<Set<string>>(new Set());
  const tableRefsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlight, setHighlight] = useState<{ path: string; rowIndex: number } | null>(null);
  const highlightTimer = useRef<number | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/api_connectors', { credentials: 'include' });
      if (res.ok) setConnectors(await res.json());
      const ir = await fetch('/api/api_ingests', { credentials: 'include' });
      if (ir.ok) setIngests(await ir.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload: any = { ...form };
      try {
        if (form.auth_type === 'none') payload.auth_config = null;
        else if (form.auth_type === 'bearer') payload.auth_config = JSON.stringify({ type: 'bearer', token: form.bearerToken || '' });
        else if (form.auth_type === 'basic') payload.auth_config = JSON.stringify({ type: 'basic', username: form.basicUsername || '', password: form.basicPassword || '' });
        else if (form.auth_config && typeof form.auth_config !== 'string') payload.auth_config = JSON.stringify(form.auth_config);
      } catch (e) { /* ignore */ }
      const res = await fetch('/api/api_connectors', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setForm({ name: '', base_url: '', method: 'GET', auth_config: null, auth_type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' });
        await load();
      } else {
        alert('Failed to save connector');
      }
    } catch (e) { console.error(e); alert('Failed to save connector'); }
  };

  const openEdit = async (id?: number) => {
    if (!id) {
      setEditingConnector({ name: '', base_url: '', method: 'GET', auth_config: null, expected_format: 'json', auth_type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' });
      setConnectorModalOpen(true);
      return;
    }
    try {
      const r = await fetch(`/api/api_connectors/${id}`, { credentials: 'include' });
      if (!r.ok) { alert('Failed to load connector'); return; }
      const j = await r.json();
      // parse auth_config if string
      try { j.auth_config = j.auth_config ? (typeof j.auth_config === 'string' ? JSON.parse(j.auth_config) : j.auth_config) : null; } catch (e) { j.auth_config = j.auth_config; }
      // derive structured auth fields
      const ec: any = { ...j, auth_type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };
      try {
        if (ec.auth_config && typeof ec.auth_config === 'object') {
          if (ec.auth_config.type === 'bearer' || ec.auth_config.token) { ec.auth_type = 'bearer'; ec.bearerToken = ec.auth_config.token || ec.auth_config.bearerToken || ''; }
          else if (ec.auth_config.type === 'basic' || ec.auth_config.username) { ec.auth_type = 'basic'; ec.basicUsername = ec.auth_config.username || ''; ec.basicPassword = ec.auth_config.password || ''; }
        } else if (ec.auth_config && typeof ec.auth_config === 'string') {
          // raw string -> attempt to detect bearer
          if (ec.auth_config.startsWith('Bearer ')) { ec.auth_type = 'bearer'; ec.bearerToken = ec.auth_config.substring(7); }
        }
      } catch (e) { /* ignore */ }
      setEditingConnector(ec);
      setConnectorModalOpen(true);
    } catch (e) { console.error(e); alert('Failed to load connector'); }
  };

  // Open edit modal using a local connector object first for snappy UI,
  // then refresh from server to populate any missing sensitive fields.
  const openEditFromList = async (c: any) => {
    try {
      const j = { ...c };
      try { j.auth_config = j.auth_config ? (typeof j.auth_config === 'string' ? JSON.parse(j.auth_config) : j.auth_config) : null; } catch (e) { j.auth_config = j.auth_config; }
      const ec: any = { ...j, auth_type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };
      try {
        if (ec.auth_config && typeof ec.auth_config === 'object') {
          if (ec.auth_config.type === 'bearer' || ec.auth_config.token) { ec.auth_type = 'bearer'; ec.bearerToken = ec.auth_config.token || ec.auth_config.bearerToken || ''; }
          else if (ec.auth_config.type === 'basic' || ec.auth_config.username) { ec.auth_type = 'basic'; ec.basicUsername = ec.auth_config.username || ''; ec.basicPassword = ec.auth_config.password || ''; }
        } else if (ec.auth_config && typeof ec.auth_config === 'string') {
          if (ec.auth_config.startsWith('Bearer ')) { ec.auth_type = 'bearer'; ec.bearerToken = ec.auth_config.substring(7); }
        }
      } catch (e) { /* ignore */ }
      setEditingConnector(ec);
      setConnectorModalOpen(true);
      // refresh from server in background to populate any secure fields
      try { await openEdit(c.id); } catch (e) { /* ignore */ }
    } catch (e) { console.error(e); openEdit(c.id); }
  };

  const saveEditing = async () => {
    try {
      const payload = { ...editingConnector };
      // build auth_config from structured fields if present
      try {
        if (editingConnector) {
          if (editingConnector.auth_type === 'none') payload.auth_config = null;
          else if (editingConnector.auth_type === 'bearer') payload.auth_config = JSON.stringify({ type: 'bearer', token: editingConnector.bearerToken || '' });
          else if (editingConnector.auth_type === 'basic') payload.auth_config = JSON.stringify({ type: 'basic', username: editingConnector.basicUsername || '', password: editingConnector.basicPassword || '' });
          else if (editingConnector.auth_config && typeof editingConnector.auth_config !== 'string') payload.auth_config = JSON.stringify(editingConnector.auth_config);
        }
      } catch (e) { /* ignore */ }
      const res = await fetch('/api/api_connectors', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { alert('Failed to save connector'); return; }
      setConnectorModalOpen(false);
      await load();
    } catch (e) { console.error(e); alert('Failed to save connector'); }
  };

  const deleteConnector = async (id: number) => {
    if (!confirm('Delete connector? This will remove its configuration and cannot be undone.')) return;
    try {
      const r = await fetch(`/api/api_connectors/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) { await load(); alert('Connector deleted'); }
      else alert('Failed to delete connector: ' + await r.text());
    } catch (e) { console.error(e); alert('Failed to delete connector'); }
  };

  const openIngestViewer = (ingest: any) => {
    setSelectedIngest(ingest);
    // prepare candidate array paths (detect arrays in JSON or XML)
    let raw = ingest.raw_data;
    const candidates: string[] = [];
    try {
      // if raw is string and looks like XML, parse to object
      if (typeof raw === 'string' && raw.trim().startsWith('<')) {
        try {
          const parser = new DOMParser();
          const xmldoc = parser.parseFromString(raw, 'application/xml');
          const toJson = (node: any) => {
            const obj: any = {};
            if (node.nodeType === 3) return node.nodeValue;
            const children = Array.from(node.childNodes || []).filter((n: any) => n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim()));
            if (children.length === 0) return node.textContent;
            for (const ch of children) {
              const name = (ch as any).nodeName;
              const val = toJson(ch);
              if (obj[name]) {
                if (!Array.isArray(obj[name])) obj[name] = [obj[name]];
                obj[name].push(val);
              } else obj[name] = val;
            }
            return obj;
          };
          raw = toJson(xmldoc);
        } catch (e) { /* leave raw as string */ }
      }
    } catch (e) { /* ignore */ }

    const listPaths = (obj: any, prefix = '') => {
      try {
        if (!obj) return;
        if (Array.isArray(obj)) {
          candidates.push(prefix || '');
          // inspect first element for nested arrays
          if (obj.length > 0) listPaths(obj[0], prefix);
          return;
        }
        if (typeof obj === 'object') {
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            const path = prefix ? `${prefix}.${k}` : k;
            if (Array.isArray(v)) { candidates.push(path); if (v.length > 0) listPaths(v[0], path); }
            else if (typeof v === 'object') listPaths(v, path);
          }
        }
      } catch (e) { /* ignore */ }
    };

    try { listPaths(raw); } catch (e) { /* ignore */ }
    const defaultPath = candidates.length ? candidates[0] : '';
    setIngestArrayPaths(candidates);
    setSelectedArrayPath(defaultPath);
    // prepare editable rows if default path exists
    try {
      const arr = getArrayForPath(ingest.raw_data, defaultPath) || [];
      setEditableRows(Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : null);
      setEditingPath(defaultPath);
    } catch (e) { setEditableRows(null); setEditingPath(defaultPath); }
    setIngestViewerOpen(true);
  };

  const getByPath = (raw: any, path: string) => {
    try {
      if (!path || path === '') return raw;
      const parts = path.split('.');
      let cur = raw;
      for (const p of parts) {
        if (!cur) return null;
        cur = cur[p];
      }
      return cur;
    } catch (e) { return null; }
  };

  const getArrayForPath = (raw: any, path: string) => {
    try {
      if (!raw) return [];
      if (!path) return Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      const val = getByPath(raw, path);
      return Array.isArray(val) ? val : [];
    } catch (e) { return []; }
  };

  const setByPath = (obj: any, path: string, value: any) => {
    if (!path || path === '') return value; // replace root
    const parts = path.split('.');
    const copy = Array.isArray(obj) ? JSON.parse(JSON.stringify(obj)) : { ...obj };
    let cur: any = copy;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] === undefined) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    return copy;
  };

  const onCellEdit = (rowIndex: number, key: string, newValue: any) => {
    if (!editableRows) return;
    const next = JSON.parse(JSON.stringify(editableRows));
    const orig = next[rowIndex];
    // try to preserve object shapes: if original value was object, attempt JSON.parse
    if (orig && typeof orig[key] === 'object' && orig[key] !== null) {
      try { next[rowIndex][key] = JSON.parse(newValue); }
      catch (e) { next[rowIndex][key] = newValue; }
    } else {
      next[rowIndex][key] = newValue;
    }
    setEditableRows(next);
  };

  const addRow = () => {
    const cols = new Set<string>();
    const arr = editableRows || getArrayForPath(selectedIngest?.raw_data, selectedArrayPath) || [];
    (arr || []).slice(0, 10).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
    const newRow: any = {};
    Array.from(cols).forEach(c => newRow[c] = '');
    const next = Array.isArray(editableRows) ? [...editableRows, newRow] : [newRow];
    setEditableRows(next);
  };

  const deleteRowAt = (idx: number) => {
    if (!editableRows) return;
    if (!confirm('Delete row?')) return;
    const next = JSON.parse(JSON.stringify(editableRows));
    next.splice(idx, 1);
    setEditableRows(next);
  };

  const saveTable = async () => {
    try {
      if (!selectedIngest) return alert('No ingest selected');
      // build new raw_data by replacing path with editableRows
      let newRaw = selectedIngest.raw_data;
      if (typeof newRaw === 'string') {
        try { newRaw = JSON.parse(newRaw); } catch (e) { /* if xml string, cannot save reliably */ }
      }
      const updated = setByPath(newRaw, editingPath, editableRows || []);
      const r = await fetch(`/api/api_ingests/${selectedIngest.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_data: updated }) });
      if (!r.ok) return alert('Failed to save changes: ' + await r.text());
      const j = await r.json();
      // reload list and refresh selected ingest
      await load();
      // set selected ingest to updated one
      setSelectedIngest(j);
      setEditableRows(JSON.parse(JSON.stringify(editableRows || [])));
      alert('Saved');
    } catch (e) { console.error(e); alert('Failed to save: ' + String(e)); }
  };

  const openJsonViewer = (val: any) => { setJsonViewerContent(val); setJsonViewerOpen(true); };

  const registerTableRef = (path: string, el: HTMLDivElement | null) => {
    try {
      tableRefsRef.current[path] = el;
    } catch (e) { /* ignore */ }
  };

  const jumpTo = (path: string, rowIndex?: number) => {
    try {
      const el = tableRefsRef.current[path];
      if (el && typeof rowIndex === 'number') {
        // try to find row inside table by data attribute
        const rowEl = el.querySelector(`[data-row-index=\"${rowIndex}\"]`) as HTMLElement | null;
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prevBg = rowEl.style.backgroundColor;
          rowEl.style.transition = 'background-color 0.2s ease';
          rowEl.style.backgroundColor = '#fff3cd';
          if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
          highlightTimer.current = window.setTimeout(() => { rowEl.style.backgroundColor = prevBg || ''; }, 3000);
          return;
        }
      }
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { /* ignore */ }
  };

  // when selected path changes, refresh editableRows to a deep copy
  useEffect(() => {
    try {
      if (!selectedIngest) { setEditableRows(null); setEditingPath(selectedArrayPath); return; }
      const arr = getArrayForPath(selectedIngest.raw_data, selectedArrayPath) || [];
      setEditableRows(Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : null);
      setEditingPath(selectedArrayPath);
    } catch (e) { setEditableRows(null); setEditingPath(selectedArrayPath); }
  }, [selectedArrayPath, selectedIngest]);

  const trigger = async (id: number) => {
    try {
      const res = await fetch(`/api/api_connectors/${id}/trigger`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        // reload ingests but try to preserve single-row per connector behavior
        await load();
        alert('Triggered connector; ingested data saved' + (j.ingestId ? (', ingestId: ' + j.ingestId) : ''));
      } else {
        alert('Failed to trigger connector');
      }
    } catch (e) { console.error(e); alert('Failed to trigger connector'); }
  };

  const deleteIngest = async (id: number) => {
    if (!confirm('Delete ingest?')) return;
    try {
      const r = await fetch(`/api/api_ingests/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) { await load(); alert('Ingest deleted'); }
      else alert('Failed to delete ingest');
    } catch (e) { console.error(e); alert('Failed to delete ingest'); }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">API Connectors</h1>
      </div>
      <Card>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <h3 className="font-semibold">Create Connector</h3>
            <div className="mt-2 space-y-2">
              <input className="w-full border p-2" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="w-full border p-2" placeholder="Base URL" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} />
              <select className="w-full border p-2" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
              </select>
              <div className="mt-2">
                <label className="block text-sm font-medium">Auth</label>
                <select className="w-full border p-2" value={form.auth_type || 'none'} onChange={e => setForm({ ...form, auth_type: e.target.value })}>
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic (username/password)</option>
                </select>

                {form.auth_type === 'bearer' && (
                  <div className="mt-2">
                    <label className="block text-sm">Bearer Token</label>
                    <input className="w-full border p-2" value={form.bearerToken || ''} onChange={e => setForm({ ...form, bearerToken: e.target.value })} placeholder="token" />
                  </div>
                )}

                {form.auth_type === 'basic' && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="w-full border p-2" placeholder="Username" value={form.basicUsername || ''} onChange={e => setForm({ ...form, basicUsername: e.target.value })} />
                    <input className="w-full border p-2" placeholder="Password" value={form.basicPassword || ''} onChange={e => setForm({ ...form, basicPassword: e.target.value })} />
                  </div>
                )}

              </div>
              <div className="flex justify-end space-x-2">
                <Button onClick={() => openEdit()}>New</Button>
                <Button onClick={save}>Save</Button>
              </div>
            </div>
          </div>
          <div className="col-span-2">
            <h3 className="font-semibold">Connectors</h3>
              <div className="mt-2">
                {connectors.length === 0 && <div className="text-sm text-gray-500">No connectors configured.</div>}
                {connectors.map(c => (
                  <div key={c.id} className="p-2 border-b flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name} <span className="text-xs text-gray-500">{c.method} {c.base_url}</span></div>
                      {c.description && <div className="text-xs text-gray-500">{c.description}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => openEditFromList(c)}>Edit</Button>
                      <Button size="sm" onClick={() => trigger(c.id)}>Trigger</Button>
                      <Button size="sm" variant="danger" onClick={() => deleteConnector(c.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold">Recent Ingests</h3>
        <div className="mt-2">
          {ingests.length === 0 && <div className="text-sm text-gray-500">No ingests yet.</div>}
          {ingests.map(i => (
            <div key={i.id} className="p-2 border-b flex items-center justify-between">
              <div>
                <div className="font-medium">Ingest #{i.id} <span className="text-xs text-gray-500">connector {(() => {
                    const c = connectors.find(x => x.id === i.connector_id);
                    return c ? c.name : String(i.connector_id);
                  })()} · {i.received_at}</span></div>
                <div className="text-xs text-gray-600 mt-1">
                  {(() => {
                    try {
                      if (i.raw_data && typeof i.raw_data === 'object') return JSON.stringify(i.raw_data).slice(0, 300);
                      if (typeof i.raw_data === 'string') {
                        const s = i.raw_data.trim();
                        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                          try { const parsed = JSON.parse(s); return JSON.stringify(parsed).slice(0, 300); } catch (e) { return s.slice(0, 300); }
                        }
                        return s.slice(0, 300);
                      }
                      return String(i.raw_data).slice(0, 300);
                    } catch (e) { return '' }
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => openIngestViewer(i)}>View</Button>
                <Button size="sm" onClick={() => {
                  try {
                    let val = i.raw_data;
                    if (typeof val === 'string') {
                      try { val = JSON.parse(val); } catch (e) { /* keep as string */ }
                    }
                    setJsonViewerContent(val);
                    setJsonViewerEditable(true);
                    setJsonViewerIngestId(i.id);
                    setJsonViewerOpen(true);
                  } catch (e) { console.error(e); alert('Failed to open JSON viewer'); }
                }}>JSON</Button>
                <Button size="sm" variant="danger" onClick={() => deleteIngest(i.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Connector Editor Modal */}
      <Modal isOpen={connectorModalOpen} onClose={() => setConnectorModalOpen(false)} title={editingConnector ? (editingConnector.id ? 'Edit Connector' : 'New Connector') : 'Connector'}>
        {editingConnector && (
          <div className="space-y-2">
            <input className="w-full border p-2" placeholder="Name" value={editingConnector.name || ''} onChange={e => setEditingConnector({ ...editingConnector, name: e.target.value })} />
            <input className="w-full border p-2" placeholder="Base URL" value={editingConnector.base_url || ''} onChange={e => setEditingConnector({ ...editingConnector, base_url: e.target.value })} />
            <select className="w-full border p-2" value={editingConnector.method || 'GET'} onChange={e => setEditingConnector({ ...editingConnector, method: e.target.value })}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
            </select>
            <div>
              <label className="block text-sm font-medium">Auth</label>
              <select className="w-full border p-2" value={editingConnector.auth_type || 'none'} onChange={e => setEditingConnector({ ...editingConnector, auth_type: e.target.value })}>
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic (username/password)</option>
              </select>

              {editingConnector.auth_type === 'bearer' && (
                <div className="mt-2">
                  <label className="block text-sm">Bearer Token</label>
                  <input className="w-full border p-2" value={editingConnector.bearerToken || ''} onChange={e => setEditingConnector({ ...editingConnector, bearerToken: e.target.value })} placeholder="token" />
                </div>
              )}

              {editingConnector.auth_type === 'basic' && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="w-full border p-2" placeholder="Username" value={editingConnector.basicUsername || ''} onChange={e => setEditingConnector({ ...editingConnector, basicUsername: e.target.value })} />
                  <input className="w-full border p-2" placeholder="Password" value={editingConnector.basicPassword || ''} onChange={e => setEditingConnector({ ...editingConnector, basicPassword: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button onClick={() => setConnectorModalOpen(false)}>Cancel</Button>
              <Button onClick={saveEditing}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      {/* JSON Viewer Modal for complex cell values */}
      <Modal isOpen={jsonViewerOpen} onClose={() => { setJsonViewerOpen(false); setJsonViewerEditable(false); setJsonViewerIngestId(null); }} title="JSON Viewer">
        <div>
          {jsonViewerEditable ? (
            <TreeJsonEditor
              value={jsonViewerContent}
              onChange={v => setJsonViewerContent(v)}
              editable={true}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded" style={{ maxHeight: '60vh', overflow: 'auto' }}>{jsonViewerContent ? (typeof jsonViewerContent === 'string' ? jsonViewerContent : JSON.stringify(jsonViewerContent, null, 2)) : ''}</pre>
          )}
          <div className="flex justify-end mt-2 gap-2">
            {jsonViewerEditable && jsonViewerIngestId && (
              <Button onClick={async () => {
                try {
                  // Attempt to parse content to JSON if it's a string
                  let toSave = jsonViewerContent;
                  // if editor returned string, try parse
                  if (typeof toSave === 'string') {
                    try { toSave = JSON.parse(toSave); } catch (e) { /* keep string */ }
                  }
                  const r = await fetch(`/api/api_ingests/${jsonViewerIngestId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_data: toSave }) });
                  if (!r.ok) return alert('Failed to save JSON: ' + await r.text());
                  const j = await r.json();
                  setJsonViewerContent(j.raw_data || j);
                  setJsonViewerEditable(false);
                  setJsonViewerIngestId(null);
                  await load();
                  alert('Saved');
                } catch (e) { console.error(e); alert('Failed to save JSON: ' + String(e)); }
              }}>Save</Button>
            )}
            <Button onClick={() => { setJsonViewerOpen(false); setJsonViewerEditable(false); setJsonViewerIngestId(null); }}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Ingest Viewer Modal */}
      <Modal isOpen={ingestViewerOpen} size="full" onClose={() => setIngestViewerOpen(false)} title={selectedIngest ? `Ingest ${selectedIngest.id}` : 'Ingest'}>
        {selectedIngest && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Array Path</label>
              <div className="flex gap-2 items-center">
                <select className="w-full border p-2" value={selectedArrayPath} onChange={e => setSelectedArrayPath(e.target.value)}>
                  <option value="">(root)</option>
                  {ingestArrayPaths.map(p => <option key={p} value={p}>{p || '(root)'}</option>)}
                </select>
                <label className="inline-flex items-center text-sm"><input type="checkbox" className="ml-2 mr-1" checked={showAllArrays} onChange={e => setShowAllArrays(e.target.checked)} />Show all tables</label>
              </div>
            </div>
            <div>
              <h4 className="font-semibold">Preview Rows</h4>
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Button onClick={() => {
                    try {
                      const arr = getArrayForPath(selectedIngest.raw_data, selectedArrayPath) || [];
                      if (!arr || arr.length === 0) return alert('No rows to download');
                      // build CSV
                      const cols = new Set<string>();
                      arr.slice(0, 500).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
                      const keys = Array.from(cols);
                      const lines: string[] = [];
                      lines.push(keys.map(k => '"' + String(k).replace(/"/g, '""') + '"').join(','));
                      for (const r of arr) {
                        const row = keys.map(k => {
                          let v = r && (r[k] !== undefined ? r[k] : '');
                          if (v === null || v === undefined) v = '';
                          if (typeof v === 'object') v = JSON.stringify(v);
                          return '"' + String(v).replace(/"/g, '""') + '"';
                        }).join(',');
                        lines.push(row);
                      }
                      const csv = lines.join('\r\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ingest_${selectedIngest.id || 'data'}.csv`;
                      document.body.appendChild(a);
                      a.click(); a.remove(); URL.revokeObjectURL(url);
                    } catch (e) { console.error(e); alert('Failed to generate CSV: ' + String(e)); }
                  }}>Download CSV</Button>

                  <Button onClick={async () => {
                    try {
                      const arr = getArrayForPath(selectedIngest.raw_data, selectedArrayPath) || [];
                      if (!arr || arr.length === 0) return alert('No rows to download');
                      const ExcelJS = (await import('exceljs')) as any;
                      const wb: any = new ExcelJS.Workbook();
                      const ws = wb.addWorksheet('Ingest');
                      const cols = new Set<string>();
                      arr.slice(0, 500).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
                      const keys = Array.from(cols);
                      if (keys.length === 0) {
                        arr.forEach((r: any) => { if (Array.isArray(r)) ws.addRow(r); else ws.addRow([String(r)]); });
                      } else {
                        ws.columns = keys.map(k => ({ header: String(k), key: k, width: Math.min(40, Math.max(10, String(k).length + 5)) }));
                        for (const r of arr) {
                          const rowVals = keys.map(k => { const v = r && r[k] !== undefined ? r[k] : ''; return (typeof v === 'object' ? JSON.stringify(v) : v); });
                          ws.addRow(rowVals);
                        }
                      }
                      const buf = await wb.xlsx.writeBuffer();
                      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `ingest_${selectedIngest.id || 'data'}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                    } catch (e) { console.error(e); alert('Failed to generate XLSX: ' + String(e)); }
                  }}>Download XLSX</Button>
                </div>
                {showAllArrays ? (
                  ingestArrayPaths.length === 0 ? <div className="text-sm text-gray-500">No tabular arrays discovered.</div> : (
                    ingestArrayPaths.map(p => {
                      const arr = getArrayForPath(selectedIngest.raw_data, p) || [];
                      const cols = new Set<string>();
                      (arr || []).slice(0, 10).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
                      const columns = Array.from(cols).map(c => ({ key: c, label: c, render: (row: any) => {
                        const v = row[c];
                        if (v === null || typeof v === 'undefined') return '';
                        if (typeof v === 'object') {
                          return (
                            <div className="flex items-center gap-2">
                              <span className="truncate" style={{ maxWidth: 400 }}>{JSON.stringify(v).slice(0, 200)}</span>
                              <button className="text-xs text-blue-600" onClick={() => openJsonViewer(v)}>View</button>
                            </div>
                          );
                        }
                        if ((String(c).toLowerCase().endsWith('_id') || String(c).endsWith('Id')) && v) {
                          return <button className="text-xs text-blue-600" onClick={() => {
                            for (const tp of ingestArrayPaths) {
                              const targ = getArrayForPath(selectedIngest.raw_data, tp) || [];
                              const idx = (targ || []).findIndex((rr: any) => rr && (rr.id === v || rr.id == v));
                              if (idx >= 0) { jumpTo(tp, idx); return; }
                            }
                            alert('Related row not found');
                          }}>{String(v)}</button>;
                        }
                        return String(v);
                      }}));
                      return (
                        <div key={p} ref={el => registerTableRef(p, el)} className="p-2 border rounded bg-white">
                          <div className="font-medium mb-2">Table: {p || '(root)'}</div>
                          <DataTable columns={columns} data={(arr || []).slice(0, 200).map((r: any, idx: number) => ({ id: idx, ...r }))} />
                        </div>
                      );
                    })
                  )
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="space-x-2">
                        <Button onClick={addRow}>Add Row</Button>
                        <Button variant="danger" onClick={() => { if (editableRows && editableRows.length > 0) { if (confirm('Delete last row?')) { setEditableRows(JSON.parse(JSON.stringify(editableRows.slice(0, -1)))); } } }}>Delete Last</Button>
                      </div>
                      <div className="space-x-2">
                        <Button onClick={saveTable}>Save</Button>
                        <Button onClick={() => { setEditableRows(Array.isArray(getArrayForPath(selectedIngest.raw_data, selectedArrayPath)) ? JSON.parse(JSON.stringify(getArrayForPath(selectedIngest.raw_data, selectedArrayPath))) : null); }}>Discard</Button>
                      </div>
                    </div>
                    {(!editableRows || editableRows.length === 0) && <div className="text-sm text-gray-500">No rows to display.</div>}
                    {editableRows && (
                      <div ref={el => registerTableRef(selectedArrayPath, el as any)}>
                        <DataTable
                          columns={(() => {
                            const arr = editableRows || [];
                            const cols = new Set<string>();
                            (arr || []).slice(0, 20).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
                            return (() => {
                              const colsArr = Array.from(cols).map(c => {
                                return { key: c, label: c, editable: true, render: (row: any) => {
                                  const v = row[c];
                                  if (v === null || typeof v === 'undefined') return '';
                                  if (typeof v === 'object') {
                                    const expandKey = `${selectedArrayPath}.${row.id}.${c}`;
                                    const isExpanded = expandedNestedRows.has(expandKey);
                                    return (
                                      <div className="flex items-center gap-2">
                                        <button 
                                          className="text-sm text-blue-600 font-bold hover:text-blue-800"
                                          onClick={() => {
                                            const next = new Set(expandedNestedRows);
                                            if (next.has(expandKey)) next.delete(expandKey);
                                            else next.add(expandKey);
                                            setExpandedNestedRows(next);
                                          }}
                                        >
                                          {isExpanded ? '▼' : '+'} {typeof v === 'object' && Array.isArray(v) ? `[${v.length}]` : '{}'}
                                        </button>
                                      </div>
                                    );
                                  }
                                  if ((String(c).toLowerCase().endsWith('_id') || String(c).endsWith('Id')) && v) {
                                    return <button className="text-xs text-blue-600" onClick={() => {
                                      for (const tp of ingestArrayPaths) {
                                        const targ = getArrayForPath(selectedIngest.raw_data, tp) || [];
                                        const idx = (targ || []).findIndex((rr: any) => rr && (rr.id === v || rr.id == v));
                                        if (idx >= 0) { jumpTo(tp, idx); return; }
                                      }
                                      alert('Related row not found');
                                    }}>{String(v)}</button>;
                                  }
                                  return String(v);
                                } };
                              });
                              colsArr.push({ key: '__actions', label: '', editable: true, render: (row: any) => (
                                <div className="flex items-center gap-2">
                                  <button className="text-xs text-red-600" onClick={() => { if (confirm('Delete this row?')) deleteRowAt(row.id); }}>Delete</button>
                                </div>
                              ) });
                              return colsArr;
                            })();
                          })()
                          }
                          data={editableRows.map((r: any, idx: number) => ({ id: idx, ...r }))}
                          onCellEdit={onCellEdit}
                        />
                      </div>
                    )}

                    {/* Expanded nested object rows */}
                    {editableRows && (
                      <div className="mt-4 space-y-4">
                        {editableRows.map((row: any, rowIdx: number) => {
                          const cols = new Set<string>();
                          (editableRows || []).slice(0, 20).forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => cols.add(k)); });
                          return Array.from(cols).map(colName => {
                            const expandKey = `${selectedArrayPath}.${rowIdx}.${colName}`;
                            const isExpanded = expandedNestedRows.has(expandKey);
                            const v = row[colName];
                            
                            if (!isExpanded || typeof v !== 'object' || v === null) return null;
                            
                            return (
                              <div key={expandKey} className="p-3 border rounded bg-blue-50 ml-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="font-semibold text-blue-900">
                                    Row {rowIdx} → {colName} {Array.isArray(v) ? `(${v.length} items)` : '(object)'}
                                  </div>
                                  <button
                                    onClick={() => {
                                      const next = new Set(expandedNestedRows);
                                      next.delete(expandKey);
                                      setExpandedNestedRows(next);
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-bold"
                                  >
                                    ▲ Collapse
                                  </button>
                                </div>

                                {Array.isArray(v) ? (
                                  <div className="overflow-auto border rounded">
                                    <table className="w-full border-collapse text-sm">
                                      <thead className="bg-blue-100">
                                        <tr>
                                          {v.length > 0 && typeof v[0] === 'object' && v[0] !== null ? (
                                            Object.keys(v[0]).map(k => (
                                              <th key={k} className="border p-2 text-left font-medium">{k}</th>
                                            ))
                                          ) : (
                                            <th className="border p-2 text-left font-medium">Value</th>
                                          )}
                                          <th className="border p-2 text-left font-medium w-20">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {v.map((item: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-blue-100">
                                            {typeof item === 'object' && item !== null ? (
                                              <>
                                                {Object.keys(item).map(k => (
                                                  <td key={k} className="border p-2">
                                                    {typeof item[k] === 'object' ? (
                                                      <code className="text-xs bg-white p-1 rounded">{JSON.stringify(item[k]).slice(0, 100)}</code>
                                                    ) : (
                                                      <input
                                                        type="text"
                                                        value={String(item[k] ?? '')}
                                                        onChange={(e) => {
                                                          const newVal = e.target.value;
                                                          let parsed: any = newVal;
                                                          if (newVal === 'null') parsed = null;
                                                          else if (newVal === 'true') parsed = true;
                                                          else if (newVal === 'false') parsed = false;
                                                          else if (!isNaN(Number(newVal)) && newVal.trim() !== '') parsed = Number(newVal);
                                                          const updatedArray = [...v];
                                                          updatedArray[idx][k] = parsed;
                                                          onCellEdit(rowIdx, colName, updatedArray);
                                                        }}
                                                        className="w-full border rounded p-1 text-xs"
                                                      />
                                                    )}
                                                  </td>
                                                ))}
                                              </>
                                            ) : (
                                              <td className="border p-2 col-span-full">
                                                <input
                                                  type="text"
                                                  value={String(item ?? '')}
                                                  onChange={(e) => {
                                                    const updatedArray = [...v];
                                                    updatedArray[idx] = e.target.value;
                                                    onCellEdit(rowIdx, colName, updatedArray);
                                                  }}
                                                  className="w-full border rounded p-1 text-xs"
                                                />
                                              </td>
                                            )}
                                            <td className="border p-2">
                                              <button
                                                className="text-xs text-red-600 hover:text-red-800"
                                                onClick={() => {
                                                  if (confirm('Delete this item?')) {
                                                    const updatedArray = v.filter((_: any, i: number) => i !== idx);
                                                    onCellEdit(rowIdx, colName, updatedArray);
                                                  }
                                                }}
                                              >
                                                🗑
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    <div className="p-2 border-t bg-blue-50">
                                      <button
                                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                                        onClick={() => {
                                          const newItem = Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
                                            ? Object.keys(v[0]).reduce((acc: any, k) => ({ ...acc, [k]: '' }), {})
                                            : {};
                                          const updatedArray = [...v, newItem];
                                          onCellEdit(rowIdx, colName, updatedArray);
                                        }}
                                      >
                                        + Add Item
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-white p-3 rounded border">
                                    <TreeJsonEditor value={v} onChange={(newVal) => onCellEdit(rowIdx, colName, newVal)} editable={true} />
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Relationships detection */}
            {!showAllArrays && ingestArrayPaths.length > 1 && (
              <div className="p-2 border rounded bg-gray-50">
                <h5 className="font-medium">Detected Relationships</h5>
                <RelList raw={selectedIngest.raw_data} paths={ingestArrayPaths} />
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setIngestViewerOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ApiConnectorsPage;
