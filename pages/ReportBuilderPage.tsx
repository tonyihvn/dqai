import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import RichTextEditor from '../components/ui/RichTextEditor';
import WysiwygEditor from '../components/ui/WysiwygEditor';
import CanvasEditor from '../components/ui/CanvasEditor';
// import WysiwygEditor from '../components/ui/WysiwygEditor';
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
  const canvasChangeTimerRef = useRef<number | null>(null);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [blockEditHtml, setBlockEditHtml] = useState<string>('');
  const [blockEditLeft, setBlockEditLeft] = useState<number | string>('');
  const [blockEditTop, setBlockEditTop] = useState<number | string>('');
  const [answersList, setAnswersList] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildUrl, setBuildUrl] = useState<string | null>(null);
  const [buildFormat, setBuildFormat] = useState<string>('pdf');
  const [iframeLoading, setIframeLoading] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number; }>(() => {
    try {
      const raw = localStorage.getItem('reportBuilderPanelPos');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { x: (typeof window !== 'undefined' ? Math.max(40, (window.innerWidth || 1200) - 380) : 800), y: 120 };
  });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>(() => {
    try { const raw = localStorage.getItem('reportBuilderPanelSize'); if (raw) return JSON.parse(raw); } catch (e) { }
    return { width: 340, height: 420 };
  });
  const resizeRef = useRef<{ resizing: boolean; dir?: string; startX: number; startY: number; origW: number; origH: number; origLeft: number; origTop: number }>({ resizing: false, startX: 0, startY: 0, origW: panelSize.width, origH: panelSize.height, origLeft: panelPos.x, origTop: panelPos.y });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number; }>({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm?: () => void }>({ open: false, message: '' });
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);
  const [panelShown, setPanelShown] = useState<boolean>(false); // only show floating panel after New/Edit clicked
  const [richTextMode, setRichTextMode] = useState<'wysiwyg' | 'builtin' | 'none'>(() => { try { const r = localStorage.getItem('reportBuilderRichTextMode'); return (r as any) || 'wysiwyg'; } catch (e) { return 'wysiwyg'; } });
  const [disableRichText, setDisableRichText] = useState<boolean>(() => { try { return localStorage.getItem('reportBuilderDisableRichText') === '1'; } catch (e) { return false; } });

  useEffect(() => {
    if (!toasts || toasts.length === 0) return;
    const timers = toasts.map(t => setTimeout(() => setToasts(curr => curr.filter(x => x.id !== t.id)), 3500));
    return () => timers.forEach(t => clearTimeout(t));
  }, [toasts]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const pos = { x: Math.max(10, dragRef.current.origX + dx), y: Math.max(10, dragRef.current.origY + dy) };
      setPanelPos(pos);
      try { localStorage.setItem('reportBuilderPanelPos', JSON.stringify(pos)); } catch (err) { }
    };
    const onUp = () => { dragRef.current.dragging = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  // Resize handling: listen to document mouse moves when resizing
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current.resizing) return;
      const dx = e.clientX - resizeRef.current.startX;
      const dy = e.clientY - resizeRef.current.startY;
      let newW = resizeRef.current.origW;
      let newH = resizeRef.current.origH;
      let newLeft = panelPos.x;
      let newTop = panelPos.y;
      const dir = resizeRef.current.dir || 'se';
      if (dir === 'se') {
        newW = Math.max(220, Math.round(resizeRef.current.origW + dx));
        newH = Math.max(160, Math.round(resizeRef.current.origH + dy));
      } else if (dir === 'w') {
        newW = Math.max(220, Math.round(resizeRef.current.origW - dx));
        newLeft = Math.round(resizeRef.current.origLeft + dx);
      } else if (dir === 'n') {
        newH = Math.max(160, Math.round(resizeRef.current.origH - dy));
        newTop = Math.round(resizeRef.current.origTop + dy);
      } else if (dir === 'nw') {
        newW = Math.max(220, Math.round(resizeRef.current.origW - dx));
        newLeft = Math.round(resizeRef.current.origLeft + dx);
        newH = Math.max(160, Math.round(resizeRef.current.origH - dy));
        newTop = Math.round(resizeRef.current.origTop + dy);
      }
      const ns = { width: newW, height: newH };
      setPanelSize(ns);
      const np = { x: newLeft, y: newTop };
      setPanelPos(np);
      try { localStorage.setItem('reportBuilderPanelSize', JSON.stringify(ns)); localStorage.setItem('reportBuilderPanelPos', JSON.stringify(np)); } catch (err) { }
    };
    const onUp = () => { resizeRef.current.resizing = false; resizeRef.current.dir = undefined; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [panelPos.x, panelPos.y]);

  // When the selected activity on the editing template changes, load activity fields/questions/uploaded docs
  useEffect(() => {
    const loadForActivity = async (activityId: any) => {
      try {
        if (!activityId) {
          setActivityData(null);
          setQuestionsList([]);
          setUploadedDocs([]);
          return;
        }
        // try to locate activity from already loaded activities
        const act = activities.find(a => String(a.id) === String(activityId) || String(a.activity_id) === String(activityId));
        if (act) setActivityData(act);
        try {
          const qres = await apiFetch(`/api/questions?activityId=${activityId}`);
          if (qres.ok) {
            const jq = await qres.json(); setQuestionsList(Array.isArray(jq) ? jq : []);
          } else setQuestionsList([]);
        } catch (err) { setQuestionsList([]); }

        try {
          const dres = await apiFetch(`/api/uploaded_docs?activityId=${activityId}`);
          if (dres.ok) {
            const jd = await dres.json(); setUploadedDocs(Array.isArray(jd) ? jd : []);
          } else setUploadedDocs([]);
        } catch (err) { setUploadedDocs([]); }
      } catch (err) { console.error('Failed to load activity data', err); }
    };
    loadForActivity(editing?.activity_id);
  }, [editing?.activity_id, activities]);

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
    setPanelShown(true);
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

      // Also update the blocks array in template_json to keep it in sync with HTML
      // This ensures changes are reflected in the structured data format
      if (!Array.isArray(tplObj.blocks)) tplObj.blocks = [];
      const blockIdx = tplObj.blocks.findIndex((b: any) => String(b.id) === String(blockId));
      if (blockIdx !== -1) {
        const updatedBlock = { ...tplObj.blocks[blockIdx] };
        if (updates.left !== undefined) updatedBlock.left = updates.left;
        if (updates.top !== undefined) updatedBlock.top = updates.top;
        if (updates.html !== undefined) updatedBlock.html = updates.html;
        if (updates.meta !== undefined) updatedBlock.meta = { ...updatedBlock.meta, ...updates.meta };
        tplObj.blocks[blockIdx] = updatedBlock;
      }

      setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
    } catch (e) { console.error('Failed to apply block update', e); }
  };

  const buildTableHtml = (doc: any) => {
    try {
      const rows = Array.isArray(doc.file_content) ? doc.file_content : (Array.isArray(doc.dataset_data) ? doc.dataset_data : []);
      if (!rows || rows.length === 0) {
        return '<div>No table data</div>';
      }
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

  // Keep selectedBlock in sync when template blocks change (e.g., after resize/move/edit)
  // This ensures the inspector always shows the latest block data
  useEffect(() => {
    if (!selectedBlock || !editing) return;
    const tplObj = getTplObj(editing.template_json);
    const blocks = Array.isArray(tplObj.blocks) ? tplObj.blocks : [];
    const updatedBlock = blocks.find((b: any) => String(b.id) === String(selectedBlock.id));
    if (updatedBlock) {
      setSelectedBlock(updatedBlock);
    }
  }, [editing?.template_json, selectedBlock?.id]);

  // Inspector block edit/save/remove logic
  useEffect(() => {
    // Keep selectedBlock in sync with parent template blocks
    if (!selectedBlock || !editing) return;
    const tplObj = typeof editing.template_json === 'string' ? JSON.parse(editing.template_json) : (editing.template_json || {});
    const blocks = Array.isArray(tplObj.blocks) ? tplObj.blocks : [];
    const updatedBlock = blocks.find((b: any) => String(b.id) === String(selectedBlock.id));
    if (updatedBlock && (updatedBlock.left !== selectedBlock.left || updatedBlock.top !== selectedBlock.top || updatedBlock.html !== selectedBlock.html || JSON.stringify(updatedBlock.meta) !== JSON.stringify(selectedBlock.meta))) {
      setSelectedBlock(updatedBlock);
    }
  }, [editing?.template_json, selectedBlock?.id]);

  const startNew = () => setEditing({ id: null, name: '', activity_id: null, template_json: JSON.stringify({ html: '<div><h1>{{activity_title}}</h1><p>Report: {{report_id}}</p></div>' }) });
  // ensure clicking startNew shows panel
  const startNewShown = () => { startNew(); setPanelShown(true); };

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeHtml, setComposeHtml] = useState<string>('');

  const save = async () => {
    if (!editing || !editing.name) {
      try { await import('../components/ui/swal').then(m => m.error('Missing Name', 'Please provide a name for the template.')); } catch (e) { }
      return;
    }
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
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        try { await import('../components/ui/swal').then(m => m.error('Save Failed', txt || 'Could not save template.')); } catch (e) { }
        return;
      }
      await loadTemplates();
      setEditing(null);
      setPanelShown(false);
      try { await import('../components/ui/swal').then(m => m.success('Saved!', 'Template saved successfully.')); } catch (e) { }
    } catch (e) {
      console.error(e);
      try { await import('../components/ui/swal').then(m => m.error('Save Failed', String(e && e.message ? e.message : 'Could not save template.'))); } catch (err) { }
    }
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
    setConfirmState({
      open: true, message: 'Delete this template?', onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/admin/report_templates/${id}`, { method: 'DELETE', credentials: 'include' });
          if (res.ok) { await loadTemplates(); setToasts(t => [...t, { id: Date.now(), text: 'Template deleted' }]); }
          else { setToasts(t => [...t, { id: Date.now(), text: 'Delete failed' }]); }
        } catch (e) { console.error(e); setToasts(t => [...t, { id: Date.now(), text: 'Delete failed' }]); }
        setConfirmState({ open: false, message: '' });
      }
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Report Templates</h2>
            <div className="space-x-2">
              <Button size="sm" onClick={startNewShown}>+ New</Button>
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
                    <Button size="sm" onClick={async () => {
                      setEditing(t);
                      let builtUrl: string | null = null;
                      try {
                        setBuilding(true);
                        setBuildUrl(null);
                        setIframeLoading(true);
                        const tplObj = getTplObj(t.template_json);
                        let fmt = (tplObj.displayFormat || 'pdf').toString().toLowerCase();
                        // normalize to supported server formats (pdf|docx|xlsx). If the template
                        // asks for an unsupported format (e.g. image), fall back to PDF so the
                        // preview won't fail with "Unsupported format" on the server.
                        const supported = ['pdf', 'docx', 'xlsx'];
                        if (!supported.includes(fmt)) fmt = 'pdf';

                        // prefer canvas combined HTML if available
                        let combinedHtml = '';
                        try { if (canvasRef.current && typeof canvasRef.current.getCombinedHtml === 'function') combinedHtml = await canvasRef.current.getCombinedHtml(); } catch (e) { combinedHtml = tplObj.html || ''; }
                        if (!combinedHtml) combinedHtml = tplObj.html || '';

                        // fill placeholders with preview data before sending to server
                        const fillTemplate = (htmlStr: string) => {
                          try {
                            let out = String(htmlStr || '');
                            const qMap: Record<string, any> = {};
                            for (const q of questionsList || []) {
                              try { if (q && (q.id !== undefined)) qMap[String(q.id)] = q; if (q && (q.qid !== undefined)) qMap[String(q.qid)] = q; if (q && (q.question_id !== undefined)) qMap[String(q.question_id)] = q; } catch (e) { }
                            }
                            const answersMap: Record<string, string> = {};
                            for (const a of answersList || []) {
                              try {
                                const qid = String(a.question_id || a.questionId || a.qid || ''); if (!qid) continue;
                                if (!answersMap[qid]) { const val = (typeof a.answer_value === 'object') ? JSON.stringify(a.answer_value) : String(a.answer_value || ''); answersMap[qid] = val; }
                              } catch (e) { }
                            }
                            const escapeHtml = (s: any) => { if (s === null || s === undefined) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

                            out = out.replace(/\{\{question_(\w+)\}\}/gi, (m, qid) => {
                              const q = qMap[String(qid)] || {}; const label = q.question_text || q.questionText || q.field_name || q.fieldName || `Question ${qid}`; const ans = answersMap[String(qid)] || ''; return `<div class="report-filled"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(ans)}</div>`;
                            });

                            out = out.replace(/\{\{activity_([a-zA-Z0-9_]+)\}\}/gi, (m, field) => {
                              try { if (!activityData) return ''; const val = activityData[field] ?? activityData[field.toLowerCase()] ?? ''; return escapeHtml(val); } catch (e) { return ''; }
                            });

                            out = out.replace(/<span[^>]*data-qid=["']?(\w+)["']?[^>]*>([\s\S]*?)<\/span>/gi, (m, qid) => {
                              const q = (questionsList || []).find(x => String(x.id) === String(qid) || String(x.qid) === String(qid) || String(x.question_id) === String(qid)) || {}; const label = q.question_text || q.questionText || q.field_name || q.fieldName || `Question ${qid}`; const ans = (answersList || []).find(a => String(a.question_id || a.qid || a.questionId) === String(qid))?.answer_value || ''; return `<div class="report-filled"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(ans)}</div>`;
                            });

                            out = out.replace(/<div[^>]*data-upload-id=["']?(\d+)["']?[^>]*>[\s\S]*?<\/div>/gi, (m, id) => {
                              try {
                                const doc = (uploadedDocs || []).find(d => String(d.id) === String(id)); if (!doc) return `<div>Uploaded table ${escapeHtml(id)} not found</div>`;
                                const rows = Array.isArray(doc.file_content) ? doc.file_content : (Array.isArray(doc.dataset_data) ? doc.dataset_data : []);
                                if (!rows || rows.length === 0) return '<div>No table data</div>';
                                const keys = Object.keys(rows[0] || {});
                                let html = '<div class="uploaded-table-wrapper"><table style="border-collapse: collapse; width:100%;"><thead><tr>';
                                for (const k of keys) html += `<th style="border:1px solid #ddd;padding:6px;background:#f7f7f7;text-align:left">${escapeHtml(k)}</th>`;
                                html += '</tr></thead><tbody>';
                                for (const r of rows) { html += '<tr>'; for (const k of keys) { const val = r && typeof r === 'object' && (r[k] !== undefined && r[k] !== null) ? String(r[k]) : ''; html += `<td style="border:1px solid #ddd;padding:6px">${escapeHtml(val)}</td>`; } html += '</tr>'; }
                                html += '</tbody></table></div>';
                                return html;
                              } catch (e) { return `<div>Failed to render uploaded table ${id}</div>`; }
                            });

                            return out;
                          } catch (e) { return htmlStr || ''; }
                        };

                        const filledHtml = fillTemplate(combinedHtml);
                        // don't attempt to build empty HTML — server returns 400 for missing html
                        if (!filledHtml || String(filledHtml).trim() === '') {
                          setToasts(ts => [...ts, { id: Date.now(), text: 'Cannot preview an empty template — add content first.' }]);
                          setIframeLoading(false);
                          setBuilding(false);
                          return;
                        }

                        const payload = { html: filledHtml, format: fmt, filename: t.name || 'report', paperSize: tplObj.paperSize || 'A4', orientation: tplObj.orientation || 'portrait', context: { activityData, questionsList, answersList, uploadedDocs } };
                        try { console.debug('[ReportBuilder] preview payload', { format: fmt, htmlLength: String(filledHtml || '').length, filename: payload.filename, paperSize: payload.paperSize, orientation: payload.orientation }); } catch (e) { }

                        let builtUrl: string | null = null;
                        const res = await apiFetch('/api/build_report', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        try { console.debug('[ReportBuilder] preview response status', res.status); } catch (e) { }
                        if (res.ok) {
                          const j = await res.json();
                          try { console.debug('[ReportBuilder] preview response json', j); } catch (e) { }
                          const url = j.url || j.path || null;
                          if (url) { setBuildUrl(url); setBuildFormat(fmt); builtUrl = url; }
                          else { setToasts(ts => [...ts, { id: Date.now(), text: 'Build succeeded but server did not return a URL' }]); setIframeLoading(false); }
                        } else { const txt = await res.text(); setToasts(ts => [...ts, { id: Date.now(), text: `Build failed: ${txt}` }]); setIframeLoading(false); }

                      } catch (err) {
                        console.error('Build request failed', err);
                        setToasts(ts => [...ts, { id: Date.now(), text: 'Build request failed' }]);
                        setIframeLoading(false);
                      } finally { setBuilding(false); if (builtUrl) setIsPreviewOpen(true); }
                    }}>Preview</Button>
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
                {/* Canvas is primary design surface — full width and centered */}
                <div className="w-full">
                  <div className="mt-2 w-full">
                    <div className="border rounded p-2 min-h-[320px] bg-white w-full">
                      {/* CanvasEditor is the primary design surface. TinyMCE is used only inside the CanvasEditor when inserting rich text blocks. */}
                      <CanvasEditor
                        value={(getTplObj(editing.template_json).html) || ''}
                        initialBlocks={(getTplObj(editing.template_json).blocks) || []}
                        onChange={v => {
                          try {
                            // If CanvasEditor marked this update as immediate (insert/delete/convert), apply without debounce
                            try { (window as any).__RB_TRACE__ = (window as any).__RB_TRACE__ || []; (window as any).__RB_TRACE__.push({ ts: Date.now(), type: 'incoming', payload: v }); } catch (e) { }
                            if (v && typeof v === 'object' && (v.immediate === true)) {
                              // Clear any pending debounced update — an earlier delayed change
                              // could later overwrite this immediate change and cause inserted
                              // items to disappear. Ensure immediate updates win.
                              try { if (canvasChangeTimerRef.current) { window.clearTimeout(canvasChangeTimerRef.current); canvasChangeTimerRef.current = null; } } catch (e) { }
                              try {
                                try { console.debug('[ReportBuilder] immediate canvas update incoming', { htmlLen: String(v.html || '').length, blocks: (v.blocks || []).length }); } catch (e) { }
                                const tplObj = getTplObj(editing.template_json);
                                if (v && typeof v === 'object' && ('html' in v || 'blocks' in v)) {
                                  tplObj.html = v.html || tplObj.html || '';
                                  tplObj.blocks = v.blocks || [];
                                } else {
                                  tplObj.html = String(v || tplObj.html || '');
                                }
                                setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                              } catch (err) { console.error('Immediate canvas update failed', err); }
                              return;
                            }
                          } catch (e) { /* continue to debounce path */ }
                          // debounce rapid incoming changes to avoid parent re-setting value while editor is still active
                          try { if (canvasChangeTimerRef.current) window.clearTimeout(canvasChangeTimerRef.current); } catch (e) { }
                          canvasChangeTimerRef.current = window.setTimeout(() => {
                            try {
                              try { console.debug('[ReportBuilder] debounced canvas update incoming', { htmlLen: String((v && (v.html || '')) || '').length, blocks: (v && v.blocks ? v.blocks.length : 0) }); } catch (e) { }
                              const tplObj = getTplObj(editing.template_json);
                              if (v && typeof v === 'object' && ('html' in v || 'blocks' in v)) {
                                tplObj.html = v.html || tplObj.html || '';
                                tplObj.blocks = v.blocks || [];
                              } else {
                                tplObj.html = String(v || tplObj.html || '');
                              }
                              setEditing({ ...editing, template_json: JSON.stringify(tplObj) });
                            } catch (err) {
                              try { setEditing({ ...editing, template_json: JSON.stringify({ html: (v && v.html) || v || '' }) }); } catch (e) { }
                            }
                          }, 220) as unknown as number;
                        }}
                        ref={canvasRef}
                        showToolbox={false}
                        showInspector={true}
                        onSelect={b => setSelectedBlock(b)}
                        paperSize={(getTplObj(editing.template_json).paperSize || 'A4')}
                        orientation={(getTplObj(editing.template_json).orientation || 'portrait')}
                        margins={(getTplObj(editing.template_json).margins || { top: 20, right: 20, bottom: 20, left: 20 })}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 text-center">Drag datapoints from the panel to the right into the editor to insert placeholders or full tables. Use <code>{'{{question_QUESTIONID}}'}</code>, <code>{'{{activity_title}}'}</code>, <code>{'{{report_id}}'}</code>.</div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setEditing(null); setPanelShown(false); }}>Cancel</Button>
                  <Button onClick={save}>Save Template</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Select or create a template to edit.</div>
            )}
          </Card>
        </div>
      </div>

      {panelShown && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef as any} onDrop={async (e) => {
          e.preventDefault();
          // handle file drops: upload images and insert into canvas
          try {
            const files = Array.from(e.dataTransfer?.files || []) as File[];
            for (const f of files) {
              if (!f || !f.type || !f.type.startsWith || !f.type.startsWith('image/')) continue;
              const reader = new FileReader();
              reader.onload = async (ev) => {
                const dataUrl = ev.target?.result as string;
                try {
                  const res = await apiFetch('/api/template_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentBase64: dataUrl, mimeType: f.type }) });
                  if (res.ok) {
                    const j = await res.json();
                    const url = j.url || j.path || dataUrl;
                    try { canvasRef.current?.insertHtml?.(`<img src="${url}" style="max-width:100%"/>`); } catch (err) { canvasRef.current?.insertImageUrl?.(); }
                    // show a quick toast
                    setToasts(t => [...t, { id: Date.now(), text: `Inserted image ${f.name}` }]);
                  } else {
                    canvasRef.current?.insertHtml?.(`<img src="${dataUrl}" style="max-width:100%"/>`);
                    setToasts(t => [...t, { id: Date.now(), text: `Inserted image (local) ${f.name}` }]);
                  }
                } catch (err) {
                  console.error('Upload failed', err);
                  canvasRef.current?.insertHtml?.(`<img src="${dataUrl}" style="max-width:100%"/>`);
                  setToasts(t => [...t, { id: Date.now(), text: `Inserted image (fallback) ${f.name}` }]);
                }
              };
              reader.readAsDataURL(f as Blob);
            }
          } catch (err) { console.error('Panel drop handling failed', err); }
        }} onDragOver={e => e.preventDefault()} style={{ position: 'fixed', left: panelPos.x, top: panelPos.y, width: panelSize.width, height: panelSize.height, zIndex: 9999, maxHeight: '90vh', overflowY: 'auto' }} className="bg-white border rounded shadow-lg p-3">
          <div className="cursor-move mb-2 font-medium flex items-center justify-between" onMouseDown={(e) => { try { dragRef.current.dragging = true; dragRef.current.startX = (e as any).clientX; dragRef.current.startY = (e as any).clientY; dragRef.current.origX = panelPos.x; dragRef.current.origY = panelPos.y; } catch (err) { } }}>
            <div className="flex items-center gap-2 w-full">
              <div className="flex items-center gap-2">
                <button className="text-xs p-1 rounded transition-transform" onClick={() => setPanelCollapsed(p => !p)} aria-label="Toggle Preview Panel">
                  <svg className={`w-4 h-4 transform transition-transform ${panelCollapsed ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="font-medium">Preview Panel</div>
              </div>

              <div className="flex-1 text-right">
                <div className="text-xs text-gray-500">Drag to move</div>
              </div>
            </div>
          </div>

          {/* Report Name, Activity and Toolbox are always visible (toolbox remains collapsed by default) */}
          <div className="mb-2">
            <label className="block text-xs text-gray-500">Report Name</label>
            <input dir="ltr" className="mt-1 block w-full border rounded p-2 text-sm" value={editing?.name || ''} onChange={e => setEditing(prev => ({ ...(prev || { id: null, name: '', activity_id: null, template_json: JSON.stringify({ html: '' }) }), name: e.target.value }))} />
          </div>
          <div className="mb-2">
            <label className="block text-xs text-gray-500">Activity (optional)</label>
            <select className="mt-1 block w-full border rounded p-2 text-sm" value={editing?.activity_id || ''} onChange={e => setEditing(prev => ({ ...(prev || { id: null, name: '', activity_id: null, template_json: JSON.stringify({ html: '' }) }), activity_id: e.target.value || null }))}>
              <option value="">(Any activity)</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>

          {/* Inspector moved above Toolbox — click an object to view/edit properties */}
          {selectedBlock && (
            <div className="mt-3 p-2 border rounded bg-white text-xs">
              <div className="font-medium mb-1">Selected Block</div>
              {selectedBlock.type === 'placeholder' ? (
                <>
                  <div className="mb-2 text-xs text-gray-600">Editing placeholder. You can change its label or metadata.</div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Label</label>
                    <input dir="ltr" className="w-full border p-1 text-sm" value={(selectedBlock.meta && selectedBlock.meta.label) || ''} onChange={e => setBlockEditHtml(e.target.value)} />
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
                  {/* show z-order position badge */}
                  {(() => {
                    try {
                      const tplObj = getTplObj(editing?.template_json);
                      const blocks = Array.isArray(tplObj.blocks) ? tplObj.blocks : [];
                      const zPos = blocks.findIndex((b: any) => String(b.id) === String(selectedBlock?.id));
                      if (zPos !== -1) return <div className="mb-2 text-xs text-gray-500">Z-index: <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs">{zPos}</span></div>;
                    } catch (e) { }
                    return null;
                  })()}
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
                    <div className="w-full border p-1 bg-white">
                      <WysiwygEditor value={blockEditHtml || ''} onChange={v => setBlockEditHtml(v)} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end items-center">
                    <div className="flex items-center gap-1 mr-1">
                      <button title="Send backward" className="p-1 border rounded text-xs" onClick={() => { try { canvasRef.current?.sendBackward?.(selectedBlock.id); setSelectedBlock(prev => prev ? { ...prev } : prev); } catch (e) { console.error(e); } }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button title="Bring forward" className="p-1 border rounded text-xs" onClick={() => { try { canvasRef.current?.bringForward?.(selectedBlock.id); setSelectedBlock(prev => prev ? { ...prev } : prev); } catch (e) { console.error(e); } }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button title="Send to back" className="p-1 border rounded text-xs" onClick={() => { try { canvasRef.current?.sendToBack?.(selectedBlock.id); setSelectedBlock(prev => prev ? { ...prev } : prev); } catch (e) { console.error(e); } }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" /></svg>
                      </button>
                      <button title="Bring to front" className="p-1 border rounded text-xs" onClick={() => { try { canvasRef.current?.bringToFront?.(selectedBlock.id); setSelectedBlock(prev => prev ? { ...prev } : prev); } catch (e) { console.error(e); } }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" /></svg>
                      </button>
                    </div>
                    <button className="p-1 border rounded text-xs" onClick={() => {
                      if (!selectedBlock) return;
                      setConfirmState({
                        open: true, message: 'Remove this block?', onConfirm: () => {
                          try {
                            try { (canvasRef.current as any)?.deleteBlock?.(selectedBlock.id); } catch (e) { console.error('canvas delete failed', e); }
                            setSelectedBlock(null);
                            setToasts(t => [...t, { id: Date.now(), text: 'Block removed' }]);
                          } catch (e) { console.error(e); setToasts(t => [...t, { id: Date.now(), text: 'Failed to remove block' }]); }
                          setConfirmState({ open: false, message: '' });
                        }
                      });
                    }}>Remove</button>
                    <button className="p-1 bg-primary-600 text-white rounded text-xs" onClick={() => {
                      if (!selectedBlock) return;
                      const leftNum = Number(blockEditLeft || 0);
                      const topNum = Number(blockEditTop || 0);
                      // Update block on canvas with immediate emit change — the parent onChange handler will
                      // automatically persist both html and blocks to template_json when it receives the immediate update
                      try {
                        (canvasRef.current as any)?.updateBlock?.(selectedBlock.id, { left: leftNum, top: topNum, html: blockEditHtml });
                      } catch (e) { console.error('Failed to update block on canvas', e); }
                      // Update local selectedBlock state so inspector reflects the change
                      setSelectedBlock({ ...selectedBlock, left: leftNum, top: topNum, html: blockEditHtml });
                    }}>Save</button>
                  </div>
                </>
              )}
            </div>
          )}

          <details className="mb-2 p-2 border rounded bg-gray-50">
            <summary className="cursor-pointer font-medium">Toolbox</summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <div>
                <label className="block text-xs text-gray-500">Rich Text Editor</label>
                <select className="mt-1 block w-full border rounded p-2 text-sm" value={richTextMode} onChange={e => { setRichTextMode(e.target.value as any); try { localStorage.setItem('reportBuilderRichTextMode', e.target.value); } catch (err) { } }}>
                  <option value="wysiwyg">TinyMCE / WYSIWYG</option>
                  <option value="builtin">Built-in RichTextEditor</option>
                  <option value="none">Disable rich text</option>
                </select>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2"><input id="disableRT" type="checkbox" checked={disableRichText} onChange={e => { setDisableRichText(e.target.checked); try { localStorage.setItem('reportBuilderDisableRichText', e.target.checked ? '1' : '0'); } catch (err) { } }} /> <label htmlFor="disableRT">Disable rich text entirely</label></div>
              </div>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => { if (disableRichText || richTextMode === 'none') { setComposeHtml('<div><p>New text</p></div>'); setComposeOpen(true); } else { setComposeHtml(''); setComposeOpen(true); } }}>Insert Text</button>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertBlock?.()}>Insert Block</button>
              <button className="w-full p-2 border rounded text-sm text-left" onClick={() => canvasRef.current?.insertPlaceholder?.()}>Insert Placeholder</button>
              <div className="flex gap-2">
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => fileInputRef.current?.click()}>Insert Image (upload)</button>
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => canvasRef.current?.insertImageUrl?.()}>Insert Image (URL)</button>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => { try { canvasRef.current?.undo?.(); } catch (e) { document.execCommand && document.execCommand('undo'); } }}>Undo</button>
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => { try { canvasRef.current?.redo?.(); } catch (e) { document.execCommand && document.execCommand('redo'); } }}>Redo</button>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => canvasRef.current?.zoomIn?.()}>Zoom +</button>
                <button className="flex-1 p-2 border rounded text-sm" onClick={() => canvasRef.current?.zoomOut?.()}>Zoom -</button>
              </div>
            </div>
          </details>



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
                <div>
                  <label className="block text-xs text-gray-500">Watermark Image(center)</label>
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
                  <label className="block text-xs text-gray-500">Assets (JSON)</label>
                  <input className="mt-1 block w-full border rounded p-2 text-sm" value={(getTplObj(editing?.template_json).assets ? JSON.stringify(getTplObj(editing?.template_json).assets) : '') || ''} onChange={e => {
                    try { const tplObj = getTplObj(editing?.template_json); tplObj.assets = e.target.value ? JSON.parse(e.target.value) : null; setEditing({ ...editing, template_json: JSON.stringify(tplObj) }); } catch (err) { /* ignore parse errors while typing */ }
                  }} />
                </div>
              </div>
            </div>
          </details>
          <details className="mb-2">
            <summary className="cursor-pointer text-xs font-medium">Activity Fields</summary>
            {activityData ? (
              <div className="mt-2 mb-2 text-xs text-gray-700 max-h-40 overflow-auto border rounded p-2 bg-gray-50 space-y-1">
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
              <div className="mt-2 text-xs text-gray-400">No activity selected.</div>
            )}
          </details>

          <details className="mb-2">
            <summary className="cursor-pointer font-medium text-sm">Questions</summary>
            <div className="mt-2 max-h-40 overflow-auto space-y-2 mb-2">
              {questionsList.length === 0 && <div className="text-xs text-gray-400">No questions for selected activity.</div>}
              {questionsList.map((q: any) => {
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
          </details>

          <details className="mt-2 mb-2">
            <summary className="cursor-pointer font-medium text-sm">Uploaded Tables</summary>
            <div className="mt-2 max-h-44 overflow-auto">
              {uploadedDocs.length === 0 && <div className="text-xs text-gray-400">No uploaded tables for this activity.</div>}
              {uploadedDocs.map((doc: any) => (
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
          </details>



          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500">Drag items into the editor to insert their placeholder or table headers.</div>
            <Button size="xs" variant="secondary" onClick={() => setIsGuideOpen(true)}>Guide</Button>
          </div>
          {/* Resize handles */}
          <div onMouseDown={(e) => {
            e.stopPropagation();
            resizeRef.current.resizing = true;
            resizeRef.current.dir = 'se';
            resizeRef.current.startX = (e as any).clientX;
            resizeRef.current.startY = (e as any).clientY;
            resizeRef.current.origW = panelSize.width;
            resizeRef.current.origH = panelSize.height;
            resizeRef.current.origLeft = panelPos.x;
            resizeRef.current.origTop = panelPos.y;
          }} style={{ position: 'absolute', right: 8, bottom: 8, width: 18, height: 18, cursor: 'se-resize', zIndex: 10000 }} title="Resize panel">
            <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border">
              <svg viewBox="0 0 24 24" width="12" height="12" className="opacity-70"><path d="M7 17l10-10M11 17l6-6M15 17l2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            </div>
          </div>

          {/* left handle visible grip */}
          <div onMouseDown={(e) => {
            e.stopPropagation();
            resizeRef.current.resizing = true;
            resizeRef.current.dir = 'w';
            resizeRef.current.startX = (e as any).clientX;
            resizeRef.current.startY = (e as any).clientY;
            resizeRef.current.origW = panelSize.width;
            resizeRef.current.origH = panelSize.height;
            resizeRef.current.origLeft = panelPos.x;
            resizeRef.current.origTop = panelPos.y;
          }} style={{ position: 'absolute', left: 6, bottom: 8, width: 18, height: 22, cursor: 'ew-resize', zIndex: 10000 }} title="Resize from left (drag)">
            <div className="w-full h-full flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="10" height="18" className="opacity-60"><g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6 6h8" /><path d="M6 12h8" /><path d="M6 18h8" /></g></svg>
            </div>
          </div>
          {/* top handle visible grip */}
          <div onMouseDown={(e) => {
            e.stopPropagation();
            resizeRef.current.resizing = true;
            resizeRef.current.dir = 'n';
            resizeRef.current.startX = (e as any).clientX;
            resizeRef.current.startY = (e as any).clientY;
            resizeRef.current.origW = panelSize.width;
            resizeRef.current.origH = panelSize.height;
            resizeRef.current.origLeft = panelPos.x;
            resizeRef.current.origTop = panelPos.y;
          }} style={{ position: 'absolute', right: 8, top: 6, width: 36, height: 16, cursor: 'ns-resize', zIndex: 10000 }} title="Resize from top (drag)">
            <div className="w-full h-full flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="20" height="8" className="opacity-60"><g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 6h12" /><path d="M6 10h12" /></g></svg>
            </div>
          </div>
        </div>, document.body
      )
      }

      {/* hidden file input for inserting images */}
      <input ref={fileInputRef as any} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        try {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            try {
              const res = await apiFetch('/api/template_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentBase64: dataUrl, mimeType: f.type }) });
              if (res.ok) {
                const j = await res.json();
                const url = j.url || j.path || dataUrl;
                // prefer inserting as a positioned block so it can be moved freely
                try { canvasRef.current?.insertBlock?.({ html: `<img src="${url}" style="max-width:100%"/>`, left: 60, top: 60 }); } catch (e) { try { canvasRef.current?.insertHtml?.(`<img src="${url}" style="max-width:100%"/>`); } catch (err) { canvasRef.current?.insertImageUrl?.(); } }
              } else {
                // fallback to data URL insertion (try positioned block first)
                try { canvasRef.current?.insertBlock?.({ html: `<img src="${dataUrl}" style="max-width:100%"/>`, left: 60, top: 60 }); } catch (err) { canvasRef.current?.insertHtml?.(`<img src="${dataUrl}" style="max-width:100%"/>`); }
              }
            } catch (err) {
              console.error('Upload failed', err);
              try { canvasRef.current?.insertBlock?.({ html: `<img src="${dataUrl}" style="max-width:100%"/>`, left: 60, top: 60 }); } catch (err2) { canvasRef.current?.insertHtml?.(`<img src="${dataUrl}" style="max-width:100%"/>`); }
            }
          };
          reader.readAsDataURL(f);
        } catch (err) { console.error('Image read failed', err); }
        // reset input
        (ev.target as HTMLInputElement).value = '';
      }} />

      {/* Compose modal for inserting rich text / blocks */}
      <Modal isOpen={composeOpen} onClose={() => setComposeOpen(false)} title="Compose Text Block" size="lg">
        <div>
          {disableRichText || richTextMode === 'none' ? (
            <textarea dir="ltr" className="w-full h-48 border p-2" value={composeHtml} onChange={e => setComposeHtml(e.target.value)} />
          ) : (richTextMode === 'builtin' ? (
            <RichTextEditor value={composeHtml} onChange={v => setComposeHtml(v)} />
          ) : (
            <WysiwygEditor value={composeHtml} onChange={v => setComposeHtml(v)} />
          ))}
          <div className="flex justify-end gap-2 mt-3">
            <button className="p-2 border rounded" onClick={() => setComposeOpen(false)}>Cancel</button>
            <button className="p-2 bg-primary-600 text-white rounded" onClick={() => {
              try {
                // try to insert as positioned block so it can be moved and printed in place
                canvasRef.current?.insertBlock?.({ html: composeHtml || '<div></div>', left: 60, top: 60 });
              } catch (err) {
                try { canvasRef.current?.insertHtml?.(composeHtml || '<div></div>'); } catch (e) { console.error('Insert failed', e); }
              }
              setComposeOpen(false);
            }}>Insert</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isPreviewOpen} onClose={() => { setIsPreviewOpen(false); setEditing(null); setBuildUrl(null); }} title={`Preview Template ${editing?.name || ''}`} size="xl">
        <div className="prose max-w-full">
          {editing && (() => {
            try {
              const tplObj = getTplObj(editing.template_json);
              let tplHtml = tplObj.html || '';
              // if we have a server-built URL, show it (PDF inline or download link for other formats)
              if (buildUrl) {
                // compute paper size in px to display exact paper area scaled
                const paperMm: Record<string, { w: number; h: number }> = { A4: { w: 210, h: 297 }, Letter: { w: 216, h: 279 }, A3: { w: 297, h: 420 } };
                const mm = paperMm[tplObj.paperSize] || paperMm['A4'];
                const physW = tplObj.orientation === 'landscape' ? mm.h : mm.w;
                const physH = tplObj.orientation === 'landscape' ? mm.w : mm.h;
                const pxPerMm = 96 / 25.4;
                const widthPx = Math.round(physW * pxPerMm);
                const heightPx = Math.round(physH * pxPerMm);
                let scale = 1;
                if (typeof window !== 'undefined') {
                  const maxW = Math.min((window.innerWidth || 1200) * 0.75, 1100);
                  const maxH = Math.min((window.innerHeight || 800) * 0.8, 1400);
                  scale = Math.min(1, maxW / widthPx, maxH / heightPx);
                }
                if ((buildFormat || 'pdf') === 'pdf') {
                  return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{ border: '1px solid #ddd', padding: 8, background: '#fff' }}>
                        <div style={{ width: Math.round(widthPx * scale), height: Math.round(heightPx * scale), overflow: 'hidden', transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
                          {/* loading overlay while server builds or iframe is loading */}
                          {(building || iframeLoading) && (
                            <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)', zIndex: 50 }}>
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-4 border-t-primary-600 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#2563eb' }} />
                                <div className="text-sm text-gray-700">Loading PDF…</div>
                              </div>
                            </div>
                          )}
                          <iframe title="template-preview-built" src={buildUrl || ''} onLoad={() => { try { setIframeLoading(false); } catch (e) { } }} style={{ width: widthPx + 'px', height: heightPx + 'px', border: 0 }} />
                        </div>
                      </div>
                    </div>
                  );
                }
                // DOCX/XLSX embed via Office Online viewer (note: requires public access to the file URL)
                if ((buildFormat || '').toLowerCase() === 'docx' || (buildFormat || '').toLowerCase() === 'xlsx') {
                  try {
                    const base = getApiBase() || '';
                    const absolute = `${base}${buildUrl}`;
                    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absolute)}`;
                    return <div style={{ width: '100%', height: 700 }}><iframe title="office-preview" src={officeUrl} style={{ width: '100%', height: '100%', border: 0 }} /></div>;
                  } catch (e) {
                    return <div className="p-4"><a href={buildUrl || ''} target="_blank" rel="noreferrer" className="p-2 bg-primary-600 text-white rounded inline-block">Download {(buildFormat || 'file').toUpperCase()}</a></div>;
                  }
                }
                // image inline preview
                if ((buildFormat || '').toLowerCase() === 'image') {
                  return <div style={{ display: 'flex', justifyContent: 'center' }}><img src={buildUrl || ''} style={{ maxWidth: '100%', maxHeight: '80vh' }} alt="preview" /></div>;
                }
                // other formats: provide download link
                return <div className="p-4"><a href={buildUrl || ''} target="_blank" rel="noreferrer" className="p-2 bg-primary-600 text-white rounded inline-block">Download {(buildFormat || 'file').toUpperCase()}</a></div>;
              }

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
      {/* Confirm modal (simple) */}
      {
        confirmState.open && (
          <Modal isOpen={confirmState.open} onClose={() => setConfirmState({ open: false, message: '' })} title="Confirm" size="sm">
            <div className="text-sm p-2">{confirmState.message}</div>
            <div className="flex justify-end gap-2 mt-3">
              <button className="p-2 border rounded" onClick={() => setConfirmState({ open: false, message: '' })}>Cancel</button>
              <button className="p-2 bg-primary-600 text-white rounded" onClick={() => { try { confirmState.onConfirm && confirmState.onConfirm(); } catch (e) { setConfirmState({ open: false, message: '' }); } }}>Confirm</button>
            </div>
          </Modal>
        )
      }

      {/* Toasts */}
      <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 99999 }}>
        <div className="flex flex-col items-end space-y-2">
          {toasts.map(t => (
            <div key={t.id} className="bg-black/80 text-white text-sm px-3 py-2 rounded shadow">{t.text}</div>
          ))}
        </div>
      </div>
    </div >
  );
};

export default ReportBuilderPage;
