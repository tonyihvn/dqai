import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';

const ActivitySubmittedAnswersPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [res, qRes, fRes, uRes] = await Promise.all([
          fetch(`/api/answers?activityId=${activityId}`, { credentials: 'include' }),
          fetch(`/api/questions?activityId=${activityId}`, { credentials: 'include' }),
          fetch(`/api/facilities`, { credentials: 'include' }),
          fetch(`/api/users`, { credentials: 'include' })
        ]);
        if (res.ok) setAnswers(await res.json() || []);
        if (qRes.ok) setQuestions(await qRes.json() || []);
        if (fRes.ok) setFacilities(await fRes.json() || []);
        if (uRes.ok) setUsers(await uRes.json() || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [activityId]);

  if (loading) return <div>Loading...</div>;

  const columns = [
    { key: 'report_id', label: 'Report ID' },
    { key: 'question', label: 'Question' },
    { key: 'answer', label: 'Answer' },
    { key: 'facility', label: 'Facility' },
    { key: 'user', label: 'User' },
    { key: 'created_at', label: 'Submitted At' },
  ];

  const qMap: Record<string, any> = {};
  for (const q of questions) {
    try {
      if (q && q.id !== undefined) qMap[String(q.id)] = q;
      if (q && q.qid !== undefined) qMap[String(q.qid)] = q;
      if (q && q.question_id !== undefined) qMap[String(q.question_id)] = q;
    } catch (e) { }
  }
  const fMap: Record<string, any> = {};
  for (const f of facilities) { try { if (f && f.id !== undefined) fMap[String(f.id)] = f; } catch (e) { } }
  const uMap: Record<string, any> = {};
  for (const u of users) { try { if (u && u.id !== undefined) uMap[String(u.id)] = u; } catch (e) { } }

  const rows = answers.map(a => {
    const q = qMap[String(a.question_id)] || {};
    const questionText = q.questionText || q.question_text || q.text || q.label || String(a.question_id);
    const facility = fMap[String(a.facility_id)];
    const user = uMap[String(a.user_id)];
    const answerVal = (a.answer_value && typeof a.answer_value === 'object') ? (a.answer_value.value ?? JSON.stringify(a.answer_value)) : a.answer_value;
    const userName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || String(user.id) : String(a.user_id || '');
    const facilityName = facility ? (facility.name || facility.facility_name || String(facility.id)) : String(a.facility_id || '');
    return {
      report_id: a.report_id,
      question: questionText,
      answer: answerVal,
      facility: facilityName,
      user: userName,
      created_at: a.created_at
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Submitted Answers — Activity {activityId}</h1>
        <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
            <Button variant="secondary" onClick={async () => {
              try {
                if (!rows || rows.length === 0) { alert('No data to export'); return; }
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet('Answers');
                const cols = [
                  { header: 'Report ID', key: 'report_id' },
                  { header: 'Question', key: 'question' },
                  { header: 'Answer', key: 'answer' },
                  { header: 'Facility', key: 'facility' },
                  { header: 'User', key: 'user' },
                  { header: 'Submitted At', key: 'created_at' }
                ];
                sheet.columns = cols;
                for (const r of rows) {
                  sheet.addRow({ report_id: r.report_id, question: r.question, answer: r.answer, facility: r.facility, user: r.user, created_at: r.created_at });
                }
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `activity_${activityId}_answers.xlsx`; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
              } catch (e) { console.error('Export failed', e); alert('Export failed'); }
            }}>Export to Excel</Button>
        </div>
      </div>
      <Card>
        <p className="text-sm text-gray-500 mb-4">This view shows all answers submitted for this activity across all reports. Each row represents a single answer (question-level).</p>
        <DataTable columns={columns} data={rows} />
      </Card>
    </div>
  );
};

export default ActivitySubmittedAnswersPage;
