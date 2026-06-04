import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock, Zap, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

// ── Types ──────────────────────────────────────────────────────────────────────

type TourType = 'STANDARD' | 'GV' | 'INSTALL' | 'MONO' | 'SPECIAL';
type WdStatus = 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';

interface ExpressMission { id: string; type: string; pay: number; notes: string | null }
interface WorkedDay {
  id: string; employeeId: string; date: string; tourType: TourType;
  employeeRole: 'CHAUFFEUR' | 'AIDE'; basePay: number; overridePay: number | null;
  finalPay: number; status: WdStatus; confirmedAt: string | null; overrideNote: string | null;
  employee: { id: string; name: string };
  tour: { id: string; tourCode: string; date: string; platform: { name: string } } | null;
  expressMissions: ExpressMission[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAY_NAMES   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const TYPE_LABEL: Record<TourType, string> = {
  STANDARD: 'Standard', GV: 'GV', INSTALL: 'Install', MONO: 'Mono', SPECIAL: 'Spéciale',
};

// Background + text colors for calendar cells
const CELL_BG: Record<TourType, string> = {
  STANDARD: 'bg-blue-500',
  GV:       'bg-violet-500',
  INSTALL:  'bg-amber-500',
  MONO:     'bg-teal-500',
  SPECIAL:  'bg-pink-500',
};
const CELL_LIGHT: Record<TourType, string> = {
  STANDARD: 'bg-blue-50 border-blue-200 text-blue-900',
  GV:       'bg-violet-50 border-violet-200 text-violet-900',
  INSTALL:  'bg-amber-50 border-amber-200 text-amber-900',
  MONO:     'bg-teal-50 border-teal-200 text-teal-900',
  SPECIAL:  'bg-pink-50 border-pink-200 text-pink-900',
};
const DOT_COLOR: Record<TourType, string> = {
  STANDARD: 'bg-blue-500', GV: 'bg-violet-500', INSTALL: 'bg-amber-500', MONO: 'bg-teal-500', SPECIAL: 'bg-pink-500',
};

// ── Detail panel ──────────────────────────────────────────────────────────────

function WdPanel({ wd, onClose, onRefresh }: { wd: WorkedDay | null; onClose: () => void; onRefresh: () => void }) {
  const { success, error, toasts, removeToast } = useToast();

  const confirmMut = useMutation({
    mutationFn: () => api.post(`/worked-days/${wd!.id}/confirm`),
    onSuccess: () => { success('Journée confirmée !'); onRefresh(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });

  if (!wd) return null;

  const dateStr = new Date(wd.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const expressTotal = wd.expressMissions.reduce((s, m) => s + m.pay, 0);

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <SheetContent className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Ma journée
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Date + tour */}
          <div className={`rounded-xl p-4 border ${wd.status === 'CANCELLED' ? 'bg-gray-50 border-gray-200' : CELL_LIGHT[wd.tourType]}`}>
            <p className="text-xs font-medium opacity-60 mb-1">{dateStr}</p>
            {wd.tour ? (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-2xl">{wd.tour.tourCode}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${CELL_BG[wd.tourType]}`}>
                  {TYPE_LABEL[wd.tourType]}
                </span>
              </div>
            ) : (
              <span className="text-lg font-semibold opacity-60">Journée manuelle</span>
            )}
            {wd.tour && <p className="text-sm opacity-70 mt-0.5">{wd.tour.platform.name}</p>}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {wd.status === 'CONFIRMED' && (
              <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                <Lock size={10} /> Confirmé {wd.confirmedAt && `le ${new Date(wd.confirmedAt).toLocaleDateString('fr-FR')}`}
              </Badge>
            )}
            {wd.status === 'ASSIGNED' && <Badge className="bg-yellow-100 text-yellow-800">En attente de confirmation</Badge>}
            {wd.status === 'CANCELLED' && <Badge className="bg-gray-100 text-gray-600">Annulé</Badge>}
          </div>

          {/* Pay breakdown */}
          <div className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{TYPE_LABEL[wd.tourType]} — {wd.employeeRole === 'CHAUFFEUR' ? 'Chauffeur' : 'Aide'}</span>
              <span className="font-semibold">{wd.overridePay ?? wd.basePay}€</span>
            </div>
            {expressTotal > 0 && (
              <div className="flex justify-between text-sm text-yellow-700">
                <span className="flex items-center gap-1"><Zap size={12} /> Missions express</span>
                <span className="font-semibold">+{expressTotal}€</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span>
              <span className="text-green-700">{wd.finalPay}€</span>
            </div>
          </div>

          {/* Express missions */}
          {wd.expressMissions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Missions Express</p>
              {wd.expressMissions.map(m => (
                <div key={m.id} className="flex justify-between bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium">{m.type}{m.notes ? ` — ${m.notes}` : ''}</span>
                  <span className="text-yellow-700 font-semibold">+{m.pay}€</span>
                </div>
              ))}
            </div>
          )}

          {/* Override note */}
          {wd.overrideNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <span className="font-medium">Note du dispatcher : </span>{wd.overrideNote}
            </div>
          )}

          {/* Confirm */}
          {wd.status === 'ASSIGNED' && (
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white" size="lg"
              onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
              <Check size={16} className="mr-2" /> Confirmer la journée
            </Button>
          )}
        </div>
      </SheetContent>
    </>
  );
}

// ── Calendar cell ──────────────────────────────────────────────────────────────

function CalendarCell({ wd, day, isToday, onClick }: {
  wd: WorkedDay | null; day: number; isToday: boolean; onClick: (wd: WorkedDay) => void;
}) {
  const todayRing = isToday ? 'ring-2 ring-blue-500' : '';

  if (!wd) {
    return (
      <div className={`min-h-16 rounded-xl border border-gray-100 p-1.5 ${isToday ? 'border-blue-200' : ''}`}>
        <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day}</span>
      </div>
    );
  }

  const isCancelled = wd.status === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="min-h-16 rounded-xl border border-gray-100 bg-gray-50 p-1.5 opacity-50">
        <span className="text-xs font-medium text-gray-400">{day}</span>
        <div className="mt-1 text-[10px] text-gray-400 line-through text-center">{wd.tour?.tourCode}</div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onClick(wd)}
      className={`min-h-16 w-full rounded-xl border p-1.5 flex flex-col hover:shadow-md transition-all cursor-pointer ${CELL_LIGHT[wd.tourType]} ${todayRing}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className={`text-xs font-bold ${isToday ? 'text-blue-600' : ''}`}>{day}</span>
        <div className="flex gap-0.5">
          {wd.status === 'CONFIRMED' && <Lock size={9} className="opacity-60" />}
          {wd.expressMissions.length > 0 && <Zap size={9} className="opacity-60" />}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center mt-1">
        <span className={`text-sm font-bold font-mono ${CELL_BG[wd.tourType].replace('bg-', 'text-').replace('-500', '-700')}`}>
          {wd.tour?.tourCode ?? '—'}
        </span>
        <span className="text-xs font-semibold mt-0.5 opacity-70">{wd.finalPay}€</span>
      </div>
      {wd.status === 'ASSIGNED' && (
        <div className="mt-1">
          <span className="text-[9px] font-semibold bg-white/70 rounded px-1 py-0.5 text-yellow-700">
            À confirmer
          </span>
        </div>
      )}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyWorkedDays() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [panelWd, setPanelWd] = useState<WorkedDay | null>(null);

  const { data: profile } = useQuery<{ id: string; name: string }>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/employees/me/profile').then(r => r.data),
    enabled: !!user,
  });

  const { data: workedDays, isLoading } = useQuery<WorkedDay[]>({
    queryKey: ['my-worked-days', profile?.id, month, year],
    queryFn: () => api.get('/worked-days', { params: { employeeId: profile!.id, month, year } }).then(r => r.data),
    enabled: !!profile?.id,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-worked-days', profile?.id, month, year] });
    if (panelWd) api.get(`/worked-days/${panelWd.id}`).then(r => setPanelWd(r.data)).catch(() => {});
  };

  // ── Calendar math ──────────────────────────────────────────────────────────
  // Use UTC to match @db.Date storage
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1; // Monday-first grid
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // dayMap: day-of-month → WorkedDay (first)
  const dayMap = useMemo(() => {
    const m = new Map<number, WorkedDay>();
    for (const wd of workedDays ?? []) {
      const d = new Date(wd.date).getUTCDate();
      if (!m.has(d)) m.set(d, wd);
    }
    return m;
  }, [workedDays]);

  // Today for highlighting
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const isToday = (d: number) =>
    year === now.getUTCFullYear() && month - 1 === now.getUTCMonth() && d === now.getUTCDate();

  // Summary
  const { totalPay, confirmedCount, pendingCount, byType } = useMemo(() => {
    const active = (workedDays ?? []).filter(w => w.status !== 'CANCELLED');
    const totalPay = active.reduce((s, w) => s + w.finalPay, 0);
    const confirmedCount = active.filter(w => w.status === 'CONFIRMED').length;
    const pendingCount   = active.filter(w => w.status === 'ASSIGNED').length;
    const byType = new Map<TourType, { count: number; pay: number }>();
    for (const w of active) {
      if (!byType.has(w.tourType)) byType.set(w.tourType, { count: 0, pay: 0 });
      byType.get(w.tourType)!.count++;
      byType.get(w.tourType)!.pay += w.finalPay;
    }
    return { totalPay, confirmedCount, pendingCount, byType };
  }, [workedDays]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Build flat grid: array of {day|null}
  const gridCells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Month nav */}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
            <span className="font-bold text-lg text-gray-800 w-44 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
          </div>

          {/* Stats chips */}
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="bg-blue-50 text-blue-700 font-semibold px-3 py-1 rounded-full">
              {(confirmedCount + pendingCount)} jours
            </span>
            <span className="bg-green-50 text-green-700 font-bold px-3 py-1 rounded-full">
              {totalPay.toFixed(0)}€
            </span>
            {pendingCount > 0 && (
              <span className="bg-yellow-50 text-yellow-700 font-semibold px-3 py-1 rounded-full animate-pulse">
                {pendingCount} à confirmer
              </span>
            )}
            {confirmedCount > 0 && (
              <span className="bg-gray-50 text-gray-600 px-3 py-1 rounded-full flex items-center gap-1">
                <Lock size={11} /> {confirmedCount} confirmé{confirmedCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Calendar ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAY_NAMES.map(d => (
            <div key={d} className={`text-center text-xs font-semibold pb-2 ${d === 'Sam' || d === 'Dim' ? 'text-gray-400' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {gridCells.map((day, i) => {
              if (day === null) {
                return <div key={`blank-${i}`} className="min-h-16" />;
              }
              const wd = dayMap.get(day) ?? null;
              return (
                <CalendarCell
                  key={day}
                  day={day}
                  wd={wd}
                  isToday={isToday(day)}
                  onClick={setPanelWd}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Earnings breakdown ────────────────────────────────────────────── */}
      {!isLoading && byType.size > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Récapitulatif du mois</h3>
          <div className="space-y-2">
            {Array.from(byType.entries()).map(([type, { count, pay }]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${DOT_COLOR[type]}`} />
                  <span className="text-sm text-gray-700">{TYPE_LABEL[type]}</span>
                  <span className="text-xs text-gray-400">{count}×</span>
                </div>
                <span className="font-semibold text-gray-800">{pay.toFixed(0)}€</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 mt-2">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-lg text-green-700">{totalPay.toFixed(0)}€</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Side panel ───────────────────────────────────────────────────── */}
      <Sheet open={!!panelWd} onOpenChange={o => { if (!o) setPanelWd(null); }}>
        <WdPanel wd={panelWd} onClose={() => setPanelWd(null)} onRefresh={refresh} />
      </Sheet>
    </div>
  );
}
