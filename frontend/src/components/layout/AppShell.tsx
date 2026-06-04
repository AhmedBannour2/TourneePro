import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppShellProps {
  children: ReactNode;
}

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/tours': 'Tours',
  '/import': 'Import Excel',
  '/assignments': 'Assignment Board',
  '/express': 'Express Deliveries',
  '/employees': 'Employees',
  '/trucks': 'Trucks',
  '/worked-days': 'Jours travaillés',
  '/settings': 'Paramètres',
  '/my-assignments': 'Mes tournées',
  '/my-worked-days': 'Mes jours travaillés',
};

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'TourneePro';

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title={title} />
        <main className="flex-1 p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
