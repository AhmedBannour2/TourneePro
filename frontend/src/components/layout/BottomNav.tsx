import { useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import {
  LayoutDashboard, Truck, Users, Car, Zap,
  Calendar, Settings, CalendarCheck, SlidersHorizontal, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// ── Nav definitions ────────────────────────────────────────────────────────────

const adminMain = [
  { path: '/',          label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/tours',     label: 'Tournées',  icon: Truck,           exact: false },
  { path: '/express',   label: 'Express',   icon: Zap,             exact: false },
  { path: '/employees', label: 'Employés',  icon: Users,           exact: false },
  { path: '/trucks',    label: 'Camions',   icon: Car,             exact: false },
] as const;

const adminSpeedDial = [
  { label: 'Jours travaillés', icon: Calendar, path: '/worked-days', color: 'bg-blue-500' },
  { label: 'Paramètres',       icon: Settings, path: '/settings',    color: 'bg-slate-700' },
] as const;

const employeeMain = [
  { path: '/',               label: 'Accueil',   icon: LayoutDashboard,   exact: true },
  { path: '/my-assignments', label: 'Tournées',  icon: CalendarCheck,     exact: false },
  { path: '/my-worked-days', label: 'Mes jours', icon: Calendar,          exact: false },
  { path: '/settings',       label: 'Profil',    icon: SlidersHorizontal, exact: false },
] as const;

// ── NavTabItem ─────────────────────────────────────────────────────────────────

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

  // Speed-dial items rendered bottom-to-top; delays 0→N so the closest item animates first
  const dialItems = [
    ...adminSpeedDial.map(({ label, icon, path, color }) => ({
      label, icon, color,
      onClick: () => setMoreOpen(false),
      href: path,
    })),
    { label: 'Déconnexion', icon: LogOut, color: 'bg-red-500', onClick: handleLogout, href: null },
  ];

  return (
    <>
      {/* Speed-dial overlay */}
      {!isEmployee && moreOpen && (
        <>
          {/* Semi-transparent backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Speed-dial items — anchored above the Plus button (right side) */}
          <div className="fixed bottom-[68px] right-3 z-50 flex flex-col-reverse items-end gap-4 md:hidden">
            {dialItems.map(({ label, icon: Icon, color, onClick, href }, i) => (
              <div
                key={label}
                className="flex items-center gap-3 animate-in slide-in-from-bottom-3 fade-in duration-200"
                style={{ animationDelay: `${i * 55}ms`, animationFillMode: 'both' }}
              >
                {/* Label pill */}
                <span className="bg-white/95 backdrop-blur-sm text-gray-800 text-sm font-medium px-3.5 py-1.5 rounded-full shadow-md whitespace-nowrap">
                  {label}
                </span>
                {/* Circle button */}
                {href ? (
                  <Link
                    to={href}
                    onClick={onClick}
                    className={`w-12 h-12 rounded-full ${color} text-white shadow-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform`}
                  >
                    <Icon size={20} />
                  </Link>
                ) : (
                  <button
                    onClick={onClick}
                    className={`w-12 h-12 rounded-full ${color} text-white shadow-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform`}
                  >
                    <Icon size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottom bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch">
          {mainItems.map(({ path, label, icon, exact }) => (
            <NavTabItem key={path} path={path} label={label} icon={icon} exact={exact} />
          ))}

          {/* Plus — admin only */}
          {!isEmployee && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] select-none"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                moreOpen ? 'bg-blue-600 scale-110' : 'bg-gray-100'
              }`}>
                <span className={`text-lg font-bold leading-none transition-colors ${moreOpen ? 'text-white' : 'text-gray-500'}`}>
                  ···
                </span>
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
