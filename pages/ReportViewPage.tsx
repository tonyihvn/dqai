import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import ConversationPanel from '../components/ui/ConversationPanel';
import Modal from '../components/ui/Modal';
import { confirm as swalConfirm, success as swalSuccess, error as swalError } from '../components/ui/swal';
import RichTextEditor from '../components/ui/RichTextEditor';
import { apiFetch, getApiBase } from '../utils/api';

const ReportViewPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activityTitle, setActivityTitle] = useState<string | null>(null);
  const [powerbiConfig, setPowerbiConfig] = useState<any>(null);
  const [builtTemplate, setBuiltTemplate] = useState<any>(null);
  const [powerbiModalOpen, setPowerbiModalOpen] = useState(false);
  const [paperPreviewOpen, setPaperPreviewOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewContent, setReviewContent] = useState<string>(report?.reviewersReport || '');
  const [reviewScore, setReviewScore] = useState<number | null>(report?.overallScore ?? null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(report?.status ?? null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  const saveReview = async () => {
    if (!report) return;
    try {
      const payload: any = { reviewers_report: reviewContent, overall_score: reviewScore, status: reviewStatus };
      const res = await apiFetch(`/api/reports/${report.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const updated = await res.json();
        setReport(prev => ({ ...prev, reviewersReport: updated.reviewers_report || updated.reviewersReport, overallScore: updated.overall_score || updated.overallScore, status: updated.status || prev?.status }));
        setReviewModalOpen(false);
      } else {
        try { swalError('Save failed', 'Failed to save review'); } catch (e) { }
      }
    } catch (e) { console.error(e); try { swalError('Save failed', 'Failed to save review'); } catch (er) { } }
  };

  // Helper to insert HTML into the review content (used after uploads)
  const insertHtmlAtCaret = (html: string) => {
    const editor = document.getElementById('review-editor');
    if (!editor) {
      setReviewContent((prev) => (prev || '') + html);
      return;
    }
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.getRangeAt || sel.rangeCount === 0) {
      editor.insertAdjacentHTML('beforeend', html);
      setReviewContent((prev) => (editor as HTMLElement).innerHTML || '');
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const el = document.createElement('div');
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node, lastNode;
    while ((node = el.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setReviewContent((editor as HTMLElement).innerHTML || '');
  };

  const uploadMedia = async (file: File) => {
    if (!report) return null;
    const reader = new FileReader();
    return await new Promise<string | null>((resolve) => {
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        try {
          const res = await apiFetch('/api/review_uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reportId: report.id, filename: file.name, contentBase64: dataUrl, mimeType: file.type }) });
          if (res.ok) {
            const j = await res.json();
            resolve(j.url);
            return;
          }
        } catch (e) { console.error(e); }
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const r = await apiFetch(`/api/reports/${reportId}`, { credentials: 'include' });
        if (!r.ok) { console.error('Failed to load report'); setLoading(false); return; }
        const jr = await r.json();
        setReport(jr);
        // fetch answers and questions so we can show labels, pages, sections
        const [aRes, qRes, docs] = await Promise.all([
          apiFetch(`/api/answers?reportId=${reportId}`, { credentials: 'include' }),
          apiFetch(`/api/questions?activityId=${jr.activity_id}`, { credentials: 'include' }),
          apiFetch(`/api/uploaded_docs?reportId=${jr.id}`, { credentials: 'include' })
        ]);
        if (aRes.ok) setAnswers(await aRes.json() || []);
        if (qRes.ok) setQuestions(await qRes.json() || []);
        if (docs.ok) setUploadedDocs(await docs.json() || []);
        // fetch activity title
        try {
          const actRes = await apiFetch(`/api/activities/${jr.activity_id}`, { credentials: 'include' });
          if (actRes.ok) {
            const act = await actRes.json(); setActivityTitle(act.title || act.activityTitle || act.name || null);
          }
        } catch (e) { }
        // fetch powerbi config (public)
        try {
          const pb = await apiFetch(`/api/reports/${jr.id}/powerbi`);
          if (pb.ok) { const j = await pb.json(); setPowerbiConfig(j); }
        } catch (e) { }
        // fetch associated template if available
        try {
          if (jr.report_template_id) {
            const t = await apiFetch(`/api/report_templates/${jr.report_template_id}`);
            if (t.ok) { const tj = await t.json(); setBuiltTemplate(tj); }
          }
        } catch (e) { /* ignore */ }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [reportId]);

  // sync review modal default values when report loads
  useEffect(() => {
    if (!report) return;
    try {
      // don't overwrite content if user is actively editing the review (caret inside editor)
      const active = document.activeElement as HTMLElement | null;
      const inEditor = active && (active.closest ? (active.closest('.richtext-editor') || active.closest('#review-editor')) : false);
      if (inEditor) return;
    } catch (e) { }
    setReviewContent(report.reviewersReport || report.reviewers_report || '');
    setReviewScore(report.overallScore ?? report.overall_score ?? null);
    setReviewStatus(report.status || null);
  }, [report]);

  if (loading) return <div>Loading...</div>;
  if (!report) return <div>Report not found.</div>;

  const handlePrint = () => window.print();

  const handlePrintFormatted = async () => {
    // Open the server PDF/HTML endpoint in a new tab so the browser handles rendering or download.
    try {
      const base = getApiBase();
      const url = base ? `${base}/api/reports/${report.id}/pdf` : `/api/reports/${report.id}/pdf`;
      // open a new tab/window — the server will return application/pdf or text/html
      window.open(url, '_blank');
    } catch (e) { console.error('Open PDF endpoint failed', e); alert('Failed to open PDF'); }
  };

  const handlePreviewPdf = async () => {
    try {
      const base = getApiBase();
      const url = base ? `${base}/api/reports/${report.id}/pdf?template=1` : `/api/reports/${report.id}/pdf?template=1`;
      window.open(url, '_blank');
    } catch (e) { console.error('Open PDF preview failed', e); alert('Failed to open PDF preview'); }
  };

  const getPaperDimensions = (tplObj: any) => {
    // returns { widthMm, heightMm }
    const map: Record<string, { w: number; h: number }> = {
      'A4': { w: 210, h: 297 },
      'A3': { w: 297, h: 420 },
      'Letter': { w: 215.9, h: 279.4 }
    };
    const paper = (tplObj?.paperSize || tplObj?.paper || 'A4');
    const orient = (tplObj?.orientation || tplObj?.orient || 'portrait');
    const dims = map[paper] || map['A4'];
    if (orient === 'landscape') return { widthMm: dims.h, heightMm: dims.w };
    return { widthMm: dims.w, heightMm: dims.h };
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Report ${report.id} from ${report.submission_date}`);
    const body = encodeURIComponent(`Please see report ${report.id} for activity ${report.activity_id}.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const savePowerBi = async (payload: any) => {
    try {
      // sanitize payload.powerbi_link: if user pasted an iframe HTML snippet, extract the src attribute
      const extractUrlFromIframe = (maybeIframe: any) => {
        if (!maybeIframe) return null;
        if (typeof maybeIframe !== 'string') return String(maybeIframe);
        const s = maybeIframe.trim();
        // if it looks like an iframe tag, extract src
        if (s.startsWith('<iframe') || /<iframe/i.test(s)) {
          const m = s.match(/src\s*=\s*"([^"]+)"/) || s.match(/src\s*=\s*'([^']+)'/) || s.match(/src\s*=\s*([^\s>]+)/);
          if (m && m[1]) return m[1];
        }
        // If it's a data URL or relative path, return as-is; callers will validate
        return s;
      };
      if (payload && payload.powerbi_link) payload.powerbi_link = extractUrlFromIframe(payload.powerbi_link);
      const res = await apiFetch(`/api/admin/reports/${report.id}/powerbi`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, powerbi_url: payload.powerbi_link || payload.powerbi_url }) });
      if (res.ok) {
        const j = await res.json();
        setPowerbiConfig(j);
        try { swalSuccess('Saved', 'Power BI config saved'); } catch (e) { }
        return true;
      }
      try { swalError('Failed', 'Unable to save Power BI config'); } catch (e) { }
      return false;
    } catch (e) { console.error(e); try { swalError('Failed', 'Unable to save Power BI config'); } catch (er) { } return false; }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{activityTitle ? `${activityTitle} — Report ${report.id}` : `Report ${report.id}`}</h1>
          <p className="text-sm text-gray-500">Submitted: {new Date(report.submission_date).toLocaleString()}</p>
          <div className="inline-flex items-center gap-2">
            <Button onClick={handlePrintFormatted}>Download PDF</Button>
            <Button variant="secondary" onClick={handlePreviewPdf}>Preview PDF</Button>
            {builtTemplate && (
              <Button
                variant="secondary"
                onClick={() => setPaperPreviewOpen(true)}
                title="Open the built report template with this report's answers"
              >
                {(() => {
                  // Extract template name from builtTemplate
                  if (builtTemplate.name) return builtTemplate.name;
                  if (typeof builtTemplate.template_json === 'string') {
                    try {
                      const parsed = JSON.parse(builtTemplate.template_json);
                      return parsed.name || 'View Report';
                    } catch (e) {
                      return 'View Report';
                    }
                  }
                  return builtTemplate.template_json?.name || 'View Report';
                })()}
              </Button>
            )}
            <Button variant="secondary" onClick={handleEmail}>Forward via Email</Button>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/activities/${report.activity_id}/followups?reportId=${report.id}`)}>Edit Followups</Button>
          <div className="inline-flex items-center gap-2">
            {report?.status !== 'Completed' && (
              <Button onClick={() => setReviewModalOpen(true)}>Add / Edit Review</Button>
            )}
            {builtTemplate && (
              <Button onClick={async () => {
                try {
                  const tplObj = (typeof builtTemplate.template_json === 'string') ? JSON.parse(builtTemplate.template_json || '{}') : (builtTemplate.template_json || {});
                  const fmt = (tplObj.displayFormat || 'pdf').toString().toLowerCase();
                  const base = getApiBase();
                  const baseUrl = base || '';
                  let url = '';
                  if (fmt === 'pdf') url = `${baseUrl}/api/reports/${report.id}/pdf?template=1`;
                  else if (fmt === 'docx') url = `${baseUrl}/api/reports/${report.id}/docx?template=1`;
                  else if (fmt === 'xlsx') url = `${baseUrl}/api/reports/${report.id}/xlsx?template=1`;
                  else if (fmt === 'image') url = `${baseUrl}/api/reports/${report.id}/image?template=1`;
                  else url = `${baseUrl}/api/reports/${report.id}/pdf?template=1`;

                  // derive a user-friendly filename from template settings if provided
                  const filenameFormat = tplObj.filenameFormat || tplObj.fileName || tplObj.nameFormat || builtTemplate.name || `report_${report.id}`;
                  const interpolate = (str: string) => {
                    return String(str || '').replace(/\{\{\s*activity_title\s*\}\}/gi, activityTitle || '')
                      .replace(/\{\{\s*report_id\s*\}\}/gi, String(report.id || ''))
                      .replace(/\{\{\s*submission_date\s*\}\}/gi, String(report.submission_date || '')).replace(/[^a-zA-Z0-9-_\. ]/g, '_');
                  };
                  const filename = interpolate(filenameFormat) + (fmt === 'pdf' ? '.pdf' : fmt === 'docx' ? '.docx' : fmt === 'xlsx' ? '.xlsx' : fmt === 'image' ? '.png' : '.pdf');

                  // attempt to fetch and download with a controlled filename
                  const resp = await fetch(url, { credentials: 'include' });
                  if (!resp.ok) { window.open(url, '_blank'); return; }
                  const blob = await resp.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl); }, 500);
                } catch (e) {
                  try { const tplObj = (typeof builtTemplate.template_json === 'string') ? JSON.parse(builtTemplate.template_json || '{}') : (builtTemplate.template_json || {}); const fmt = (tplObj.displayFormat || 'pdf').toString().toLowerCase(); const base = getApiBase(); const baseUrl = base || ''; let url = fmt === 'docx' ? `${baseUrl}/api/reports/${report.id}/docx?template=1` : fmt === 'xlsx' ? `${baseUrl}/api/reports/${report.id}/xlsx?template=1` : `${baseUrl}/api/reports/${report.id}/pdf?template=1`; window.open(url, '_blank'); } catch (err) { console.error(err); }
                }
              }}>{`Download: ${builtTemplate.name || 'Built Report'}`}</Button>
            )}
          </div>
        </div>
      </div>

      {/* Reviewer's report shown first */}
      <Card>
        <h2 className="text-lg font-semibold mb-2">Reviewer's Report</h2>
        <div className="mb-2">
          <div className="text-sm text-gray-700">Status: <span className="font-medium">{report.status || '—'}</span></div>
          <div className="text-sm text-gray-700">Overall Score: <span className="font-medium">{report.overallScore ?? report.overall_score ?? '—'}</span></div>
        </div>
        <div className="prose max-w-full" dangerouslySetInnerHTML={{ __html: report.reviewersReport || report.reviewers_report || '<em>No review yet</em>' }} />
      </Card>

      {/* Power BI Card */}
      <Card>
        <h2 className="text-lg font-semibold mb-2">Power BI</h2>
        {powerbiConfig && powerbiConfig.mode && powerbiConfig.mode.toLowerCase() === 'disabled' && <div className="text-sm text-gray-500 mb-2">Power BI embed is disabled for this report.</div>}
        {powerbiConfig && powerbiConfig.mode && powerbiConfig.mode.toLowerCase() === 'enabled' && powerbiConfig.powerbi_link && (
          <div className="mb-4">
            <div className="text-sm text-gray-700 mb-2">Embedded Power BI</div>
            <div style={{ width: '100%', minHeight: 360 }}>
              {(() => {
                const extractUrlFromIframe = (maybeIframe: any) => {
                  if (!maybeIframe) return null;
                  if (typeof maybeIframe !== 'string') return String(maybeIframe);
                  const s = maybeIframe.trim();
                  if (s.startsWith('<iframe') || /<iframe/i.test(s)) {
                    const m = s.match(/src\s*=\s*"([^"]+)"/) || s.match(/src\s*=\s*'([^']+)'/) || s.match(/src\s*=\s*([^\s>]+)/);
                    if (m && m[1]) return m[1];
                  }
                  return s;
                };
                const raw = powerbiConfig.powerbi_link;
                const url = extractUrlFromIframe(raw);
                // basic validation: must be absolute http(s) URL
                if (!url || !/^https?:\/\//i.test(url)) {
                  return <div className="text-sm text-red-500">Invalid Power BI link. Please paste the embed URL (or the iframe snippet) and save.</div>;
                }
                return <iframe src={url} title={`powerbi-${report.id}`} style={{ width: '100%', height: 480, border: 'none' }} />;
              })()}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">Manage Power BI settings for this report.</div>
            <Button onClick={() => setPowerbiModalOpen(true)}>Configure Power BI</Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Submitted Answers</h2>
        {/* DataTable with column-level filter */}
        {(() => {
          const columns = [
            { key: 'page', label: 'Page' },
            { key: 'section', label: 'Section' },
            { key: 'question', label: 'Question' },
            {
              key: 'answer', label: 'Answer', render: (row: any) => {
                // row._raw contains the original answer object
                const a = row._raw;
                if (!a) return '—';
                const v = a.answer_value;
                const isString = typeof v === 'string';
                const maybeUrl = (s?: any) => {
                  if (!s) return null;
                  if (typeof s !== 'string') return null;
                  if (/^data:image\//i.test(s)) return s;
                  if (/^https?:\/\//i.test(s)) return s;
                  return null;
                };
                // If answer_value is an object, try common file keys
                let url: string | null = null;
                if (isString) url = maybeUrl(v as string) || String(v as string);
                else if (v && typeof v === 'object') {
                  url = (v.url || v.file_url || v.file || v.path || v.downloadUrl || v.download_url) || null;
                }
                // If it's an image, show thumbnail that opens modal
                if (url && (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) || /^data:image\//i.test(url))) {
                  return (
                    <div className="flex items-center gap-2">
                      <img src={url} alt="attachment" className="w-20 h-12 object-cover rounded cursor-pointer border" onClick={() => { setImageModalUrl(url); setImageModalOpen(true); }} />
                      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-600">Open / Download</a>
                    </div>
                  );
                }
                // If it's a remote URL (non-image), show a download/open link
                if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
                  return <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-600">Open / Download</a>;
                }
                // If it's a JSON object that isn't a file URL, show a short preview
                if (v && typeof v === 'object') return <pre className="whitespace-pre-wrap max-w-xs text-sm">{JSON.stringify(v)}</pre>;
                if (isString && String(v).length > 200) return <div className="max-w-lg text-sm">{String(v).slice(0, 200)}…</div>;
                return String(v ?? '—');
              }
            },
            { key: 'reviewers_comment', label: 'Reviewer Comment' },
            { key: 'quality_improvement_followup', label: 'Followup' },
          ];
          // Build a quick lookup map for questions by several possible keys
          const qMap: Record<string, any> = {};
          for (const q of questions) {
            try {
              if (q && (q.id !== undefined)) qMap[String(q.id)] = q;
              if (q && (q.qid !== undefined)) qMap[String(q.qid)] = q;
              if (q && (q.question_id !== undefined)) qMap[String(q.question_id)] = q;
            } catch (e) { /* ignore malformed question */ }
          }

          const data = answers.map(a => {
            const q = qMap[String(a.question_id)] || questions.find((x: any) => String(x.id) === String(a.question_id) || String(x.qid) === String(a.question_id) || String(x.question_id) === String(a.question_id)) || {};
            const questionText = q.questionText || q.question_text || q.text || q.label || String(a.question_id);
            return {
              page: q.pageName || q.page_name || '',
              section: q.sectionName || q.section_name || '',
              question: questionText,
              answer: typeof a.answer_value === 'object' ? JSON.stringify(a.answer_value) : String(a.answer_value),
              _raw: a,
              reviewers_comment: a.reviewers_comment || '—',
              quality_improvement_followup: a.quality_improvement_followup || '—',
            };
          });
          return <DataTable columns={columns} data={data} />;
        })()}
      </Card>

      <div className="mt-6">
        <ConversationPanel context={{ report, answers, uploadedDocs }} scope={`report:${report.id}`} />
      </div>

      {/* Paper preview modal for built template HTML */}
      <Modal
        isOpen={!!paperPreviewOpen}
        onClose={() => setPaperPreviewOpen(false)}
        title={builtTemplate ? `${builtTemplate.name || 'Report'} — Report ${report.id}` : `Report ${report.id}`}
        size="xl"
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#f3f4f6', padding: 16, maxWidth: '95%', overflow: 'auto' }}>
            {builtTemplate ? (() => {
              // Prefer showing the actual generated PDF inside an iframe so preview matches printed output.
              const base = getApiBase();
              const url = base ? `${base}/api/reports/${report.id}/pdf?template=1` : `/api/reports/${report.id}/pdf?template=1`;
              // As a graceful fallback (if PDF endpoint is unavailable), also parse template HTML
              const tplObj = (typeof builtTemplate.template_json === 'string') ? JSON.parse(builtTemplate.template_json || '{}') : (builtTemplate.template_json || {});
              const html = tplObj.html || builtTemplate.html || '';
              const dims = getPaperDimensions(tplObj);
              const widthMm = dims.widthMm; const heightMm = dims.heightMm;
              return (
                <div style={{ background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 12 }}>
                  <div style={{ width: '100%', height: '80vh' }}>
                    <iframe src={url} title={`report-pdf-${report.id}`} style={{ width: '100%', height: '100%', border: 'none' }} />
                  </div>
                  {(!html || String(html).trim() === '') ? null : (
                    <div className="mt-4" style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, overflow: 'auto', direction: 'ltr' }}>
                      <div dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  )}
                </div>
              );
            })() : <div className="text-sm text-gray-500">No built template available to preview.</div>}
          </div>
        </div>
      </Modal>

      {/* Power BI Settings Modal (configuration) */}
      <Modal isOpen={!!powerbiModalOpen} onClose={() => setPowerbiModalOpen(false)} title={`Power BI Settings — Report ${report.id}`} size="lg" footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPowerbiModalOpen(false)}>Close</Button>
          <Button onClick={async () => {
            const ok = await savePowerBi({ powerbi_link: powerbiConfig?.powerbi_link, link_type: powerbiConfig?.link_type, mode: powerbiConfig?.mode });
            if (ok) setPowerbiModalOpen(false);
          }}>Save Power BI</Button>
        </div>
      )}>
        <div className="space-y-4">
          <label className="block text-sm font-medium">Power BI Link / Embed</label>
          <textarea className="w-full border rounded p-2" rows={4} value={powerbiConfig?.powerbi_link || ''} onChange={e => setPowerbiConfig(prev => ({ ...(prev || {}), powerbi_link: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <select className="border p-2 rounded" value={powerbiConfig?.link_type || ''} onChange={e => setPowerbiConfig(prev => ({ ...(prev || {}), link_type: e.target.value }))}>
              <option value="">(Select type)</option>
              <option value="embed">Embed</option>
              <option value="iframe">Iframe</option>
              <option value="link">Link</option>
            </select>
            <select className="border p-2 rounded" value={powerbiConfig?.mode || 'disabled'} onChange={e => setPowerbiConfig(prev => ({ ...(prev || {}), mode: e.target.value }))}>
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Image lightbox modal for attachments */}
      <Modal isOpen={!!imageModalOpen} onClose={() => { setImageModalOpen(false); setImageModalUrl(null); }} title="Attachment Preview" size="lg" footer={(
        <div className="flex justify-end">
          <a href={imageModalUrl || '#'} target="_blank" rel="noreferrer"><Button variant="secondary">Open in new tab</Button></a>
          <Button onClick={() => { setImageModalOpen(false); setImageModalUrl(null); }}>Close</Button>
        </div>
      )}>
        <div className="w-full flex justify-center">
          {imageModalUrl ? <img src={imageModalUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: '70vh' }} /> : <div>No image</div>}
        </div>
      </Modal>

      <Card>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold mb-2">Uploaded Excel Files</h2>
          <input className="border p-2 rounded" placeholder="Search files/columns" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {uploadedDocs.length === 0 && <div className="text-sm text-gray-500">No uploaded files.</div>}
        {/* Only show uploaded files for this report's facility/user */}
        {(() => {
          if (!report) return null;
          const activityResponseType = (report.response_type || report.responseType || '').toLowerCase();
          let filterKey = null, filterVal = null;
          if (activityResponseType === 'facility') {
            filterKey = 'facility_id'; filterVal = report.facility_id || report.facilityId;
          } else if (activityResponseType === 'user') {
            filterKey = 'user_id'; filterVal = report.user_id || report.userId;
          }
          // Only include uploaded docs that belong to this report and have non-empty content
          const filteredDocs = (uploadedDocs || []).filter(d => {
            if (!d) return false;
            const rpt = (d.report_id ?? d.reportId ?? d.report) || null;
            if (String(rpt) !== String(report.id)) return false;
            const content = d.file_content || d.fileContent || d.data || null;
            if (!content) return false;
            if (Array.isArray(content) && content.length === 0) return false;
            return true;
          }).filter(d => {
            if (!search) return true;
            const s = search.toLowerCase();
            const fname = String(d.filename || d.fileName || '');
            if (fname.toLowerCase().includes(s)) return true;
            try {
              const cont = JSON.stringify(d.file_content || d);
              if (cont.toLowerCase().includes(s)) return true;
            } catch (e) { }
            return false;
          });

          return filteredDocs.map(d => {
            const rows = Array.isArray(d.file_content) ? d.file_content : [];
            const colsSet = new Set<string>();
            rows.forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => colsSet.add(k)); });
            const cols = Array.from(colsSet).map(c => ({ key: c, label: c, editable: true }));
            const handleCellEdit = async (rowIndex: number, key: string, newValue: any) => {
              try {
                const res = await apiFetch(`/api/uploaded_docs/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rowIndex, colKey: key, newValue }) });
                if (res.ok) {
                  const json = await res.json();
                  setUploadedDocs(prev => prev.map(x => x.id === d.id ? { ...x, file_content: json.file_content } : x));
                } else {
                  console.error('Failed to save cell', await res.text());
                }
              } catch (e) { console.error(e); }
            };
            // Excel download handler
            const handleDownloadExcel = async () => {
              const ExcelJS = await import('exceljs');
              const workbook = new ExcelJS.Workbook();
              const worksheet = workbook.addWorksheet('Sheet1');
              if (rows.length > 0) {
                worksheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key }));
                worksheet.addRows(rows);
              }
              const buffer = await workbook.xlsx.writeBuffer();
              const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = d.filename ? d.filename.replace(/\.[^.]+$/, '') + '.xlsx' : 'uploaded_file.xlsx';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            };
            // Add Row handler: infer types from first row or column names
            const handleAddRow = () => {
              const typeRow = rows[0] || {};
              const newRow: Record<string, any> = {};
              cols.forEach(col => {
                const val = typeRow[col.key];
                if (val === null || val === undefined || val === '') {
                  newRow[col.key] = '';
                } else if (typeof val === 'number') {
                  newRow[col.key] = 0;
                } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
                  newRow[col.key] = new Date().toISOString().slice(0, 10);
                } else {
                  newRow[col.key] = '';
                }
              });
              const updatedRows = [...rows, newRow];
              setUploadedDocs(prev => prev.map(x => x.id === d.id ? { ...x, file_content: updatedRows } : x));
              apiFetch(`/api/uploaded_docs/${d.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ file_content: updatedRows })
              }).then(async res => {
                if (res.ok) {
                  const json = await res.json();
                  setUploadedDocs(prev => prev.map(x => x.id === d.id ? { ...x, file_content: json.file_content } : x));
                }
              });
            };
            return (
              <div key={d.id} className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-medium">{d.filename || 'Uploaded file'}</div>
                    <div className="text-xs text-gray-500">Uploaded: {new Date(d.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={handleAddRow}>Add Row</Button>
                    <Button size="sm" variant="secondary" onClick={handleDownloadExcel}>Download to Excel</Button>
                  </div>
                </div>
                <DataTable columns={cols} data={rows} onCellEdit={handleCellEdit} />
              </div>
            );
          });
        })()}
      </Card>

      {/* Review modal with toolbar and media upload */}
      <Modal isOpen={!!reviewModalOpen} onClose={() => setReviewModalOpen(false)} title={`Review Report ${report.id}`} size="xl" footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>Cancel</Button>
          <Button onClick={saveReview}>Save Review</Button>
        </div>
      )}>
        <div className="space-y-4">
          <div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 mb-2">
                <div className="flex-1" />
                <Button className="text-red-600" onClick={async () => {
                  try {
                    const ok = await swalConfirm({ title: 'Delete this report?', text: 'This will remove associated uploaded files.' });
                    if (!ok) return;
                    const res = await apiFetch(`/api/reports/${report.id}`, { method: 'DELETE', credentials: 'include' });
                    if (res.ok) { try { swalSuccess('Deleted', 'Report deleted'); } catch (e) { } navigate('/reports'); }
                    else { try { swalError('Failed', 'Failed to delete report'); } catch (e) { } }
                  } catch (e) { console.error(e); try { swalError('Failed', 'Failed to delete report'); } catch (er) { } }
                }}>Delete</Button>
              </div>

              <div className="flex gap-2 mb-2 items-center">
                <label className="px-2 py-1 border rounded cursor-pointer inline-block">
                  Image
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return; const url = await uploadMedia(f); if (url) setReviewContent(prev => (prev || '') + `<img src="${url}" style="max-width:100%"/>`);
                  }} />
                </label>
                <label className="px-2 py-1 border rounded cursor-pointer inline-block">
                  Video File
                  <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return; const url = await uploadMedia(f); if (url) setReviewContent(prev => (prev || '') + `<video controls src="${url}" style="max-width:100%"></video>`);
                  }} />
                </label>
                <div className="flex-1">
                  <input placeholder="Paste a YouTube or embed URL here" className="w-full border rounded p-2" value={String((powerbiConfig && powerbiConfig._lastVideoUrl) || '')} onChange={e => setPowerbiConfig(prev => ({ ...(prev || {}), _lastVideoUrl: e.target.value }))} />
                </div>
                <Button onClick={() => {
                  const v = powerbiConfig?._lastVideoUrl;
                  if (!v) return;
                  let url = String(v);
                  if (/youtube\.com\/watch\?v=/.test(url)) { const id = url.split('v=')[1].split('&')[0]; url = `https://www.youtube.com/embed/${id}`; }
                  else if (/youtu\.be\//.test(url)) { const id = url.split('youtu.be/')[1].split('?')[0]; url = `https://www.youtube.com/embed/${id}`; }
                  insertHtmlAtCaret(`<iframe src="${url}" style="width:100%;height:360px;border:none" allowfullscreen></iframe>`);
                }}>Insert Video URL</Button>
              </div>

              <div>
                <RichTextEditor value={reviewContent || ''} onChange={(v) => setReviewContent(v)} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Overall Score</label>
            <input type="number" className="w-full border rounded p-2" value={reviewScore ?? ''} onChange={e => setReviewScore(e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select className="w-full border rounded p-2" value={reviewStatus || ''} onChange={e => setReviewStatus(e.target.value)}>
              <option value="">(Select)</option>
              <option value="Completed">Completed</option>
              <option value="Draft">Draft</option>
              <option value="Reviewed">Reviewed</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const EditableJsonTable: React.FC<{ doc: any, search?: string, onSaved?: (doc: any) => void }> = ({ doc, search = '', onSaved }) => {
  const [content, setContent] = useState<any[]>(Array.isArray(doc.file_content) ? doc.file_content : []);
  const [edited, setEdited] = useState<Record<string, any>>({});

  useEffect(() => setContent(Array.isArray(doc.file_content) ? doc.file_content : []), [doc]);

  const columns = React.useMemo(() => {
    const cols = new Set<string>();
    for (const row of content) {
      if (row && typeof row === 'object') Object.keys(row).forEach(k => cols.add(k));
    }
    return Array.from(cols);
  }, [content]);

  const filtered = content.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return columns.some(c => (String((r[c] || '')).toLowerCase().includes(s)));
  });

  const saveCell = async (rowIndex: number, colKey: string, newValue: any) => {
    try {
      const res = await apiFetch(`/api/uploaded_docs/${doc.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ rowIndex, colKey, newValue })
      });
      if (res.ok) {
        const json = await res.json();
        setContent(json.file_content);
        onSaved && onSaved({ ...doc, file_content: json.file_content });
      } else {
        console.error('Failed to save cell', await res.text());
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50"><tr>
          <th className="px-4 py-2 text-left">#</th>
          {columns.map(c => <th key={c} className="px-4 py-2 text-left">{c}</th>)}
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filtered.map((row, ri) => (
            <tr key={ri}>
              <td className="px-4 py-2 text-sm">{ri}</td>
              {columns.map(c => (
                <td key={c} className="px-4 py-2 text-sm">
                  <input className="w-full border rounded p-1 text-sm" defaultValue={row[c] ?? ''} onBlur={e => {
                    const newVal = e.target.value;
                    if (String(row[c] ?? '') !== newVal) {
                      saveCell(ri, c, newVal);
                    }
                  }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportViewPage;
