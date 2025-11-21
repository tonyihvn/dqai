import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend);

const ActivityDashboardPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [facilitiesMap, setFacilitiesMap] = useState<Record<string, string>>({});
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [chartTypes, setChartTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/activity_dashboard/${activityId}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setData(json);
          // start with no questions selected so charts don't render until user checks them
          setSelectedQuestionIds([]);
        } else {
          console.error('Failed to load dashboard', await res.text());
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchDashboard();

    // fetch users and facilities for name mapping
    (async () => {
      try {
        const [uRes, fRes] = await Promise.all([
          fetch('http://localhost:3000/api/users', { credentials: 'include' }),
          fetch('http://localhost:3000/api/facilities', { credentials: 'include' })
        ]);
        if (uRes.ok) {
          const users = await uRes.json();
          const map: Record<string, string> = {};
          users.forEach((u: any) => map[String(u.id)] = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || String(u.id));
          setUsersMap(map);
        }
        if (fRes.ok) {
          const facs = await fRes.json();
          const fmap: Record<string, string> = {};
          facs.forEach((f: any) => fmap[String(f.id)] = f.name || String(f.id));
          setFacilitiesMap(fmap);
        }
      } catch (e) { console.error('Failed to fetch users/facilities', e); }
    })();
  }, [activityId]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>No data available for this activity.</div>;

  const { activity, questions, reports, answersByQuestion, uploadedDocs } = data;

  // Utility to strip HTML tags
  function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  const handleDownloadPdf = () => {
    // Simple client-side PDF/print: open print dialog for the dashboard
    window.print();
  };

  const standaloneUrl = `${window.location.origin}/standalone-form/${activity.id}`;
  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{activity.title} — Collected Data</h1>
          <p className="text-sm text-gray-500">{stripHtml(activity.details)}</p>
          <div className="mt-2">
            <span className="text-xs text-gray-600">Shareable Form Link: </span>
            <a href={standaloneUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline break-all">{standaloneUrl}</a>
          </div>
        </div>
        <div className="space-x-2">
          <Button onClick={() => navigate('/activities')} variant="secondary">Back</Button>
          <Button onClick={handleDownloadPdf}>Download PDF</Button>
        </div>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Power BI</h2>
        <p className="text-sm text-gray-500">Embed your Power BI report here (iframe) or connect external dashboard.</p>
        <div className="mt-4">
          <iframe title="PowerBI" src={activity.powerbi_url || ''} style={{ width: '100%', height: 300, border: 'none' }} />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Interactive Charts</h2>
        <p className="text-sm text-gray-500">Charts are interactive. Use the charts to explore distribution of collected answers.</p>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {questions.filter((q: any) => selectedQuestionIds.includes(String(q.id))).map((q: any) => {
            const answersForQ = (answersByQuestion[q.id] || []).map((a: any) => {
              // answer_value may be JSON; normalize to string
              let v = a.answer_value;
              if (v && typeof v === 'object') v = v.value ?? JSON.stringify(v);
              return v === null || typeof v === 'undefined' ? '—' : String(v);
            });
            // tally
            const counts: Record<string, number> = {};
            for (const v of answersForQ) counts[v] = (counts[v] || 0) + 1;
            const labels = Object.keys(counts).slice(0, 10);
            const data = {
              labels,
              datasets: [
                {
                  label: 'Responses',
                  data: labels.map(l => counts[l] || 0),
                  backgroundColor: 'rgba(37,99,235,0.6)'
                }
              ]
            };

            const chartType = chartTypes[String(q.id)] || 'bar';
            return (
              <div key={q.id} className="bg-white p-4 rounded shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium">{q.question_text}</div>
                    <div className="text-xs text-gray-500">{q.question_helper}</div>
                  </div>
                  <div className="ml-4 text-sm">
                    <label className="text-xs text-gray-600 mr-2">Chart</label>
                    <select className="p-1 border rounded text-sm" value={chartType} onChange={e => setChartTypes(prev => ({ ...prev, [q.id]: e.target.value }))}>
                      <option value="bar">Bar</option>
                      <option value="pie">Pie</option>
                      <option value="line">Line</option>
                      <option value="table">Table</option>
                    </select>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-sm">Responses: {(answersByQuestion[q.id] || []).length}</div>
                  <div className="mt-2 h-44">
                    {chartType === 'bar' && <Bar data={data} options={{ responsive: true, maintainAspectRatio: false }} />}
                    {chartType === 'pie' && <Pie data={{ labels: data.labels, datasets: [{ data: data.datasets[0].data, backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'] }] }} options={{ responsive: true, maintainAspectRatio: false }} />}
                    {chartType === 'line' && <Line data={{ labels: data.labels, datasets: [{ label: 'Responses', data: data.datasets[0].data, fill: false, borderColor: 'rgba(37,99,235,0.8)' }] }} options={{ responsive: true, maintainAspectRatio: false }} />}
                    {chartType === 'table' && (
                      <div className="overflow-auto max-h-44 border rounded p-2 bg-gray-50">
                        <table className="min-w-full text-sm">
                          <thead><tr><th className="text-left">Value</th><th className="text-right">Count</th></tr></thead>
                          <tbody>
                            {data.labels.map((l: any, idx: number) => (
                              <tr key={l}><td>{l}</td><td className="text-right">{data.datasets[0].data[idx]}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Chart Controls</h2>
        <p className="text-sm text-gray-500">Select which questions to include in charts.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border p-3 rounded">
          {questions.map((q: any) => (
            <label key={q.id} className="text-sm">
              <input type="checkbox" checked={selectedQuestionIds.includes(String(q.id))} onChange={(e) => {
                const id = String(q.id);
                setSelectedQuestionIds(prev => e.target.checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
              }} />
              <span className="ml-2">{q.question_text}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">All Collected Reports</h2>
        {/* DataTable with column-level filter */}
        {(() => {
          const columns = [
            { key: 'id', label: 'Report ID' },
            { key: 'submission_date', label: 'Submitted' },
            { key: 'facility_id', label: 'Facility' },
            { key: 'user_id', label: 'User' },
            { key: 'status', label: 'Status' },
            { key: 'reviewers_report', label: "Reviewer's Report" },
          ];
          const data = reports.map((r: any) => ({
            id: r.id,
            submission_date: new Date(r.submission_date).toLocaleString(),
            facility_id: (r.facility_id ? (facilitiesMap[String(r.facility_id)] || r.facility_id) : '—'),
            user_id: (r.user_id ? (usersMap[String(r.user_id)] || r.user_id) : '—'),
            status: r.status || '—',
            reviewers_report: stripHtml(r.reviewers_report),
          }));
          return <DataTable columns={columns} data={data} onCellEdit={undefined} />;
        })()}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Uploaded Excel Files</h2>
        {uploadedDocs.length === 0 && <div className="text-sm text-gray-500">No uploaded files.</div>}
        {uploadedDocs.map((d: any) => (
          <div key={d.id} className="mb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">{d.filename || 'Uploaded file'}</div>
                <div className="text-xs text-gray-500">Uploaded: {new Date(d.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => { setSelectedDoc(d); setFileSearch(''); setFileModalOpen(true); }}>View</Button>
                <Button size="sm" variant="secondary" onClick={async () => {
                  // download as excel
                  const ExcelJS = await import('exceljs');
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet('Sheet1');
                  const rows = Array.isArray(d.file_content) ? d.file_content : [];
                  if (rows.length > 0) {
                    worksheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key }));
                    worksheet.addRows(rows);
                  }
                  const buffer = await workbook.xlsx.writeBuffer();
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = (d.filename ? d.filename.replace(/\.[^.]+$/, '') : 'uploaded_file') + '.xlsx';
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
                }}>Download</Button>
                <Button size="sm" variant="secondary" onClick={async () => {
                  if (!confirm('Delete this uploaded file?')) return;
                  try {
                    const res = await fetch(`http://localhost:3000/api/uploaded_docs/${d.id}`, { method: 'DELETE', credentials: 'include' });
                    if (res.ok) {
                      // refresh dashboard data
                      const r = await fetch(`http://localhost:3000/api/activity_dashboard/${activityId}`, { credentials: 'include' });
                      if (r.ok) setData(await r.json());
                    } else {
                      alert('Delete failed');
                    }
                  } catch (e) { console.error(e); alert('Delete failed'); }
                }}>Delete</Button>
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* File Modal */}
      {fileModalOpen && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white w-11/12 max-w-4xl p-6 rounded shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{selectedDoc.filename}</h3>
              <div className="flex items-center gap-2">
                <input className="border p-2 rounded text-sm" placeholder="Search..." value={fileSearch} onChange={e => setFileSearch(e.target.value)} />
                <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => setFileModalOpen(false)}>Close</button>
              </div>
            </div>
            <div className="overflow-auto max-h-96">
              {(() => {
                const rows = Array.isArray(selectedDoc.file_content) ? selectedDoc.file_content : [];
                if (rows.length === 0) return <div className="text-sm text-gray-500">No data</div>;
                const colsSet = new Set<string>();
                rows.forEach((r: any) => Object.keys(r || {}).forEach(k => colsSet.add(k)));
                const cols = Array.from(colsSet).map(c => ({ key: c, label: c }));
                const filtered = rows.filter((r: any) => {
                  if (!fileSearch) return true;
                  const s = fileSearch.toLowerCase();
                  return Object.values(r || {}).some((v: any) => String(v || '').toLowerCase().includes(s));
                });
                return <DataTable columns={cols} data={filtered} onCellEdit={undefined} />;
              })()}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 bg-gray-100 rounded" onClick={async () => {
                // download
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Sheet1');
                const rows = Array.isArray(selectedDoc.file_content) ? selectedDoc.file_content : [];
                if (rows.length > 0) {
                  worksheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key }));
                  worksheet.addRows(rows);
                }
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (selectedDoc.filename ? selectedDoc.filename.replace(/\.[^.]+$/, '') : 'uploaded_file') + '.xlsx';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
              }}>Download Excel</button>
              <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => setFileModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-2">Data Quality Followups</h2>
        <p className="text-sm text-gray-500">Manage followups for questions created during data collection.</p>
        <div className="mt-4">
          <Button onClick={() => navigate(`/activities/${activityId}/followups`)}>Open Followups Page</Button>
        </div>
      </Card>
    </div>
  );
};

export default ActivityDashboardPage;
