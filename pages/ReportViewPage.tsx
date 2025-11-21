import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import ConversationPanel from '../components/ui/ConversationPanel';

const ReportViewPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`http://localhost:3000/api/reports/${reportId}`, { credentials: 'include' });
        if (!r.ok) { console.error('Failed to load report'); setLoading(false); return; }
        const jr = await r.json();
        setReport(jr);
        // fetch answers and questions so we can show labels, pages, sections
        const [aRes, qRes, docs] = await Promise.all([
          fetch(`http://localhost:3000/api/answers?reportId=${reportId}`, { credentials: 'include' }),
          fetch(`http://localhost:3000/api/questions?activityId=${jr.activity_id}`, { credentials: 'include' }),
          fetch(`http://localhost:3000/api/uploaded_docs?reportId=${jr.id}`, { credentials: 'include' })
        ]);
        if (aRes.ok) setAnswers(await aRes.json() || []);
        if (qRes.ok) setQuestions(await qRes.json() || []);
        if (docs.ok) setUploadedDocs(await docs.json() || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [reportId]);

  if (loading) return <div>Loading...</div>;
  if (!report) return <div>Report not found.</div>;

  const handlePrint = () => window.print();

  const handlePrintFormatted = () => {
    // Build a print window with structured report content (pages, sections, questions)
    const qMap: Record<string, any> = {};
    for (const q of questions) qMap[q.id] = q;
    let html = `<html><head><title>Report ${report.id}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body>`;
    html += `<h1>Report ${report.id}</h1><p>Submitted: ${new Date(report.submission_date).toLocaleString()}</p>`;
    html += `<h2>Answers</h2><table><thead><tr><th>Page</th><th>Section</th><th>Question</th><th>Answer</th><th>Reviewer Comment</th><th>Followup</th></tr></thead><tbody>`;
    for (const a of answers) {
      const q = qMap[a.question_id] || {};
      const questionText = q.questionText || q.question_text || a.question_id;
      const pageName = q.pageName || q.page_name || '';
      const sectionName = q.sectionName || q.section_name || '';
      const ans = (typeof a.answer_value === 'object') ? JSON.stringify(a.answer_value) : String(a.answer_value);
      html += `<tr><td>${pageName}</td><td>${sectionName}</td><td>${questionText}</td><td>${ans}</td><td>${a.reviewers_comment || ''}</td><td>${a.quality_improvement_followup || ''}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (uploadedDocs && uploadedDocs.length) {
      html += `<h2>Uploaded Files</h2>`;
      for (const d of uploadedDocs) {
        html += `<h3>${d.filename || 'File'}</h3><pre>${JSON.stringify(d.file_content || d, null, 2)}</pre>`;
      }
    }
    html += `</body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } else {
      window.print();
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Report ${report.id} from ${report.submission_date}`);
    const body = encodeURIComponent(`Please see report ${report.id} for activity ${report.activity_id}.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Report {report.id}</h1>
          <p className="text-sm text-gray-500">Submitted: {new Date(report.submission_date).toLocaleString()}</p>
        </div>
        <div className="space-x-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
          <Button onClick={handlePrintFormatted}>Download PDF</Button>
          <Button variant="secondary" onClick={handleEmail}>Forward via Email</Button>
          <Button variant="secondary" onClick={() => navigate(`/activities/${report.activity_id}/followups?reportId=${report.id}`)}>Edit Followups</Button>
        </div>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Submitted Answers</h2>
        {/* DataTable with column-level filter */}
        {(() => {
          const columns = [
            { key: 'page', label: 'Page' },
            { key: 'section', label: 'Section' },
            { key: 'question', label: 'Question' },
            { key: 'answer', label: 'Answer' },
            { key: 'reviewers_comment', label: 'Reviewer Comment' },
            { key: 'quality_improvement_followup', label: 'Followup' },
          ];
          const data = answers.map(a => {
            const q = questions.find((x: any) => String(x.id) === String(a.question_id)) || {};
            return {
              page: q.pageName || q.page_name || '',
              section: q.sectionName || q.section_name || '',
              question: q.questionText || q.question_text || a.question_id,
              answer: typeof a.answer_value === 'object' ? JSON.stringify(a.answer_value) : String(a.answer_value),
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
          return filteredDocs.map(d => {
            const rows = Array.isArray(d.file_content) ? d.file_content : [];
            const colsSet = new Set<string>();
            rows.forEach((r: any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => colsSet.add(k)); });
            const cols = Array.from(colsSet).map(c => ({ key: c, label: c, editable: true }));
            const handleCellEdit = async (rowIndex: number, key: string, newValue: any) => {
              try {
                const res = await fetch(`http://localhost:3000/api/uploaded_docs/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rowIndex, colKey: key, newValue }) });
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
              fetch(`http://localhost:3000/api/uploaded_docs/${d.id}`, {
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
      const res = await fetch(`http://localhost:3000/api/uploaded_docs/${doc.id}`, {
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
