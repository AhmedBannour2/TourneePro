import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: Notification[];
  unreadCount: number;
}

const TYPE_ICONS: Record<string, string> = {
  TOUR_ASSIGNED: '🚛',
  TOUR_CONFIRMED: '✅',
  TOUR_UNASSIGNED: '↩️',
  INSPECTION_SUBMITTED: '📋',
  INSPECTION_PROBLEM: '⚠️',
  DOCUMENT_EXPIRING: '📄',
  EXPRESS_ASSIGNED: '⚡',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ['notifications', user?.id],
    queryFn: () =>
      api.get<NotificationsResponse>('/notifications', { params: { userId: user?.id, limit: 20 } }).then((r) => r.data),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/notifications/${id}/read`, { userId: user?.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all', { userId: user?.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });

  const handleClick = (notif: Notification) => {
    if (!notif.read) markReadMutation.mutate(notif.id);
    if (notif.link) window.location.href = notif.link;
    setOpen(false);
  };

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  if (!user?.id) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">Notifications</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAllMutation.mutate()}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                  title="Tout marquer comme lu"
                >
                  <CheckCheck size={13} /> Tout lire
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                Aucune notification
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}
                >
                  <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                    {TYPE_ICONS[n.type] ?? '🔔'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
