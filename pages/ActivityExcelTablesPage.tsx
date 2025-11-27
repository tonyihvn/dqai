import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import * as ExcelJS from 'exceljs';

const ActivityExcelTablesPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/uploaded_docs?activityId=${activityId}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setDocs(json || []);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [activityId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Uploaded Excel Tables — Activity {activityId}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
          <Button onClick={async () => {
            try {
              // merge all docs into a single workbook, each file in its own sheet
              const wb = new ExcelJS.Workbook();
              const sanitize = (name: string) => {
                if (!name) return 'Sheet';
                // Excel sheet name max 31 chars and cannot contain : \\ / ? * [ ]
                const bad = /[:\\\/\?\*\[\]]/g;
                let s = name.replace(bad, ' ');
                s = s.substring(0, 31);
                return s || 'Sheet';
              };

              for (const d of docs) {
                const fileContent = d.file_content;
                // extract rows: support legacy array or { data: [...] }
                let rows: any[] = [];
                if (Array.isArray(fileContent)) rows = fileContent;
                else if (fileContent && Array.isArray(fileContent.data)) rows = fileContent.data;
                else if (fileContent && Array.isArray(fileContent.rows)) rows = fileContent.rows;
                else if (fileContent && typeof fileContent === 'object' && Object.keys(fileContent).length > 0) {
                  // maybe it's an object representing a single row
                  rows = [fileContent];
                }

                const sheetName = sanitize(d.filename || `file_${d.id}`);
                const ws = wb.addWorksheet(sheetName);

                if (!rows || rows.length === 0) {
                  // add placeholder
                  ws.addRow([`No tabular data in ${d.filename || d.id}`]);
                  continue;
                }

                // collect columns from union of keys in first N rows
                const keySet = new Set<string>();
                rows.slice(0, 200).forEach(r => { if (r && typeof r === 'object' && !Array.isArray(r)) Object.keys(r).forEach(k => keySet.add(k)); });
                const keys = Array.from(keySet);
                if (keys.length === 0) {
                  // rows may be arrays
                  for (const r of rows) {
                    if (Array.isArray(r)) ws.addRow(r as any[]);
                    else ws.addRow([String(r)]);
                  }
                } else {
                  ws.columns = keys.map(k => ({ header: String(k), key: k, width: Math.min(40, Math.max(10, String(k).length + 5)) }));
                  for (const r of rows) {
                    if (!r) { ws.addRow({}); continue; }
                    const rowVals = keys.map(k => (r && typeof r === 'object' ? (r[k] !== undefined ? r[k] : '') : ''));
                    ws.addRow(rowVals);
                  }
                }
              }

              const buf = await wb.xlsx.writeBuffer();
              const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `merged_activity_${activityId || 'export'}.xlsx`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error(e);
              alert('Failed to merge excel files: ' + String(e));
            }
          }}>Merge All Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Card>
            <h3 className="font-semibold mb-2">Files</h3>
            {docs.length === 0 && <div className="text-sm text-gray-500">No uploaded files for this activity.</div>}
            {docs.map(d => (
              <div key={d.id} className="p-2 border-b flex items-center justify-between">
                <div>
                  <div className="font-medium">{d.filename}</div>
                  <div className="text-xs text-gray-500">{new Date(d.created_at).toLocaleString()}</div>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(d)}>View</Button>
                  <a href={d.file_content && d.file_content.url ? d.file_content.url : '#'} target="_blank" rel="noreferrer"><Button size="sm">Download</Button></a>
                </div>
              </div>
            ))}
          </Card>
        </div>
        <div className="col-span-2">
          <Card>
            <h3 className="font-semibold mb-2">Preview</h3>
            {selected ? (
              (() => {
                const rows = Array.isArray(selected.file_content) ? selected.file_content : (selected.file_content && Array.isArray(selected.file_content.data) ? selected.file_content.data : (selected.file_content || []));
                if (!Array.isArray(rows) || rows.length === 0) return <div className="text-sm text-gray-500">No tabular data available for this file.</div>;
                const keys = Array.from(rows.reduce((s, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set<string>()));
                const columns = keys.map(k => ({ key: String(k), label: String(k) }));
                return <DataTable columns={columns} data={rows} />;
              })()
            ) : (
              <div className="text-sm text-gray-500">Select a file to preview its tabular contents.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ActivityExcelTablesPage;
