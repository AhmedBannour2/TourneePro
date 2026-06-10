import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Lock, Pencil, Zap, X, Plus, Check, Ban, Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

// ── Types ──────────────────────────────────────────────────────────────────────

type TourType = 'STANDARD' | 'GV' | 'INSTALL' | 'MONO' | 'SPECIAL';
type WdStatus = 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';
type ExpressType = 'STANDARD' | 'GV';

interface ExpressMission {
  id: string; type: ExpressType; pay: number; notes: string | null;
  addedAt: string; addedBy: { id: string; email: string } | null;
}
interface WorkedDay {
  id: string; employeeId: string; tourId: string | null; date: string;
  tourType: TourType | null; employeeRole: 'CHAUFFEUR' | 'AIDE';
  basePay: number; overridePay: number | null; finalPay: number;
  status: WdStatus; confirmedAt: string | null;
  overrideNote: string | null; overrideById: string | null; overrideAt: string | null;
  createdAt: string;
  employee: { id: string; name: string; firstName: string | null; lastName: string | null; role: string };
  tour: { id: string; tourCode: string; date: string; platform: { name: string; code: string } } | null;
  expressMissions: ExpressMission[];
  overrideBy: { id: string; email: string } | null;
}
interface SummaryData {
  totalWorkedDays: number; totalPayroll: number; unconfirmedDays: number; cancelledDays: number;
}
interface Employee { id: string; name: string; isActive: boolean; role: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const DAY_NAMES = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const TYPE_LABEL: Record<TourType, string> = {
  STANDARD: 'Standard', GV: 'GV', INSTALL: 'Install', MONO: 'Mono', SPECIAL: 'Spéciale',
};
const CELL_BG: Record<TourType, string> = {
  STANDARD: 'bg-blue-500', GV: 'bg-violet-500', INSTALL: 'bg-amber-500',
  MONO: 'bg-teal-500', SPECIAL: 'bg-pink-500',
};
const CELL_LIGHT: Record<TourType, string> = {
  STANDARD: 'bg-blue-50 border-blue-200 text-blue-900',
  GV:       'bg-violet-50 border-violet-200 text-violet-900',
  INSTALL:  'bg-amber-50 border-amber-200 text-amber-900',
  MONO:     'bg-teal-50 border-teal-200 text-teal-900',
  SPECIAL:  'bg-pink-50 border-pink-200 text-pink-900',
};
const DOT_COLOR: Record<TourType, string> = {
  STANDARD: 'bg-blue-500', GV: 'bg-violet-500', INSTALL: 'bg-amber-500',
  MONO: 'bg-teal-500', SPECIAL: 'bg-pink-500',
};

// Express-only day (tourType === null) — yellow/gold
const EXPRESS_CELL_BG    = 'bg-yellow-500';
const EXPRESS_CELL_LIGHT = 'bg-yellow-50 border-yellow-200 text-yellow-900';
const EXPRESS_TEXT       = 'text-yellow-700';
const EXPRESS_DOT        = 'bg-yellow-500';

function getTypeLabel(t: TourType | null)     { return t ? TYPE_LABEL[t]  : 'Express'; }
function getCellLight(t: TourType | null)     { return t ? CELL_LIGHT[t]  : EXPRESS_CELL_LIGHT; }
function getCellBg(t: TourType | null)        { return t ? CELL_BG[t]     : EXPRESS_CELL_BG; }
function getDotColor(t: TourType | null)      { return t ? DOT_COLOR[t]   : EXPRESS_DOT; }
function getCellTextColor(t: TourType | null) {
  return t ? CELL_BG[t].replace('bg-', 'text-').replace('-500', '-700') : EXPRESS_TEXT;
}

// ── Calendar cell (same design as employee view) ───────────────────────────────

function CalendarCell({
  wd, day, onClick,
}: { wd: WorkedDay | null; day: number; onClick: (wd: WorkedDay) => void }) {
  if (!wd) {
    return <div className="min-h-[72px] rounded-xl border border-gray-100 p-1.5">
      <span className="text-xs font-medium text-gray-400">{day}</span>
    </div>;
  }

  const isCancelled = wd.status === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="min-h-[72px] rounded-xl border border-gray-100 bg-gray-50 p-1.5 opacity-50">
        <span className="text-xs font-medium text-gray-400">{day}</span>
        <div className="mt-1 text-[10px] text-gray-400 line-through text-center">
          {wd.tour?.tourCode ?? '—'}
        </div>
      </div>
    );
  }

  const isExpress = wd.tourType === null;

  return (
    <button
      onClick={() => onClick(wd)}
      className={`min-h-[72px] w-full rounded-xl border p-1.5 flex flex-col hover:shadow-md transition-all cursor-pointer ${getCellLight(wd.tourType)}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-xs font-bold text-gray-600">{day}</span>
        <div className="flex gap-0.5">
          {wd.status === 'CONFIRMED' && <Lock size={9} className="opacity-50" />}
          {wd.overridePay != null && <Pencil size={9} className="opacity-50" />}
          {(wd.expressMissions.length > 0 || isExpress) && <Zap size={9} className="opacity-50" />}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center mt-1">
        {isExpress ? (
          <Zap size={14} className="text-yellow-600 opacity-80" />
        ) : (
          <span className={`text-sm font-bold font-mono ${getCellTextColor(wd.tourType)}`}>
            {wd.tour?.tourCode ?? '—'}
          </span>
        )}
        <span className="text-xs font-semibold opacity-60 mt-0.5">{wd.finalPay}€</span>
      </div>
      {wd.status === 'ASSIGNED' && (
        <div className="mt-1">
          <span className="text-[9px] font-semibold bg-white/60 rounded px-1 py-0.5 text-yellow-700">En attente</span>
        </div>
      )}
    </button>
  );
}

// ── Admin side panel ───────────────────────────────────────────────────────────

function AdminWdPanel({
  wd, onClose, onRefresh,
}: { wd: WorkedDay | null; onClose: () => void; onRefresh: () => void }) {
  const [overridePay, setOverridePay] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [expressType, setExpressType] = useState<ExpressType>('STANDARD');
  const [expressNote, setExpressNote] = useState('');
  const { success, error, toasts, removeToast } = useToast();

  const overrideMut = useMutation({
    mutationFn: () => api.patch(`/worked-days/${wd!.id}/override`, {
      overridePay: parseFloat(overridePay), overrideNote: overrideNote || undefined,
    }),
    onSuccess: () => { success('Paiement modifié'); onRefresh(); setOverridePay(''); setOverrideNote(''); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });
  const confirmMut = useMutation({
    mutationFn: () => api.post(`/worked-days/${wd!.id}/confirm`),
    onSuccess: () => { success('Journée confirmée'); onRefresh(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.patch(`/worked-days/${wd!.id}/cancel`),
    onSuccess: () => { success('Journée annulée'); onRefresh(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });
  const addExpressMut = useMutation({
    mutationFn: () => api.post(`/worked-days/${wd!.id}/express`, { type: expressType, notes: expressNote || undefined }),
    onSuccess: () => { success('Express ajouté'); onRefresh(); setExpressNote(''); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });
  const delExpressMut = useMutation({
    mutationFn: (eid: string) => api.delete(`/worked-days/${wd!.id}/express/${eid}`),
    onSuccess: () => { success('Express supprimé'); onRefresh(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });

  if (!wd) return null;

  const dateStr = new Date(wd.date).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <SheetContent className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Détail — {wd.employee.name}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Date + tour header */}
          <div className={`rounded-xl p-4 border ${wd.status === 'CANCELLED' ? 'bg-gray-50 border-gray-200' : getCellLight(wd.tourType)}`}>
            <p className="text-xs font-medium opacity-60 mb-1">{dateStr}</p>
            <div className="flex items-center gap-2">
              {wd.tourType === null ? (
                <span className="flex items-center gap-1.5 text-lg font-semibold text-yellow-700">
                  <Zap size={18} className="text-yellow-500" /> Express uniquement
                </span>
              ) : wd.tour ? (
                <span className="font-mono font-bold text-2xl">{wd.tour.tourCode}</span>
              ) : (
                <span className="text-lg font-semibold opacity-60">Journée manuelle</span>
              )}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${getCellBg(wd.tourType)}`}>
                {getTypeLabel(wd.tourType)}
              </span>
            </div>
            {wd.tour && <p className="text-sm opacity-70 mt-0.5">{wd.tour.platform.name}</p>}
            <p className="text-xs opacity-50 mt-1 capitalize">{wd.employeeRole.toLowerCase()}</p>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            {wd.status === 'CONFIRMED' && (
              <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                <Lock size={10} /> Confirmé
              </Badge>
            )}
            {wd.status === 'ASSIGNED' && <Badge className="bg-yellow-100 text-yellow-800">En attente</Badge>}
            {wd.status === 'CANCELLED' && <Badge className="bg-gray-100 text-gray-600">Annulé</Badge>}
          </div>

          {/* Pay breakdown */}
          <div className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Base</span>
              <span className="font-semibold">{wd.basePay}€</span>
            </div>
            {wd.expressMissions.length > 0 && (
              <div className="flex justify-between text-sm text-yellow-700">
                <span className="flex items-center gap-1"><Zap size={12} /> Express</span>
                <span className="font-semibold">+{wd.expressMissions.reduce((s, m) => s + m.pay, 0)}€</span>
              </div>
            )}
            {wd.overridePay != null && (
              <div className="flex justify-between text-sm text-orange-700">
                <span>Base modifiée</span><span className="font-semibold">{wd.overridePay}€</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span><span>{wd.finalPay}€</span>
            </div>
          </div>

          {/* Override info */}
          {wd.overridePay != null && wd.overrideBy && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Modifié par <strong>{wd.overrideBy.email}</strong> le{' '}
              {wd.overrideAt ? new Date(wd.overrideAt).toLocaleDateString('fr-FR') : '—'}
              {wd.overrideNote && <div className="mt-1 italic">"{wd.overrideNote}"</div>}
            </div>
          )}

          {/* Express missions */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Zap size={11} className="text-yellow-500" /> Missions Express
            </p>
            {wd.expressMissions.length === 0
              ? <p className="text-xs text-gray-400">Aucune</p>
              : (
                <div className="space-y-1 mb-2">
                  {wd.expressMissions.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{m.type}</span>
                        <span className="text-yellow-700 ml-2">+{m.pay}€</span>
                        {m.notes && <span className="text-gray-400 text-xs ml-2">— {m.notes}</span>}
                      </span>
                      <button onClick={() => delExpressMut.mutate(m.id)} disabled={delExpressMut.isPending}
                        className="text-red-400 hover:text-red-600 p-1"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            {wd.status !== 'CANCELLED' && (
              <div className="flex gap-2">
                <Select value={expressType} onValueChange={v => setExpressType(v as ExpressType)}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">Standard (+30€)</SelectItem>
                    <SelectItem value="GV">GV (+50€)</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Note..." value={expressNote} onChange={e => setExpressNote(e.target.value)} className="flex-1 h-8 text-xs" />
                <Button size="sm" onClick={() => addExpressMut.mutate()} disabled={addExpressMut.isPending} className="h-8 px-2">
                  <Plus size={14} />
                </Button>
              </div>
            )}
          </div>

          {/* Override pay */}
          {wd.status !== 'CANCELLED' && (
            <div className="border rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-gray-600 flex items-center gap-1"><Pencil size={11} /> Modifier le paiement</p>
              <Input type="number" min="0" step="0.01" placeholder={String(wd.basePay)} value={overridePay}
                onChange={e => setOverridePay(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Raison de la modification..." value={overrideNote}
                onChange={e => setOverrideNote(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" className="w-full" onClick={() => overrideMut.mutate()}
                disabled={!overridePay || overrideMut.isPending}>
                Enregistrer
              </Button>
            </div>
          )}

          {/* Confirm / Cancel */}
          {wd.status === 'ASSIGNED' && (
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
                <Check size={13} className="mr-1" /> Confirmer
              </Button>
              <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                <Ban size={13} className="mr-1" /> Annuler
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkedDays() {
  const queryClient = useQueryClient();
  const { toasts, removeToast } = useToast();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [panelWd, setPanelWd] = useState<WorkedDay | null>(null);

  // Employees list
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['employees-active'],
    queryFn: () => api.get<Employee[]>('/employees', { params: { isActive: true } }).then(r => r.data),
  });

  // Worked days — always fetch; omit employeeId when "all" is selected
  const { data: workedDays, isLoading } = useQuery<WorkedDay[]>({
    queryKey: ['worked-days', selectedEmpId, month, year],
    queryFn: () => {
      const params: Record<string, string | number> = { month, year };
      if (selectedEmpId !== 'all') params.employeeId = selectedEmpId;
      return api.get('/worked-days', { params }).then(r => r.data);
    },
  });

  // Global summary (all employees)
  const { data: summary } = useQuery<SummaryData>({
    queryKey: ['worked-days-summary', month, year],
    queryFn: () => api.get('/worked-days/summary', { params: { month, year } }).then(r => r.data),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['worked-days', selectedEmpId, month, year] });
    queryClient.invalidateQueries({ queryKey: ['worked-days-summary', month, year] });
    if (panelWd) api.get(`/worked-days/${panelWd.id}`).then(r => setPanelWd(r.data)).catch(() => {});
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // ── Calendar math (UTC-based, same as employee view) ──────────────────────
  const firstDow     = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth  = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const dayMap = useMemo(() => {
    const m = new Map<number, WorkedDay>();
    for (const wd of workedDays ?? []) {
      const d = new Date(wd.date).getUTCDate();
      if (!m.has(d)) m.set(d, wd);
    }
    return m;
  }, [workedDays]);

  // Per-employee summary (for the selected employee)
  const { empTotalPay, empConfirmed, empPending, empByType } = useMemo(() => {
    const active = (workedDays ?? []).filter(w => w.status !== 'CANCELLED');
    const empTotalPay  = active.reduce((s, w) => s + w.finalPay, 0);
    const empConfirmed = active.filter(w => w.status === 'CONFIRMED').length;
    const empPending   = active.filter(w => w.status === 'ASSIGNED').length;
    const empByType    = new Map<TourType | null, { count: number; pay: number }>();
    for (const w of active) {
      const key = w.tourType;
      if (!empByType.has(key)) empByType.set(key, { count: 0, pay: 0 });
      empByType.get(key)!.count++;
      empByType.get(key)!.pay += w.finalPay;
    }
    return { empTotalPay, empConfirmed, empPending, empByType };
  }, [workedDays]);

  // All-employees table rows (used when selectedEmpId === 'all')
  const allEmpRows = useMemo(() => {
    if (!workedDays) return [];
    const map = new Map<string, {
      id: string; name: string; days: number; confirmed: number; pending: number;
      cancelled: number; totalPay: number;
    }>();
    for (const wd of workedDays) {
      const id = wd.employeeId;
      if (!map.has(id)) map.set(id, { id, name: wd.employee.name, days: 0, confirmed: 0, pending: 0, cancelled: 0, totalPay: 0 });
      const row = map.get(id)!;
      if (wd.status === 'CANCELLED') { row.cancelled++; }
      else { row.days++; row.totalPay += wd.finalPay; }
      if (wd.status === 'CONFIRMED') row.confirmed++;
      if (wd.status === 'ASSIGNED')  row.pending++;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [workedDays]);

  // Build grid cells
  const gridCells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  const selectedEmp = employees?.find(e => e.id === selectedEmpId);

  return (
    <div className="space-y-3 md:space-y-4">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Month nav */}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <ChevronLeft size={18} />
            </button>
            <span className="font-bold text-lg text-gray-800 w-44 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Employee selector */}
          <div className="flex items-center gap-2">
            {selectedEmpId !== 'all' && (
              <button
                onClick={() => { setSelectedEmpId('all'); setPanelWd(null); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 hover:border-blue-200"
              >
                <ChevronLeft size={14} /> Tous les employés
              </button>
            )}
            <Users size={16} className="text-gray-400" />
            <select
              value={selectedEmpId}
              onChange={e => { setSelectedEmpId(e.target.value); setPanelWd(null); }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-52"
            >
              <option value="all">Tous les employés</option>
              {(employees ?? []).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Stats — switch between global and per-employee */}
          <div className="flex items-center gap-3 flex-wrap">
            {selectedEmpId === 'all' ? (
              <>
                <span className="bg-blue-50 text-blue-700 font-semibold px-3 py-1 rounded-full text-sm">
                  {summary?.totalWorkedDays ?? '—'} jours
                </span>
                <span className="bg-green-50 text-green-700 font-bold px-3 py-1 rounded-full text-sm">
                  {summary ? `${summary.totalPayroll.toFixed(0)}€` : '—'}
                </span>
                {(summary?.unconfirmedDays ?? 0) > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 font-semibold px-3 py-1 rounded-full text-sm">
                    {summary!.unconfirmedDays} non confirmés
                  </span>
                )}
                {(summary?.cancelledDays ?? 0) > 0 && (
                  <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-sm">
                    {summary!.cancelledDays} annulés
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="bg-blue-50 text-blue-700 font-semibold px-3 py-1 rounded-full text-sm">
                  {empConfirmed + empPending} jours
                </span>
                <span className="bg-green-50 text-green-700 font-bold px-3 py-1 rounded-full text-sm">
                  {empTotalPay.toFixed(0)}€
                </span>
                {empPending > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 font-semibold px-3 py-1 rounded-full text-sm animate-pulse">
                    {empPending} à confirmer
                  </span>
                )}
                {empConfirmed > 0 && (
                  <span className="bg-gray-50 text-gray-600 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                    <Lock size={11} /> {empConfirmed} confirmé{empConfirmed > 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Calendar / List ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border p-4">
        {selectedEmpId === 'all' ? (
          /* All-employees summary — table with horizontal scroll on mobile */
          isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : allEmpRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Aucune journée travaillée ce mois</div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Employé</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500">Jours</th>
                    <th className="text-center py-2 px-3 font-medium text-green-600">Confirmés</th>
                    <th className="text-center py-2 px-3 font-medium text-yellow-600">En attente</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-400">Annulés</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allEmpRows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <button onClick={() => { setSelectedEmpId(row.id); setPanelWd(null); }}
                          className="font-medium text-gray-800 hover:text-blue-700 hover:underline cursor-pointer text-left">
                          {row.name}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center text-gray-600">{row.days}</td>
                      <td className="py-3 px-3 text-center">
                        {row.confirmed > 0 ? <span className="inline-flex items-center gap-1 text-green-700 font-semibold"><Lock size={11} />{row.confirmed}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.pending > 0 ? <span className="text-yellow-600 font-semibold">{row.pending}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-3 text-center text-gray-400">
                        {row.cancelled > 0 ? row.cancelled : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-gray-800">{row.totalPay.toFixed(0)}€</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="py-2.5 px-3 font-bold text-gray-700">Total</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-gray-700">{allEmpRows.reduce((s, r) => s + r.days, 0)}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-green-700">{allEmpRows.reduce((s, r) => s + r.confirmed, 0)}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-yellow-600">{allEmpRows.reduce((s, r) => s + r.pending, 0)}</td>
                    <td className="py-2.5 px-3 text-center text-gray-400">{allEmpRows.reduce((s, r) => s + r.cancelled, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-green-700 text-base">{allEmpRows.reduce((s, r) => s + r.totalPay, 0).toFixed(0)}€</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : isLoading ? (
          <>
            <div className="hidden md:grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
            </div>
            <div className="md:hidden space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          </>
        ) : (
          <>
            {/* Desktop: 7-column calendar grid */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 mb-2">
                {DAY_NAMES.map(d => (
                  <div key={d} className={`text-center text-xs font-semibold pb-2 ${d === 'Sam' || d === 'Dim' ? 'text-gray-400' : 'text-gray-500'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {gridCells.map((day, i) => {
                  if (day === null) return <div key={`b-${i}`} className="min-h-[72px]" />;
                  return <CalendarCell key={day} day={day} wd={dayMap.get(day) ?? null} onClick={setPanelWd} />;
                })}
              </div>
            </div>

            {/* Mobile: vertical list of worked days */}
            <div className="block md:hidden">
              {(workedDays ?? []).length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Aucune journée ce mois</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {[...(workedDays ?? [])]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(wd => {
                      const d = new Date(wd.date);
                      const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                      const statusIcon = wd.status === 'CONFIRMED' ? '✓' : wd.status === 'CANCELLED' ? '✕' : '·';
                      const statusColor = wd.status === 'CONFIRMED' ? 'text-green-600' : wd.status === 'CANCELLED' ? 'text-gray-400' : 'text-yellow-600';
                      return (
                        <button
                          key={wd.id}
                          onClick={() => setPanelWd(wd)}
                          className="w-full text-left flex justify-between items-center py-3 px-1 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                          {/* Left: date + tour code + type badge */}
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-1.5 h-full min-h-[32px] rounded-full flex-shrink-0 ${getCellBg(wd.tourType)}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold leading-snug">{dateStr}</span>
                                {wd.tour && <span className="text-xs text-gray-500 font-mono">{wd.tour.tourCode}</span>}
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getCellLight(wd.tourType)}`}>
                                  {getTypeLabel(wd.tourType)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 leading-snug">
                                {wd.employeeRole === 'CHAUFFEUR' ? 'Chauffeur' : 'Aide'}
                                {wd.tour?.platform && <> · {wd.tour.platform.name}</>}
                              </div>
                            </div>
                          </div>
                          {/* Right: pay + status */}
                          <div className="flex-shrink-0 text-right ml-2">
                            <div className="text-sm font-bold text-gray-900">{wd.finalPay.toFixed(0)}€</div>
                            <div className={`text-xs font-medium ${statusColor}`}>{statusIcon} {wd.status === 'CONFIRMED' ? 'Confirmé' : wd.status === 'CANCELLED' ? 'Annulé' : 'Attente'}</div>
                          </div>
                        </button>
                      );
                    })
                  }
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Per-employee breakdown ────────────────────────────────────────── */}
      {selectedEmpId !== 'all' && !isLoading && empByType.size > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Récapitulatif — {selectedEmp?.name}
          </h3>
          <div className="space-y-2">
            {Array.from(empByType.entries()).map(([type, { count, pay }]) => (
              <div key={type ?? 'EXPRESS'} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getDotColor(type)}`} />
                  <span className="text-sm text-gray-700 flex items-center gap-1">
                    {type === null && <Zap size={11} className="text-yellow-500" />}
                    {getTypeLabel(type)}
                  </span>
                  <span className="text-xs text-gray-400">{count}×</span>
                </div>
                <span className="font-semibold text-gray-800">{pay.toFixed(0)}€</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 mt-1">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-lg text-green-700">{empTotalPay.toFixed(0)}€</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 px-1">
        {(Object.entries(TYPE_LABEL) as [TourType, string][]).map(([t, label]) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${DOT_COLOR[t]}`} />
            {label}
          </span>
        ))}
        <span className="text-gray-300">·</span>
        <span className="flex items-center gap-1"><Lock size={10} /> Confirmé</span>
        <span className="flex items-center gap-1"><Pencil size={10} /> Modifié</span>
        <span className="flex items-center gap-1"><Zap size={10} className="text-yellow-500" /> Express</span>
      </div>

      {/* ── Admin side panel ─────────────────────────────────────────────── */}
      <Sheet open={!!panelWd} onOpenChange={o => { if (!o) setPanelWd(null); }}>
        <AdminWdPanel wd={panelWd} onClose={() => setPanelWd(null)} onRefresh={refresh} />
      </Sheet>
    </div>
  );
}
