import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@components/layout/AppLayout';
import { SessionStartPage } from '@pages/SessionStart/SessionStartPage';
import { ActiveSessionPage } from '@pages/ActiveSession/ActiveSessionPage';
import { SessionResultsPage } from '@pages/SessionResults/SessionResultsPage';
import { DashboardPage } from '@pages/Dashboard/DashboardPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'sessions/new', element: <SessionStartPage /> },
      { path: 'sessions/:id/active', element: <ActiveSessionPage /> },
      { path: 'sessions/:id', element: <SessionResultsPage /> },
    ],
  },
]);
