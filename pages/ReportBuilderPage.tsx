import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import CanvasEditor from '../components/ui/CanvasEditor';
import WysiwygEditor from '../components/ui/WysiwygEditor';
import { apiFetch, getApiBase } from '../utils/api';

const ReportBuilderPage: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [questionsList, setQuestionsList] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const canvasRef = React.useRef<any>(null);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [blockEditHtml, setBlockEditHtml] = useState<string>('');
  const [blockEditLeft, setBlockEditLeft] = useState<number | string>('');
  const [blockEditTop, setBlockEditTop] = useState<number | string>('');
  const [answersList, setAnswersList] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number; }>(({ x: (typeof window !== 'undefined' ? Math.max(40, (window.innerWidth || 1200) - 380) : 800), y: 120 }));
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number; }>({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPanelPos({ x: Math.max(10, dragRef.current.origX + dx), y: Math.max(10, dragRef.current.origY + dy) });
    };
    const onUp = () => { dragRef.current.dragging = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/admin/report_templates');
      const j = await r.json();
      setTemplates(Array.isArray(j) ? j : []);
    } catch (e) { console.error('Failed to load templates', e); setTemplates([]); }
    setLoading(false);
  };

  const edit = (t: any) => {
    setEditing({ id: t.id, name: t.name, activity_id: t.activity_id, template_json: typeof t.template_json === 'string' ? t.template_json : JSON.stringify(t.template_json) });
  };

  const applyBlockUpdate = (blockId: string, updates: { left?: number; top?: number; html?: string; meta?: any }) => {
    try {
      if (!editing) return;
      const tplObj = getTplObj(editing.template_json);
      const html = tplObj.html || '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const el = doc.querySelector(`div.tpl-block[data-block-id="${blockId}"]`) as HTMLElement | null;
      if (!el) return;
      if (updates.left !== undefined) (el.style as any).left = `${updates.left}px`;
      if (updates.top !== undefined) (el.style as any).top = `${updates.top}px`;
      if (updates.html !== undefined) el.innerHTML = updates.html;
      const existingRaw = el.getAttribute('data-block-json') || '{}';
      let existing = {};
      try { existing = JSON.parse(existingRaw); } catch (e) { existing = {}; }
      if (updates.meta) existing = { ...existing, ...updates.meta };
      el.setAttribute('data-block-json', JSON.stringify(existing).replace(/</g, '&lt;'));
      tplObj.html = doc.body ? doc.body.innerHTML : html;
      setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
    } catch (e) { console.error('Failed to apply block update', e); }
  };

  const buildTableHtml = (doc: any) => {
    try {
      const rows = Array.isArray(doc.file_content) ? doc.file_content : (Array.isArray(doc.dataset_data) ? doc.dataset_data : []);
      if (!rows || rows.length === 0) return '<div>No table data</div>';
      const keys = Object.keys(rows[0] || {});
      let html = '<div class="uploaded-table-wrapper"><table style="border-collapse: collapse; width:100%;"><thead><tr>';
      for (const k of keys) html += `<th style="border:1px solid #ddd;padding:6px;background:#f7f7f7;text-align:left">${k}</th>`;
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const k of keys) {
          const val = r && typeof r === 'object' && (r[k] !== undefined && r[k] !== null) ? String(r[k]) : '';
          html += `<td style="border:1px solid #ddd;padding:6px">${val}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    } catch (e) { return '<div>Failed to render table</div>'; }
  };

  const loadActivities = async () => {
    try {
      const r = await apiFetch('/api/activities');
      const j = await r.json();
      setActivities(Array.isArray(j) ? j : []);
    } catch (e) { console.error('Failed to load activities', e); setActivities([]); }
  };

  useEffect(() => { loadTemplates(); loadActivities(); }, []);

  useEffect(() => {
    if (!selectedBlock) { setBlockEditHtml(''); setBlockEditLeft(''); setBlockEditTop(''); return; }
    setBlockEditHtml(selectedBlock.html || '');
    setBlockEditLeft(selectedBlock.left ?? '');
    setBlockEditTop(selectedBlock.top ?? '');
  }, [selectedBlock]);

  const startNew = () => setEditing({ id: null, name: '', activity_id: null, template_json: JSON.stringify({ html: '<div><h1>{{activity_title}}</h1><p>Report: {{report_id}}</p></div>' }) });

  const save = async () => {
    if (!editing || !editing.name) return alert('Please provide a name');
    try {
      let parsed: any = {};
      try { parsed = typeof editing.template_json === 'string' ? JSON.parse(editing.template_json) : (editing.template_json || {}); } catch (e) { parsed = {}; }
      const payload: any = {
        id: editing.id,
        name: editing.name,
        activity_id: editing.activity_id,
        template_json: editing.template_json,
        paper_size: parsed.paperSize || parsed.paper_size || null,
        orientation: parsed.orientation || null,
        header_image: parsed.headerImage || parsed.header_image || null,
        footer_image: parsed.footerImage || parsed.footer_image || null,
        watermark_image: parsed.watermarkImage || parsed.watermark_image || null,
        assets: parsed.assets || null
      };
      const res = await apiFetch('/api/admin/report_templates', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const txt = await res.text().catch(() => ''); alert('Save failed: ' + txt); return; }
      await loadTemplates();
      setEditing(null);
    } catch (e) { console.error(e); alert('Save failed'); }
  };


    // Build headers-only table HTML for uploaded docs (structure only)
    const buildTableHeadersHtml = (doc: any) => {
      try {
        const rows = Array.isArray(doc.file_content) ? doc.file_content : (Array.isArray(doc.dataset_data) ? doc.dataset_data : []);
        if (!rows || rows.length === 0) return '<div class="uploaded-table-wrapper"><table style="border-collapse: collapse; width:100%;"><thead><tr><th>No headers</th></tr></thead></table></div>';
        const keys = Object.keys(rows[0] || {});
        let html = '<div class="uploaded-table-wrapper"><table style="border-collapse: collapse; width:100%;"><thead><tr>';
        for (const k of keys) html += `<th style="border:1px solid #ddd;padding:6px;background:#f7f7f7;text-align:left">${k}</th>`;
        html += '</tr></thead></table></div>';
        return html;
      } catch (e) { return '<div>Failed to render table headers</div>'; }
    };

  const getTplObj = (v: any) => {
    if (!v) return {};
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch (e) { return {}; }
    }
    if (typeof v === 'object') return v;
    return {};
  };

  const [expandedQuestions, setExpandedQuestions] = React.useState<Record<string, boolean>>({});
  const toggleQuestion = (qid: string) => setExpandedQuestions(s => ({ ...s, [qid]: !s[qid] }));

  const remove = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try { const res = await apiFetch(`/api/admin/report_templates/${id}`, { method: 'DELETE', credentials: 'include' }); if (res.ok) await loadTemplates(); } catch (e) { console.error(e); alert('Delete failed'); }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Report Templates</h2>
            <div className="space-x-2">
              <Button size="sm" onClick={startNew}>+ New</Button>
              <Button size="sm" variant="secondary" onClick={loadTemplates}>Refresh</Button>
            </div>
          </div>
          <Card>
            {loading && <div>Loading...</div>}
            {!loading && templates.length === 0 && <div className="text-sm text-gray-500">No templates found.</div>}
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="p-2 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-gray-500">Activity: {t.activity_id || 'Any'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => edit(t)}>Edit</Button>
                    <Button size="sm" onClick={() => { setIsPreviewOpen(true); setEditing(t); }}>Preview</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(t.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Editor</h2>
          <Card>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium">Name</label>
                  <input className="mt-1 block w-full border rounded p-2" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Activity (optional)</label>
                  <select className="mt-1 block w-full border rounded p-2" value={editing.activity_id || ''} onChange={e => setEditing({ ...editing, activity_id: e.target.value || null })}>
                    <option value="">(Any activity)</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium">Template HTML</label>
                    <div className="mt-2">
                      <div className="border rounded p-2 min-h-[220px] bg-white">
                        {/* CanvasEditor is the primary design surface. TinyMCE is used only inside the CanvasEditor when inserting rich text blocks. */}
                        <CanvasEditor
                          value={(getTplObj(editing.template_json).html) || ''}
                          onChange={v => {
                            try {
                              const tplObj = getTplObj(editing.template_json);
                              tplObj.html = v;
                              setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                            } catch (err) { setEditing({ ...editing, template_json: JSON.stringify({ html: v }) }); }
                          }}
                          ref={canvasRef}
                          showToolbox={false}
                          onSelect={b => setSelectedBlock(b)}
                          paperSize={(getTplObj(editing.template_json).paperSize || 'A4')}
                          orientation={(getTplObj(editing.template_json).orientation || 'portrait')}
                          margins={(getTplObj(editing.template_json).margins || { top: 20, right: 20, bottom: 20, left: 20 })}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-2">Drag datapoints from the panel to the right into the editor to insert placeholders or full tables. Use <code>{'{{question_QUESTIONID}}'}</code>, <code>{'{{activity_title}}'}</code>, <code>{'{{report_id}}'}</code>.</div>

                      {/* Template settings moved to floating Preview Panel */}
                    </div>
                  </div>
                    </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button onClick={save}>Save Template</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Select or create a template to edit.</div>
            )}
          </Card>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <div ref={panelRef as any} style={{ position: 'fixed', left: panelPos.x, top: panelPos.y, width: 340, zIndex: 9999, maxHeight: '80vh', overflowY: 'auto' }} className="bg-white border rounded shadow-lg p-3">
          <div className="cursor-move mb-2 font-medium flex items-center justify-between" onMouseDown={(e) => { try { dragRef.current.dragging = true; dragRef.current.startX = (e as any).clientX; dragRef.current.startY = (e as any).clientY; dragRef.current.origX = panelPos.x; dragRef.current.origY = panelPos.y; } catch (err) { } }}>
            <div>Preview Panel</div>
            <div className="text-xs text-gray-500">Drag to move</div>
          </div>

          <details className="mb-2 p-2 border rounded bg-gray-50">
            <summary className="cursor-pointer font-medium">Toolbox</summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertTextBlock?.()}>Insert Text</button>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertBlock?.()}>Insert Block</button>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertPlaceholder?.()}>Insert Placeholder</button>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertImageUrl?.()}>Insert Image</button>
              <div className="flex gap-2">
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => canvasRef.current?.zoomIn?.()}>Zoom +</button>
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => canvasRef.current?.zoomOut?.()}>Zoom -</button>
              </div>
            </div>
          </details>

          <div className="text-xs text-gray-600 mb-2">Activity Fields</div>
          {activityData ? (
            <div className="mb-2 text-xs text-gray-700 max-h-40 overflow-auto border rounded p-2 bg-gray-50 space-y-1">
              {Object.keys(activityData).slice(0, 100).map(field => (
                <div key={field} draggable onDragStart={e => {
                  e.dataTransfer.setData('text/plain', `{{activity_${field}}}`);
                  try { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'activity_field', field })); } catch (err) { }
                }} className="p-1 rounded hover:bg-gray-100 cursor-move flex justify-between items-center">
                  <div className="truncate font-medium text-xs">{field}</div>
                  <div className="text-gray-500 text-xs font-mono truncate ml-2">{String(activityData[field] ?? '')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 mb-2">No activity selected.</div>
          )}

          {/* Template Settings moved into floating panel */}
          <details className="mb-3 p-2 border rounded bg-gray-50">
            <summary className="cursor-pointer font-medium">Template Settings</summary>
            <div className="mt-2 text-xs space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">Paper Size</label>
                  <select className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).paperSize || 'A4'} onChange={e => {
                    try { const tplObj = getTplObj(editing?.template_json); tplObj.paperSize = e.target.value; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                  }}>
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="A3">A3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Orientation</label>
                  <select className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).orientation || 'portrait'} onChange={e => {
                    try { const tplObj = getTplObj(editing?.template_json); tplObj.orientation = e.target.value; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                  }}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Display Format</label>
                  <select className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).displayFormat || 'pdf'} onChange={e => {
                    try { const tplObj = getTplObj(editing?.template_json); tplObj.displayFormat = e.target.value; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                  }}>
                    <option value="pdf">PDF</option>
                    <option value="docx">MS Word</option>
                    <option value="xlsx">Excel</option>
                    <option value="image">Image</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Header Image</label>
                  <input type="file" accept="image/*" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const dataUrl = ev.target?.result as string;
                        try {
                          const res = await apiFetch('/api/template_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentBase64: dataUrl, mimeType: f.type }) });
                          if (res.ok) { const j = await res.json(); const tplObj = getTplObj(editing?.template_json); tplObj.headerImage = j.url; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); return; }
                        } catch (err) { console.error('Upload failed', err); }
                        const tplObj = getTplObj(editing?.template_json); tplObj.headerImage = dataUrl; setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                      };
                      reader.readAsDataURL(f);
                    } catch (err) { console.error(err); }
                  }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500">Margins (Top)</label>
                    <input type="number" className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).margins?.top ?? 20} onChange={e => {
                      try { const tplObj = getTplObj(editing?.template_json); tplObj.margins = tplObj.margins || { top: 20, right: 20, bottom: 20, left: 20 }; tplObj.margins.top = Number(e.target.value || 0); setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                    }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Margins (Left)</label>
                    <input type="number" className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).margins?.left ?? 20} onChange={e => {
                      try { const tplObj = getTplObj(editing?.template_json); tplObj.margins = tplObj.margins || { top: 20, right: 20, bottom: 20, left: 20 }; tplObj.margins.left = Number(e.target.value || 0); setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                    }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Margins (Bottom)</label>
                    <input type="number" className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).margins?.bottom ?? 20} onChange={e => {
                      try { const tplObj = getTplObj(editing?.template_json); tplObj.margins = tplObj.margins || { top: 20, right: 20, bottom: 20, left: 20 }; tplObj.margins.bottom = Number(e.target.value || 0); setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                    }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Margins (Right)</label>
                    <input type="number" className="mt-1 block w-full border rounded p-2 text-sm" value={getTplObj(editing?.template_json).margins?.right ?? 20} onChange={e => {
                      try { const tplObj = getTplObj(editing?.template_json); tplObj.margins = tplObj.margins || { top: 20, right: 20, bottom: 20, left: 20 }; tplObj.margins.right = Number(e.target.value || 0); setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { console.error(err); }
                    }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Footer Image</label>
                  <input type="file" accept="image/*" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const dataUrl = ev.target?.result as string;
                        try {
                          const res = await apiFetch('/api/template_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentBase64: dataUrl, mimeType: f.type }) });
                          if (res.ok) { const j = await res.json(); const tplObj = getTplObj(editing?.template_json); tplObj.footerImage = j.url; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); return; }
                        } catch (err) { console.error('Upload failed', err); }
                        const tplObj = getTplObj(editing?.template_json); tplObj.footerImage = dataUrl; setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                      };
                      reader.readAsDataURL(f);
                    } catch (err) { console.error(err); }
                  }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Watermark Image</label>
                  <input type="file" accept="image/*" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const dataUrl = ev.target?.result as string;
                        try {
                          const res = await apiFetch('/api/template_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentBase64: dataUrl, mimeType: f.type }) });
                          if (res.ok) { const j = await res.json(); const tplObj = getTplObj(editing?.template_json); tplObj.watermarkImage = j.url; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); return; }
                        } catch (err) { console.error('Upload failed', err); }
                        const tplObj = getTplObj(editing?.template_json); tplObj.watermarkImage = dataUrl; setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                      };
                      reader.readAsDataURL(f);
                    } catch (err) { console.error(err); }
                  }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Assets (JSON)</label>
                  <input className="mt-1 block w-full border rounded p-2 text-sm" value={(getTplObj(editing?.template_json).assets ? JSON.stringify(getTplObj(editing?.template_json).assets) : '') || ''} onChange={e => {
                    try { const tplObj = getTplObj(editing?.template_json); tplObj.assets = e.target.value ? JSON.parse(e.target.value) : null; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { /* ignore parse errors while typing */ }
                  }} />
                </div>
              </div>
            </div>
          </details>

          <div className="max-h-40 overflow-auto space-y-2 mb-2">
            <div className="font-medium text-sm">Questions</div>
            {questionsList.length === 0 && <div className="text-xs text-gray-400">No questions for selected activity.</div>}
            {questionsList.map((q:any) => {
              const qid = String(q.id);
              return (
                <div key={qid} className="p-2 border rounded bg-gray-50 hover:bg-gray-100 text-xs flex items-center justify-between">
                  <div draggable onDragStart={e => {
                    const label = (q.fieldName || q.field_name) ? `${q.fieldName || q.field_name}` : (q.questionText || q.question_text || `Question ${qid}`);
                    e.dataTransfer.setData('text/plain', `{{question_${qid}}}`);
                    try { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'question', id: qid, label })); } catch (err) { /* ignore */ }
                  }} className="cursor-move flex items-center gap-2">
                    <div className="font-medium truncate">{(q.fieldName || q.field_name) ? `${q.fieldName || q.field_name}` : (q.questionText || q.question_text || `Question ${qid}`)}</div>
                  </div>
                  <div className="text-gray-400">{q.answer_type || q.answerType || ''}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 max-h-44 overflow-auto">
            <div className="font-medium">Uploaded Tables (headers)</div>
            {uploadedDocs.length === 0 && <div className="text-xs text-gray-400">No uploaded tables for this activity.</div>}
            {uploadedDocs.map((doc:any) => (
              <div key={doc.id} draggable onDragStart={e => {
                let headersHtml = buildTableHeadersHtml(doc);
                headersHtml = headersHtml.replace('<div class="uploaded-table-wrapper">', `<div class="uploaded-table-wrapper" data-upload-id="${doc.id}">`);
                e.dataTransfer.setData('text/plain', `uploaded_table_headers:${doc.id}`);
                e.dataTransfer.setData('text/html', headersHtml);
              }} className="p-2 border rounded bg-white hover:bg-gray-50 cursor-move text-xs flex items-center justify-between">
                <div className="font-medium truncate">{doc.filename || `File ${doc.id}`}</div>
                <div className="text-gray-400">{(Array.isArray(doc.file_content) ? doc.file_content.length : (Array.isArray(doc.dataset_data) ? doc.dataset_data.length : 0))} rows</div>
              </div>
            ))}
          </div>

          {selectedBlock && (
            <div className="mt-3 p-2 border rounded bg-white text-xs">
              <div className="font-medium mb-1">Selected Block</div>
              {selectedBlock.type === 'placeholder' ? (
                <>
                  <div className="mb-2 text-xs text-gray-600">Editing placeholder. You can change its label or metadata.</div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Label</label>
                    <input className="w-full border p-1 text-sm" value={(selectedBlock.meta && selectedBlock.meta.label) || ''} onChange={e => setBlockEditHtml(e.target.value)} />
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Question ID</label>
                    <input className="w-full border p-1 text-sm" value={(selectedBlock.meta && selectedBlock.meta.qid) || ''} readOnly />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button className="p-1 border rounded text-xs" onClick={() => { setSelectedBlock(null); }}>Close</button>
                    <button className="p-1 bg-primary-600 text-white rounded text-xs" onClick={() => {
                      try {
                        const tplObj = getTplObj(editing.template_json);
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(tplObj.html || '', 'text/html');
                        const qid = selectedBlock.meta && selectedBlock.meta.qid;
                        let el = qid ? doc.querySelector(`span.tpl-placeholder[data-qid="${qid}"]`) : null;
                        if (!el) {
                          const label = (selectedBlock.meta && selectedBlock.meta.label) || '';
                          el = Array.from(doc.querySelectorAll('span.tpl-placeholder')).find(s => s.textContent === label) as HTMLElement | undefined || null;
                        }
                        if (el) {
                          const newLabel = blockEditHtml || (selectedBlock.meta && selectedBlock.meta.label) || el.textContent || '';
                          el.textContent = newLabel;
                          el.setAttribute('data-label', newLabel);
                          tplObj.html = doc.body ? doc.body.innerHTML : tplObj.html;
                          setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                          setSelectedBlock({ ...selectedBlock, html: el.outerHTML, meta: { ...(selectedBlock.meta || {}), label: newLabel } });
                        }
                      } catch (e) { console.error('Failed to update placeholder', e); }
                    }}>Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 text-xs text-gray-600">Edit HTML / position for the selected positioned block.</div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Left (px)</label>
                    <input type="number" className="w-full border p-1 text-sm" value={String(blockEditLeft)} onChange={e => setBlockEditLeft(e.target.value)} />
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Top (px)</label>
                    <input type="number" className="w-full border p-1 text-sm" value={String(blockEditTop)} onChange={e => setBlockEditTop(e.target.value)} />
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Inner HTML</label>
                    <textarea className="w-full border p-1 text-sm" rows={3} value={blockEditHtml} onChange={e => setBlockEditHtml(e.target.value)} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button className="p-1 border rounded text-xs" onClick={() => {
                      if (!selectedBlock) return;
                      if (!confirm('Remove this block?')) return;
                      try {
                        const tplObj = getTplObj(editing?.template_json);
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(tplObj.html || '', 'text/html');
                        const el = doc.querySelector(`div.tpl-block[data-block-id="${selectedBlock.id}"]`);
                        if (el) el.remove();
                        tplObj.html = doc.body ? doc.body.innerHTML : tplObj.html;
                        setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                        setSelectedBlock(null);
                      } catch (e) { console.error(e); }
                    }}>Remove</button>
                    <button className="p-1 bg-primary-600 text-white rounded text-xs" onClick={() => {
                      if (!selectedBlock) return;
                      applyBlockUpdate(selectedBlock.id, { left: Number(blockEditLeft || 0), top: Number(blockEditTop || 0), html: blockEditHtml });
                      setSelectedBlock({ ...selectedBlock, left: Number(blockEditLeft || 0), top: Number(blockEditTop || 0), html: blockEditHtml });
                    }}>Save</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500">Drag items into the editor to insert their placeholder or table headers.</div>
            <Button size="xs" variant="secondary" onClick={() => setIsGuideOpen(true)}>Guide</Button>
          </div>
        </div>, document.body
      )}

      <Modal isOpen={isPreviewOpen} onClose={() => { setIsPreviewOpen(false); setEditing(null); }} title={`Preview Template ${editing?.name || ''}`} size="xl">
        <div className="prose max-w-full">
          {editing && (() => {
            try {
              const tplObj = getTplObj(editing.template_json);
              let tplHtml = tplObj.html || '';

              // Build lookup maps for questions and answers
              const qMap: Record<string, any> = {};
              for (const q of questionsList || []) {
                try {
                  if (q && (q.id !== undefined)) qMap[String(q.id)] = q;
                  if (q && (q.qid !== undefined)) qMap[String(q.qid)] = q;
                  if (q && (q.question_id !== undefined)) qMap[String(q.question_id)] = q;
                } catch (e) { /* ignore malformed */ }
              }
              const answersMap: Record<string, string> = {};
              for (const a of answersList || []) {
                try {
                  const qid = String(a.question_id || a.questionId || a.qid || '');
                  if (!qid) continue;
                  // prefer first non-empty answer for preview
                  if (!answersMap[qid]) {
                    const val = (typeof a.answer_value === 'object') ? JSON.stringify(a.answer_value) : String(a.answer_value || '');
                    answersMap[qid] = val;
                  }
                } catch (e) { /* ignore */ }
              }

              const escapeHtml = (s: any) => {
                if (s === null || s === undefined) return '';
                return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              };

              // Replace moustache-style question placeholders like {{question_123}}
              tplHtml = tplHtml.replace(/\{\{question_(\w+)\}\}/gi, (m, qid) => {
                const q = qMap[String(qid)] || {};
                const label = q.question_text || q.questionText || q.field_name || q.fieldName || `Question ${qid}`;
                const ans = answersMap[String(qid)] || '';
                return `<div class="report-filled"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(ans)}</div>`;
              });

              // Replace activity-level placeholders like {{activity_title}} with values from the selected activity
              tplHtml = tplHtml.replace(/\{\{activity_([a-zA-Z0-9_]+)\}\}/gi, (m, field) => {
                try {
                  if (!activityData) return '';
                  const val = activityData[field] ?? activityData[field.toLowerCase()] ?? '';
                  return escapeHtml(val);
                } catch (e) { return ''; }
              });

              // Replace inline spans with data-qid attributes (inserted by canvas editor)
              tplHtml = tplHtml.replace(/<span[^>]*data-qid=["']?(\w+)["']?[^>]*>([\s\S]*?)<\/span>/gi, (m, qid) => {
                const q = qMap[String(qid)] || {};
                const label = q.question_text || q.questionText || q.field_name || q.fieldName || `Question ${qid}`;
                const ans = answersMap[String(qid)] || '';
                return `<div class="report-filled"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(ans)}</div>`;
              });

              // Replace uploaded table placeholders (data-upload-id) with header+sample where possible
              tplHtml = tplHtml.replace(/<div[^>]*data-upload-id=["']?(\d+)["']?[^>]*>[\s\S]*?<\/div>/gi, (m, id) => {
                try {
                  const doc = (uploadedDocs || []).find(d => String(d.id) === String(id));
                  if (!doc) return `<div>Uploaded table ${escapeHtml(id)} not found</div>`;
                  // Render full table preview (use buildTableHtml helper)
                  return buildTableHtml(doc);
                } catch (e) { return `<div>Failed to render uploaded table ${escapeHtml(id)}</div>`; }
              });

              return <div dangerouslySetInnerHTML={{ __html: tplHtml }} />;
            } catch (e) { return <div>Invalid template HTML</div>; }
          })()}
        </div>
      </Modal>
      <Modal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} title="Report Builder Guide" size="md">
        <div className="space-y-3 text-sm">
          <p>This editor lets you design printable report templates using variables from your activity.</p>
          <ul className="list-disc pl-5">
            <li>Choose an <strong>Activity</strong> (optional) to load its questions and uploaded tables.</li>
            <li>Drag a <strong>Question</strong> (e.g. <em>age</em>) from the Preview Panel into the canvas — this inserts a placeholder like <code>{'{{question_QUESTIONID}}'}</code>. Example: <code>{'{{question_123}}'}</code>.</li>
            <li>To include the submitted answer value in the final report (what you referred to as <code>report-&gt;answers-&gt;answer_value</code>), use the question placeholder <code>{'{{question_QUESTIONID}}'}</code>. The preview and generated PDF will render this as <strong>Question text: answer_value</strong>.</li>
            <li>If you need the raw answer value only (no question label), reply and I can add support for a short-hand placeholder like <code>{'{{answer_QUESTIONID}}'}</code> or a templating expression such as <code>{'{{report.answers.QUESTIONID}}'}</code>.</li>
            <li>Drag an <strong>Uploaded Table</strong> to insert its <em>headers only</em> (structure). At render/print time the actual uploaded data will be substituted with the full table.</li>
            <li>Use the canvas grid to position and format content. Click inside text to type. Placeholders inserted via drag are decorated (e.g. <code>data-qid</code>) so they get replaced with question text and answers during preview/print.</li>
            <li>Set paper size and orientation in the controls, and add header/footer/watermark images.</li>
            <li>When finished, click <strong>Save Template</strong>. Templates are stored and can be applied when printing reports.</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default ReportBuilderPage;
