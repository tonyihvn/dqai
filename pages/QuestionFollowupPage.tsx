import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { apiFetch } from '../utils/api';

const QuestionFollowupPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [editingMap, setEditingMap] = useState<Record<number, { reviewers_comment?: string; quality_improvement_followup?: string; score?: number }>>({});
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const qReportId = params.get('reportId');

  useEffect(() => {
    const load = async () => {
      try {
        const qRes = await apiFetch(`/api/questions?activityId=${activityId}`, { credentials: 'include' });
        if (qRes.ok) setQuestions(await qRes.json());

        // If reportId provided, fetch only answers for that report
        let aRes;
        if (qReportId) {
          aRes = await apiFetch(`/api/answers?reportId=${qReportId}`, { credentials: 'include' });
        } else {
          aRes = await apiFetch(`/api/answers?activityId=${activityId}`, { credentials: 'include' });
        }
        if (aRes.ok) {
          const ans = await aRes.json();
          setAnswers(ans);
          // initialize editing map with current values
          const map: Record<number, any> = {};
          (ans || []).forEach((a: any) => { map[a.id] = { reviewers_comment: a.reviewers_comment || '', quality_improvement_followup: a.quality_improvement_followup || '', score: a.score ?? null }; });
          setEditingMap(map);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [activityId]);

  const saveAnswerFollowup = async (answerId: number) => {
    try {
      const current = editingMap[answerId] || {};
      const payload: any = {
        reviewers_comment: current.reviewers_comment || null,
        quality_improvement_followup: current.quality_improvement_followup || null,
        score: typeof current.score !== 'undefined' ? current.score : null
      };
      const res = await apiFetch(`/api/answers/${answerId}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const updated = await res.json();
        setAnswers(prev => prev.map(a => a.id === updated.id ? updated : a));
        setEditingMap(prev => ({ ...prev, [answerId]: { reviewers_comment: updated.reviewers_comment || '', quality_improvement_followup: updated.quality_improvement_followup || '', score: updated.score ?? null } }));
      } else {
        const txt = await res.text().catch(() => '');
        alert('Failed to save followup: ' + txt);
      }
    } catch (e) { console.error(e); alert('Failed to save followup'); }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Question Followups</h1>
        <div>
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map(q => (
          <Card key={q.id}>
            <div className="mb-2">
              <div className="font-medium">{q.questionText || q.question_text}</div>
              <div className="text-sm text-gray-500">{q.questionHelper || q.question_helper}</div>
            </div>
            <div className="space-y-2">
              {(answers.filter(a => a.question_id === q.id)).map(a => (
                <div key={a.id} className="flex items-start space-x-4">
                  <div className="w-1/3 text-sm text-gray-700">{typeof a.answer_value === 'object' ? JSON.stringify(a.answer_value) : String(a.answer_value)}</div>
                  <div className="w-1/3">
                    <label className="block text-xs font-medium mb-1">Enter Follow-up Activity</label>
                    <textarea value={editingMap[a.id]?.quality_improvement_followup || ''} onChange={e => setEditingMap(prev => ({ ...prev, [a.id]: { ...(prev[a.id] || {}), quality_improvement_followup: e.target.value } }))} className="w-full border rounded p-2" rows={2} />
                  </div>
                  <div className="w-1/4">
                    <label className="block text-xs font-medium mb-1">Reviewer Comment</label>
                    <input type="text" value={editingMap[a.id]?.reviewers_comment || ''} onChange={e => setEditingMap(prev => ({ ...prev, [a.id]: { ...(prev[a.id] || {}), reviewers_comment: e.target.value } }))} className="w-full border rounded p-2" />
                    <label className="block text-xs font-medium mb-1 mt-2">Score</label>
                    <input type="number" value={editingMap[a.id]?.score ?? ''} onChange={e => setEditingMap(prev => ({ ...prev, [a.id]: { ...(prev[a.id] || {}), score: e.target.value ? Number(e.target.value) : null } }))} className="w-full border rounded p-2 mt-0" placeholder="Score" />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => saveAnswerFollowup(a.id)}>Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => {
                        // revert edits to last saved
                        setEditingMap(prev => ({ ...prev, [a.id]: { reviewers_comment: a.reviewers_comment || '', quality_improvement_followup: a.quality_improvement_followup || '', score: a.score ?? null } }));
                      }}>Cancel</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default QuestionFollowupPage;
