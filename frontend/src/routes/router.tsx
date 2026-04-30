import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@components/layout/AppLayout';
import { SessionStartPage } from '@pages/SessionStart/SessionStartPage';
import { ActiveSessionPage } from '@pages/ActiveSession/ActiveSessionPage';
import { SessionResultsPage } from '@pages/SessionResults/SessionResultsPage';
import { QuestionRedirectPage } from '@pages/QuestionDetail/QuestionRedirectPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <SessionStartPage /> },
      { path: 'questions/:id', element: <QuestionRedirectPage /> },
      { path: 'sessions/:id/active', element: <ActiveSessionPage /> },
      { path: 'sessions/:id', element: <SessionResultsPage /> },
    ],
  },
]);
