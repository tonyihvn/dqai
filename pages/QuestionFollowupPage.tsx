import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const QuestionFollowupPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [qRes, aRes] = await Promise.all([
          fetch(`http://localhost:3000/api/questions?activityId=${activityId}`, { credentials: 'include' }),
          fetch(`http://localhost:3000/api/answers?activityId=${activityId}`, { credentials: 'include' })
        ]);
        if (qRes.ok) setQuestions(await qRes.json());
        if (aRes.ok) setAnswers(await aRes.json());
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [activityId]);

  const saveAnswerFollowup = async (answerId: string, payload: { quality_improvement_followup?: string; reviewers_comment?: string; score?: number }) => {
    try {
      const res = await fetch(`http://localhost:3000/api/answers/${answerId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setAnswers(prev => prev.map(a => a.id === updated.id ? updated : a));
      } else {
        alert('Failed to save followup');
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
                    <textarea defaultValue={a.quality_improvement_followup || ''} onBlur={(e) => saveAnswerFollowup(a.id, { quality_improvement_followup: e.target.value })} className="w-full border rounded p-2" rows={2} />
                  </div>
                  <div className="w-1/4">
                    <input type="text" defaultValue={a.reviewers_comment || ''} onBlur={(e) => saveAnswerFollowup(a.id, { reviewers_comment: e.target.value })} className="w-full border rounded p-2" />
                    <input type="number" defaultValue={a.score ?? ''} onBlur={(e) => saveAnswerFollowup(a.id, { score: e.target.value ? Number(e.target.value) : null })} className="w-full border rounded p-2 mt-2" placeholder="Score" />
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
