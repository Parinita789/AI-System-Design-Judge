import { Link, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
        <h1 className="font-semibold">AI System Design Judge</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/sessions/new">New session</Link>
        </nav>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
