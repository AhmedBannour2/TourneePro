import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Truck,
  Upload,
  ClipboardList,
  Users,
  Calendar,
  Zap,
  Settings,
  Car,
  LogOut,
  Menu,
  X,
  CalendarCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const adminNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tours', label: 'Tours', icon: Truck },
  { path: '/import', label: 'Import Excel', icon: Upload },
  { path: '/assignments', label: 'Assignment Board', icon: ClipboardList },
  { path: '/express', label: 'Express Deliveries', icon: Zap },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/trucks', label: 'Trucks', icon: Car },
  { path: '/worked-days', label: 'Worked Days', icon: Calendar },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const employeeNavItems = [
  { path: '/', label: 'Mon tableau de bord', icon: LayoutDashboard },
  { path: '/my-assignments', label: 'Mes tournées', icon: CalendarCheck },
  { path: '/my-worked-days', label: 'Mes jours travaillés', icon: Calendar },
  { path: '/settings', label: 'Paramètres', icon: SlidersHorizontal },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const isEmployee = user?.role === 'EMPLOYEE';
  const navItems = isEmployee ? employeeNavItems : adminNavItems;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <aside
      className={`bg-gray-900 text-white min-h-screen transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header with logo and toggle */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h2 className="text-2xl font-bold">TourneePro</h2>
              <p className="text-sm text-gray-400">STP Logistics</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white hover:bg-gray-800"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <Menu size={20} /> : <X size={20} />}
          </Button>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`
                  }
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon size={20} />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section at bottom */}
      <div className="p-4 border-t border-gray-800">
        {user && (
          <div className="mb-3">
            {!isCollapsed ? (
              <div className="px-2">
                <div className="text-sm font-medium truncate">{user.email}</div>
                <div className="mt-1">
                  <Badge variant={isEmployee ? 'secondary' : 'default'}>
                    {user.role}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full text-white hover:bg-gray-800 justify-start"
          title={isCollapsed ? 'Logout' : undefined}
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="ml-3">Logout</span>}
        </Button>
      </div>
    </aside>
  );
}
