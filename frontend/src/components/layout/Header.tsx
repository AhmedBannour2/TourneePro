import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { user } = useAuth();
  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-30">
      <div className="flex justify-between items-center">
        {/* Mobile: app name; desktop: page title */}
        <div>
          <span className="block md:hidden text-lg font-bold text-blue-600">TourneePro</span>
          <h1 className="hidden md:block text-2xl font-bold text-gray-900">{title}</h1>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" className="relative w-9 h-9" title="Notifications">
            <Bell size={18} className="text-gray-600" />
          </Button>

          {user && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-medium text-gray-700 leading-tight">
                  {user.name || user.email}
                </div>
                <div className="text-xs text-gray-500 capitalize">{user.role?.toLowerCase()}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
