import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

interface AppShellProps {
  children: ReactNode;
}

const pageTitles: Record<string, string> = {
  '/':                'Dashboard',
  '/tours':           'Tournées',
  '/import':          'Import Excel',
  '/assignments':     "Tableau d'affectation",
  '/express':         'Express',
  '/employees':       'Employés',
  '/trucks':          'Camions',
  '/worked-days':     'Jours travaillés',
  '/settings':        'Paramètres',
  '/my-assignments':  'Mes tournées',
  '/my-worked-days':  'Mes jours travaillés',
};

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'TourneePro';

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        {/* pb-24 on mobile reserves space above the fixed bottom nav */}
        <main className="flex-1 p-4 md:p-6 bg-gray-50 pb-24 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only (renders itself as md:hidden) */}
      <BottomNav />
    </div>
  );
}
