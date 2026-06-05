import { useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import {
  LayoutDashboard, Truck, ClipboardList, Users, Car,
  MoreHorizontal, X, Upload, Calendar, Settings, Zap,
  CalendarCheck, SlidersHorizontal, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// ── Nav definitions ────────────────────────────────────────────────────────────

const adminMain = [
  { path: '/',            label: 'Dashboard',    icon: LayoutDashboard, exact: true },
  { path: '/tours',       label: 'Tournées',     icon: Truck,           exact: false },
  { path: '/assignments', label: 'Affectation',  icon: ClipboardList,   exact: false },
  { path: '/employees',   label: 'Employés',     icon: Users,           exact: false },
  { path: '/trucks',      label: 'Camions',      icon: Car,             exact: false },
] as const;

const adminMore = [
  { path: '/express',     label: 'Express',         icon: Zap },
  { path: '/import',      label: 'Import Excel',     icon: Upload },
  { path: '/worked-days', label: 'Jours travaillés', icon: Calendar },
  { path: '/settings',    label: 'Paramètres',       icon: Settings },
] as const;

const employeeMain = [
  { path: '/my-assignments', label: 'Tournées',  icon: CalendarCheck,    exact: false },
  { path: '/express',        label: 'Express',   icon: Zap,              exact: false },
  { path: '/my-worked-days', label: 'Mes jours', icon: Calendar,         exact: false },
  { path: '/settings',       label: 'Profil',    icon: SlidersHorizontal, exact: false },
] as const;

// ── NavTabItem — uses useMatch so it reliably tracks active state ──────────────

function NavTabItem({
  path,
  label,
  icon: Icon,
  exact = false,
}: {
  path: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}) {
  const match = useMatch({ path, end: exact });
  const active = !!match;

  return (
    <Link
      to={path}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] select-none"
    >
      <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-blue-100' : ''}`}>
        <Icon size={20} className={active ? 'text-blue-600' : 'text-gray-500'} />
      </div>
      <span className={`text-[10px] font-medium leading-none ${active ? 'text-blue-600' : 'text-gray-500'}`}>
        {label}
      </span>
    </Link>
  );
}

// ── MoreDrawerItem — NavLink inside the "More" sheet ─────────────────────────

function MoreItem({
  path,
  label,
  icon: Icon,
  onClose,
}: {
  path: string;
  label: string;
  icon: LucideIcon;
  onClose: () => void;
}) {
  const match = useMatch({ path, end: false });
  const active = !!match;

  return (
    <Link
      to={path}
      onClick={onClose}
      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-center transition-colors ${
        active ? 'bg-blue-50 text-blue-600' : 'text-gray-600'
      }`}
    >
      <Icon size={22} />
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

// ── BottomNav ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const isEmployee = user?.role === 'EMPLOYEE';
  const mainItems = (isEmployee ? employeeMain : adminMain) as readonly {
    path: string;
    label: string;
    icon: LucideIcon;
    exact: boolean;
  }[];

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Backdrop + drawer — only mounted when open, so nothing leaks into the UI when closed */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t md:hidden animate-in slide-in-from-bottom duration-200"
            style={{ bottom: '57px' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-gray-800 text-sm">Plus</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-4 py-3 grid grid-cols-4 gap-2">
              {adminMore.map(({ path, label, icon }) => (
                <MoreItem key={path} path={path} label={label} icon={icon} onClose={() => setMoreOpen(false)} />
              ))}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors min-h-[44px]"
              >
                <LogOut size={20} />
                <span className="font-medium text-sm">Déconnexion</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bottom bar — always visible on mobile */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch">
          {mainItems.map(({ path, label, icon, exact }) => (
            <NavTabItem key={path} path={path} label={label} icon={icon} exact={exact} />
          ))}

          {/* More — admin only */}
          {!isEmployee && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] select-none"
            >
              <div className={`p-1.5 rounded-xl transition-colors ${moreOpen ? 'bg-blue-100' : ''}`}>
                <MoreHorizontal size={20} className={moreOpen ? 'text-blue-600' : 'text-gray-500'} />
              </div>
              <span className={`text-[10px] font-medium leading-none ${moreOpen ? 'text-blue-600' : 'text-gray-500'}`}>
                Plus
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
