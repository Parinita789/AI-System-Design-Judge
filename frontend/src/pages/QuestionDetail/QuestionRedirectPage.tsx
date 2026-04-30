import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';

// Clicking a question in the sidebar lands here; we redirect to the most
// useful session for that question, in this priority:
//   1. an in-progress (active) session → its editor
//   2. the most recently completed session → its results page
//      (so the user sees a session with evaluations, not an empty
//       abandoned attempt that happened to be created later)
//   3. fall back to the most recent session of any status
//   4. if the question has no sessions at all → /home
export function QuestionRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const questionQuery = useQuery({
    queryKey: ['question', id],
    queryFn: () => questionsService.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) {
      navigate('/home', { replace: true });
      return;
    }
    if (questionQuery.isError) {
      navigate('/home', { replace: true });
      return;
    }
    if (!questionQuery.data) return;
    const sessions = questionQuery.data.sessions;
    if (sessions.length === 0) {
      navigate('/home', { replace: true });
      return;
    }

    const active = sessions.find((s) => s.status === 'active');
    if (active) {
      navigate(`/sessions/${active.id}/active`, { replace: true });
      return;
    }

    const byStartedDesc = (a: { startedAt: string }, b: { startedAt: string }) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();

    // Prefer the most recently completed attempt — it has an evaluation.
    const newestCompleted = [...sessions]
      .filter((s) => s.status === 'completed')
      .sort(byStartedDesc)[0];
    if (newestCompleted) {
      navigate(`/sessions/${newestCompleted.id}`, { replace: true });
      return;
    }

    // Last resort: a question whose only attempts are abandoned.
    const newest = [...sessions].sort(byStartedDesc)[0];
    navigate(`/sessions/${newest.id}`, { replace: true });
  }, [id, questionQuery.isError, questionQuery.data, navigate]);

  return <div className="text-sm text-gray-500">Loading question…</div>;
}
