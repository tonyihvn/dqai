import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import DataTable from '../components/ui/DataTable';

const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [contentRows, setContentRows] = useState<any[]>([]);
  const [contentDatasetId, setContentDatasetId] = useState<number | null>(null);
  const [contentDatasetName, setContentDatasetName] = useState<string | null>(null);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/datasets');
      const j = await r.json();
      setDatasets(Array.isArray(j) ? j : []);
    } catch (e) { console.error('Failed to load datasets', e); setDatasets([]); }
    setLoading(false);
  };

  useEffect(() => { loadDatasets(); }, []);

  const saveDataset = async (ds: any) => {
    try {
      const r = await fetch('/api/admin/datasets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ds) });
      const j = await r.json();
      await loadDatasets();
      setIsEditModalOpen(false);
    } catch (e) { console.error('Failed to save dataset', e); alert('Failed to save'); }
  };

  const deleteDataset = async (id: number) => {
    if (!confirm('Delete dataset and all its content?')) return;
    try {
      await fetch(`/api/admin/datasets/${id}`, { method: 'DELETE' });
      await loadDatasets();
    } catch (e) { console.error('Failed to delete', e); alert('Delete failed'); }
  };

  const viewContent = async (id: number) => {
    try {
      // fetch dataset metadata (for title)
      const metaRes = await fetch(`/api/admin/datasets/${id}`);
      const meta = metaRes.ok ? await metaRes.json() : null;
      const r = await fetch(`/api/admin/datasets/${id}/content?limit=500`);
      const j = await r.json();
      // Flatten rows so each row exposes dataset fields at top-level, but keep a __dc_id and __roles for updates
      const rows = Array.isArray(j.rows) ? j.rows.map((rr:any) => ({ __dc_id: rr.id, __roles: rr.dataset_roles || [], ... (rr.dataset_data || {}) })) : [];
      setContentRows(rows);
      setContentDatasetId(id);
      setContentDatasetName(meta && meta.name ? meta.name : null);
      setIsContentModalOpen(true);
    } catch (e) { console.error('Failed to load content', e); alert('Failed to load content'); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contentDatasetId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const ab = evt.target?.result as ArrayBuffer;
        // Browser-safe ArrayBuffer -> base64
        const bytes = new Uint8Array(ab as ArrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const r = await fetch(`/api/admin/datasets/${contentDatasetId}/content/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileBase64: base64 }) });
        const j = await r.json();
        alert(`Inserted ${j.inserted || 0} rows`);
        viewContent(contentDatasetId);
      } catch (err) { console.error(err); alert('Upload failed'); }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Datasets</h1>
        <div className="space-x-2">
          <Button onClick={() => { setEditing(null); setIsEditModalOpen(true); }}>+ New Dataset</Button>
          <Button variant="secondary" onClick={loadDatasets}>Refresh</Button>
        </div>
      </div>

      <div className="bg-white shadow rounded p-4">
        {loading && <div className="text-sm text-gray-500">Loading...</div>}
        {!loading && (
          <DataTable
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'description', label: 'Description' },
              { key: 'category', label: 'Category' },
              { key: 'actions', label: 'Actions', render: (row:any) => (
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(row); setIsEditModalOpen(true); }} className="text-sm text-primary-600">Edit</button>
                  <button onClick={() => viewContent(row.id)} className="text-sm text-gray-600">Content</button>
                  <button onClick={() => deleteDataset(row.id)} className="text-sm text-red-600">Delete</button>
                </div>
              ) }
            ]}
            data={datasets}
          />
        )}
      </div>

      <Modal isOpen={isEditModalOpen} title={editing ? 'Edit Dataset' : 'New Dataset'} onClose={() => setIsEditModalOpen(false)}>
        <DatasetEditor dataset={editing} onCancel={() => setIsEditModalOpen(false)} onSave={saveDataset} />
      </Modal>

      <Modal isOpen={isContentModalOpen} title={contentDatasetName ? `Dataset: ${contentDatasetName}` : `Dataset Content${contentDatasetId ? ' — ' + contentDatasetId : ''}`} onClose={() => setIsContentModalOpen(false)} size="3xl">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">Total rows: {contentRows.length}</div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Upload Excel</label>
              <input type="file" accept=".xlsx" onChange={handleFileUpload} />
              <button className="ml-2 px-3 py-1 bg-white border rounded text-sm" onClick={async () => {
                try {
                  if (!contentDatasetId) { alert('No dataset selected'); return; }
                  // Collect column keys from existing rows (ignore metadata keys)
                  const keys = contentRows[0] ? Object.keys(contentRows[0]).filter(k => k !== '__dc_id' && k !== '__roles') : [];
                  let dataToSave: Record<string, any> = {};
                  if (keys.length === 0) {
                    const raw = window.prompt('No columns detected. Enter JSON object for the new row (e.g. {"col1":"value"})');
                    if (!raw) return;
                    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') dataToSave = parsed; else { alert('Invalid JSON'); return; } } catch (e) { alert('Invalid JSON'); return; }
                  } else {
                    for (const k of keys) dataToSave[k] = '';
                  }
                  const res = await fetch(`/api/admin/datasets/${contentDatasetId}/content`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSave) });
                  if (!res.ok) { const txt = await res.text().catch(()=>null); alert('Failed to add row: ' + (txt || res.statusText)); return; }
                  await viewContent(contentDatasetId);
                } catch (err) { console.error('Add row failed', err); alert('Add row failed'); }
              }}>Add Row</button>
              <button className="ml-2 px-3 py-1 bg-gray-100 rounded text-sm" onClick={() => {
                // export CSV of current contentRows
                try {
                  if (!contentRows || !contentRows.length) { alert('No data to export'); return; }
                  const keys = Object.keys(contentRows[0]);
                  const csv = [keys.join(',')].concat(contentRows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `${contentDatasetName || ('dataset_' + contentDatasetId)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                } catch (err) { console.error(err); alert('Export failed'); }
              }}>Export CSV</button>
              <button className="ml-2 px-3 py-1 bg-gray-100 rounded text-sm" onClick={() => {
                // print-friendly view for PDF export
                try {
                  const keys = contentRows[0] ? Object.keys(contentRows[0]) : [];
                  const html = `
                    <html><head><title>${contentDatasetName || 'Dataset'}</title>
                      <style>table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;}</style>
                    </head><body><h3>${contentDatasetName || 'Dataset'}</h3><table><thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>${contentRows.map(r=>`<tr>${keys.map(k=>`<td>${String(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
                  const w = window.open('', '_blank'); if (!w) { alert('Unable to open print window'); return; } w.document.write(html); w.document.close(); w.focus(); w.print();
                } catch (err) { console.error(err); alert('Print failed'); }
              }}>Print / PDF</button>
            </div>
          </div>

          <div className="overflow-auto">
            {contentRows.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <DataTable
                columns={(() => {
                  const keys = Object.keys(contentRows[0] || {}).filter(k => k !== '__dc_id' && k !== '__roles');
                  const cols = keys.map(k => ({ key: k, label: k, editable: true }));
                  cols.push({ key: '__actions', label: 'Actions', render: (row:any) => (
                    <div className="flex gap-2">
                      <button className="text-xs text-primary-600" onClick={async () => {
                        const roles = (row.__roles || []).join(',');
                        const edited = window.prompt('Edit roles (comma-separated)', roles);
                        if (edited === null) return;
                        const newRoles = edited.split(',').map((s:string)=>s.trim()).filter(Boolean);
                        try {
                          const res = await fetch(`/api/admin/datasets/${contentDatasetId}/content/${row.__dc_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_roles: newRoles }) });
                          if (res.ok) {
                            // refresh view
                            await viewContent(contentDatasetId!);
                          } else {
                            alert('Failed to update roles');
                          }
                        } catch (err) { console.error(err); alert('Failed to update roles'); }
                      }}>Roles</button>
                      <button className="text-xs text-gray-600" onClick={async () => {
                        if (!confirm('Delete this row?')) return;
                        try { const res = await fetch(`/api/admin/datasets/${contentDatasetId}/content/${row.__dc_id}`, { method: 'DELETE' }); if (res.ok) await viewContent(contentDatasetId!); else alert('Delete failed'); } catch (err) { console.error(err); alert('Delete failed'); }
                      }}>Delete</button>
                    </div>
                  ) });
                  return cols;
                })()}
                data={contentRows}
                persistKey={contentDatasetId ? `dataset_content_${contentDatasetId}` : undefined}
                pageSize={500}
                onCellEdit={async (rowIndex, key, newValue) => {
                  try {
                    const row = contentRows[rowIndex];
                    if (!row) return;
                    const contentId = row.__dc_id;
                    const updatedRow = { ...row, [key]: newValue };
                    // rebuild dataset_data object
                    const dataToSave: Record<string, any> = {};
                    for (const k of Object.keys(updatedRow)) {
                      if (k === '__dc_id' || k === '__roles') continue;
                      dataToSave[k] = updatedRow[k];
                    }
                    const res = await fetch(`/api/admin/datasets/${contentDatasetId}/content/${contentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_data: dataToSave }) });
                    if (!res.ok) { alert('Save failed'); return; }
                    // update local copy optimistically
                    const newRows = [...contentRows]; newRows[rowIndex] = { ...updatedRow }; setContentRows(newRows);
                  } catch (err) { console.error('Cell save failed', err); alert('Save failed'); }
                }}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

const DatasetEditor: React.FC<{ dataset?: any; onSave: (d:any)=>void; onCancel: ()=>void }> = ({ dataset, onSave, onCancel }) => {
  const [name, setName] = useState(dataset?.name || '');
  const [description, setDescription] = useState(dataset?.description || '');
  const [category, setCategory] = useState(dataset?.category || '');
  const [fieldsText, setFieldsText] = useState((Array.isArray(dataset?.dataset_fields) ? dataset.dataset_fields.map((f:any)=>f.name).join(',') : ''));

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-700">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border-gray-300 rounded" />
      </div>
      <div>
        <label className="block text-sm text-gray-700">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 block w-full border-gray-300 rounded" />
      </div>
      <div>
        <label className="block text-sm text-gray-700">Category</label>
        <input value={category} onChange={e => setCategory(e.target.value)} className="mt-1 block w-full border-gray-300 rounded" />
      </div>
      <div>
        <label className="block text-sm text-gray-700">Fields (comma-separated)</label>
        <input value={fieldsText} onChange={e => setFieldsText(e.target.value)} className="mt-1 block w-full border-gray-300 rounded" placeholder="code,label" />
        <div className="text-xs text-gray-500 mt-1">Provide field names to help mapping when using datasets as sources.</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ id: dataset?.id, name, description, category, dataset_fields: fieldsText.split(',').map(s => ({ name: s.trim() })).filter((f:any)=>f.name) })}>Save</Button>
      </div>
    </div>
  );
};

export default DatasetsPage;
