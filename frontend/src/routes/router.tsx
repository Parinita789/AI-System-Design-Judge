import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@components/layout/AppLayout';
import { RequireAuth } from '@components/RequireAuth';
import { PublicOnly } from '@components/PublicOnly';
import { SessionStartPage } from '@pages/SessionStart/SessionStartPage';
import { ActiveSessionPage } from '@pages/ActiveSession/ActiveSessionPage';
import { SessionResultsPage } from '@pages/SessionResults/SessionResultsPage';
import { QuestionRedirectPage } from '@pages/QuestionDetail/QuestionRedirectPage';
import { LoginPage } from '@pages/Login/LoginPage';
import { SignupPage } from '@pages/Signup/SignupPage';

export const router = createBrowserRouter([
  // Public routes — accessible without auth. PublicOnly bounces to /home
  // if the user is already signed in, so the back button never strands
  // someone on /login after a successful sign-in.
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  // Everything else requires an authenticated user. Hitting one of these
  // routes without a token routes to /login with the original location
  // preserved in router state.
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/home" replace /> },
          { path: 'home', element: <SessionStartPage /> },
          { path: 'questions/:id', element: <QuestionRedirectPage /> },
          { path: 'sessions/:id/active', element: <ActiveSessionPage /> },
          { path: 'sessions/:id', element: <SessionResultsPage /> },
        ],
      },
    ],
  },
]);
