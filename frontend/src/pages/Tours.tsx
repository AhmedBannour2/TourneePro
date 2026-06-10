import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, ChevronLeft, ChevronRight, Eye, EyeOff, CheckCircle2, Clock,
  ChevronDown, ChevronUp, Plus, Loader2, Trash2, ClipboardCheck, RefreshCw,
  SlidersHorizontal, Pencil,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';

// ─── Sync Button ──────────────────────────────────────────────────────────────

function SyncButton() {
  const queryClient = useQueryClient();
  const { success, error: showError, toasts, removeToast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.post<{ created: number; updated: number; skipped: number; errors: string[] }>('/settings/google/sync'),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['tours-active'] });
      queryClient.invalidateQueries({ queryKey: ['tours-history'] });
      const msg = `${data.created} ajoutées · ${data.updated} mises à jour`;
      success(`Synchronisation terminée — ${msg}`);
    },
    onError: (err: any) => showError(err?.response?.data?.message || 'Erreur de synchronisation'),
  });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1.5 h-9 md:h-10"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        title="Synchroniser depuis Google Sheets"
      >
        <RefreshCw size={15} className={mutation.isPending ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{mutation.isPending ? 'Sync...' : 'Actualiser'}</span>
      </Button>
    </>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  chauffeur: { id: string; name: string } | null;
  aide: { id: string; name: string } | null;
  truck: { id: string; immatriculation: string } | null;
  chauffeurSeenAt: string | null;
  aideSeenAt: string | null;
}

interface TourConfirmation {
  id: string;
  confirmedBy: { id: string; name: string };
  totalClients: number; delivered: number; absent: number; nonConform: number;
  notes: string | null; confirmedAt: string; updatedAt: string;
}

interface Tour {
  id: string; tourCode: string; date: string;
  platform: { id: string; name: string; code: string } | null;
  tourType: string | null; status: string; source: 'IMPORT' | 'MANUAL';
  confirmationStatus: 'UNCONFIRMED' | 'CONFIRMED';
  horaire: string | null; quai: string | null; nbColis: number | null; prestataire: string | null;
  assignments: Assignment[]; confirmation: TourConfirmation | null;
}

interface Platform { id: string; name: string }
interface ToursResponse { data: Tour[]; meta: { total: number; page: number; limit: number; totalPages: number } }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'imported',  label: 'Imported',  cls: 'bg-gray-100 text-gray-700' },
  { value: 'assigned',  label: 'Assigned',  cls: 'bg-blue-100 text-blue-800' },
  { value: 'notified',  label: 'Notified',  cls: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: 'Completed', cls: 'bg-green-100 text-green-800' },
  { value: 'conflict',  label: 'Conflict',  cls: 'bg-red-100 text-red-800' },
  { value: 'cancelled', label: 'Cancelled', cls: 'bg-slate-100 text-slate-700' },
];
const statusMap = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

// Tour type badge colors — normalize various string formats
function typeBadge(tourType: string | null): { label: string; cls: string } | null {
  if (!tourType) return null;
  const t = tourType.toUpperCase()
    .replace('SPÉCIALE', 'SPECIAL')
    .replace('INSTALL', 'INSTALL');
  const lookup: Record<string, { label: string; cls: string }> = {
    STANDARD: { label: 'Standard', cls: 'bg-blue-100 text-blue-800' },
    GV:       { label: 'GV',       cls: 'bg-violet-100 text-violet-800' },
    INSTALL:  { label: 'Install',  cls: 'bg-amber-100 text-amber-800' },
    MONO:     { label: 'Mono',     cls: 'bg-teal-100 text-teal-800' },
    SPECIAL:  { label: 'Spéciale', cls: 'bg-pink-100 text-pink-800' },
  };
  return lookup[t] ?? { label: tourType, cls: 'bg-gray-100 text-gray-700' };
}

function detectTypeStr(code: string): string {
  const n = parseInt(code, 10);
  if (isNaN(n)) return 'Standard';
  if (n >= 500 && n <= 599) return 'Install';
  if (n >= 600 && n <= 699) return 'Mono';
  if (n >= 700 && n <= 799) return 'GV';
  if (n >= 800 && n <= 889) return 'Standard';
  if (n >= 890 && n <= 999) return 'Spéciale';
  return 'Standard';
}

const FILTER_SEL =
  'h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full';

const PRESET_TYPES = ['Standard', 'GV', 'Install', 'Mono', 'Spéciale'];

// ─── Shared tour form fields ───────────────────────────────────────────────────

function TourFormFields({
  code, setCode, date, setDate,
  platId, setPlatId, platforms, onPlatformCreated,
  quai, setQuai, horaire, setHoraire,
  typeStr, setTypeStr,
  showAutoType,
}: {
  code: string; setCode: (v: string) => void;
  date: string; setDate: (v: string) => void;
  platId: string; setPlatId: (v: string) => void;
  platforms: Platform[]; onPlatformCreated: (p: Platform) => void;
  quai: string; setQuai: (v: string) => void;
  horaire: string; setHoraire: (v: string) => void;
  typeStr: string; setTypeStr: (v: string) => void;
  showAutoType?: boolean;
}) {
  const [newPlat, setNewPlat]         = useState(false);
  const [platName, setPlatName]       = useState('');
  const [platCode, setPlatCode]       = useState('');
  const [creatingPlat, setCreatingPlat] = useState(false);
  const [platError, setPlatError]     = useState('');

  const [customType, setCustomType]   = useState(false);
  const [customTypeVal, setCustomTypeVal] = useState('');

  const isCustomType = !PRESET_TYPES.includes(typeStr);

  const createPlatform = async () => {
    if (!platName.trim() || !platCode.trim()) return;
    setCreatingPlat(true); setPlatError('');
    try {
      const { data } = await api.post<Platform>('/platforms', { name: platName.trim(), code: platCode.trim() });
      onPlatformCreated(data);
      setPlatId(data.id);
      setNewPlat(false); setPlatName(''); setPlatCode('');
    } catch (e: any) {
      setPlatError(e.response?.data?.message || 'Erreur création plateforme');
    } finally {
      setCreatingPlat(false);
    }
  };

  const handleTypeChange = (v: string) => {
    if (v === '__custom__') { setCustomType(true); setTypeStr(customTypeVal || ''); }
    else { setCustomType(false); setTypeStr(v); }
  };

  const handleCustomTypeInput = (v: string) => {
    setCustomTypeVal(v); setTypeStr(v);
  };

  const autoType = code ? detectTypeStr(code) : 'Standard';

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Code tournée <span className="text-red-500">*</span></Label>
          <Input
            type="text" placeholder="ex: 804"
            value={code} onChange={e => { setCode(e.target.value); if (!customType) setTypeStr(detectTypeStr(e.target.value)); }}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Date <span className="text-red-500">*</span></Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
        </div>
      </div>

      {/* Platform */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Plateforme <span className="text-red-500">*</span></Label>
          {!newPlat && (
            <button type="button" onClick={() => setNewPlat(true)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              <Plus size={11} /> Nouvelle
            </button>
          )}
        </div>
        {newPlat ? (
          <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
            <p className="text-xs font-medium text-blue-700">Nouvelle plateforme</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nom (ex: Alfortville)" value={platName} onChange={e => setPlatName(e.target.value)} className="bg-white" />
              <Input placeholder="Code (ex: F166)" value={platCode} onChange={e => setPlatCode(e.target.value)} className="bg-white" />
            </div>
            {platError && <p className="text-xs text-red-600">{platError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={createPlatform} disabled={!platName.trim() || !platCode.trim() || creatingPlat} className="h-7 text-xs">
                {creatingPlat ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNewPlat(false); setPlatName(''); setPlatCode(''); setPlatError(''); }} className="h-7 text-xs">
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <select value={platId} onChange={e => setPlatId(e.target.value)} className={`mt-1 ${FILTER_SEL}`}>
            <option value="">— Sélectionner —</option>
            {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Quai</Label>
          <Input placeholder="ex: 54" value={quai} onChange={e => setQuai(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Horaire</Label>
          <Input type="time" value={horaire} onChange={e => setHoraire(e.target.value)} className="mt-1" />
        </div>
      </div>

      {/* Type */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Type</Label>
          {showAutoType && code && !customType && (
            <span className="text-xs text-gray-400">Auto-détecté depuis le code</span>
          )}
        </div>
        {customType || isCustomType ? (
          <div className="flex gap-2">
            <Input
              placeholder="ex: Poids Lourd, SAV..."
              value={customTypeVal || (isCustomType ? typeStr : '')}
              onChange={e => handleCustomTypeInput(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" variant="outline" className="h-9 text-xs shrink-0"
              onClick={() => { setCustomType(false); setTypeStr(detectTypeStr(code)); setCustomTypeVal(''); }}>
              Preset
            </Button>
          </div>
        ) : (
          <select value={typeStr} onChange={e => handleTypeChange(e.target.value)} className={FILTER_SEL}>
            {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="__custom__">Autre (saisir manuellement)…</option>
          </select>
        )}
        {showAutoType && code && !customType && !isCustomType && (
          <p className="text-xs text-gray-400 mt-1">
            Code {code} → type détecté : <strong>{autoType}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Create Tour Modal ────────────────────────────────────────────────────────

function CreateTourModal({ open, platforms, onClose, onCreated }: {
  open: boolean; platforms: Platform[]; onClose: () => void; onCreated: (newPlatform?: Platform) => void;
}) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [code, setCode]       = useState('');
  const [date, setDate]       = useState(tomorrowStr);
  const [platId, setPlatId]   = useState('');
  const [quai, setQuai]       = useState('');
  const [horaire, setHoraire] = useState('');
  const [typeStr, setTypeStr] = useState('Standard');
  const [newPlatform, setNewPlatform] = useState<Platform | undefined>();

  const { success, error, toasts, removeToast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.post('/tours', {
      tourCode: code, date, platformId: platId,
      quai: quai || undefined, horaire: horaire || undefined, tourType: typeStr,
    }),
    onSuccess: () => { success('Tournée créée'); onCreated(newPlatform); onClose(); resetForm(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur création'),
  });

  const resetForm = () => {
    setCode(''); setDate(tomorrowStr); setPlatId(''); setQuai('');
    setHoraire(''); setTypeStr('Standard'); setNewPlatform(undefined);
  };
  const canSave = code.trim() && date && platId;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Nouvelle tournée
            </DialogTitle>
          </DialogHeader>

          <TourFormFields
            code={code} setCode={setCode}
            date={date} setDate={setDate}
            platId={platId} setPlatId={setPlatId}
            platforms={platforms}
            onPlatformCreated={p => { setNewPlatform(p); }}
            quai={quai} setQuai={setQuai}
            horaire={horaire} setHoraire={setHoraire}
            typeStr={typeStr} setTypeStr={setTypeStr}
            showAutoType
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Annuler</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
              {mutation.isPending ? <><Loader2 size={14} className="mr-2 animate-spin" /> Création...</> : 'Créer la tournée'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Edit Tour Modal ──────────────────────────────────────────────────────────

function EditTourModal({ tour, platforms, onClose, onSaved }: {
  tour: Tour; platforms: Platform[]; onClose: () => void; onSaved: (newPlatform?: Platform) => void;
}) {
  const [code, setCode]       = useState(tour.tourCode);
  const [date, setDate]       = useState(tour.date.split('T')[0]);
  const [platId, setPlatId]   = useState(tour.platform?.id ?? '');
  const [quai, setQuai]       = useState(tour.quai ?? '');
  const [horaire, setHoraire] = useState(tour.horaire ?? '');
  const [typeStr, setTypeStr] = useState(tour.tourType ?? 'Standard');
  const [newPlatform, setNewPlatform] = useState<Platform | undefined>();

  const { success, error, toasts, removeToast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.patch(`/tours/${tour.id}`, {
      tourCode: code, date, platformId: platId,
      quai: quai || null, horaire: horaire || null, tourType: typeStr || null,
    }),
    onSuccess: () => { success('Tournée modifiée'); onSaved(newPlatform); onClose(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur modification'),
  });

  const canSave = code.trim() && date && platId;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-blue-600" /> Modifier la tournée
            </DialogTitle>
          </DialogHeader>

          <TourFormFields
            code={code} setCode={setCode}
            date={date} setDate={setDate}
            platId={platId} setPlatId={setPlatId}
            platforms={platforms}
            onPlatformCreated={p => { setNewPlatform(p); }}
            quai={quai} setQuai={setQuai}
            horaire={horaire} setHoraire={setHoraire}
            typeStr={typeStr} setTypeStr={setTypeStr}
          />

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
              {mutation.isPending ? <><Loader2 size={14} className="mr-2 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Admin confirm modal ─────────────────────────────────────────────────────

interface ConfirmFields {
  totalClients: string; delivered: string; absent: string; nonConform: string; notes: string;
}
const EMPTY_CONF: ConfirmFields = { totalClients: '', delivered: '', absent: '', nonConform: '', notes: '' };

function AdminConfirmModal({ tour, onClose, onSaved }: {
  tour: Tour; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = tour.confirmationStatus === 'CONFIRMED';
  const existing = tour.confirmation;
  const [f, setF] = useState<ConfirmFields>(
    isEdit && existing
      ? { totalClients: String(existing.totalClients), delivered: String(existing.delivered),
          absent: String(existing.absent), nonConform: String(existing.nonConform), notes: existing.notes ?? '' }
      : EMPTY_CONF,
  );
  const { error: toastError, toasts, removeToast } = useToast();

  const n = (v: string) => (v === '' ? 0 : parseInt(v, 10) || 0);
  const total = n(f.totalClients);
  const sum   = n(f.delivered) + n(f.absent) + n(f.nonConform);
  const valid = total > 0 && sum <= total;

  const mut = useMutation({
    mutationFn: (body: object) =>
      isEdit
        ? api.patch(`/tours/${tour.id}/confirm-admin`, body)
        : api.post(`/tours/${tour.id}/confirm-admin`, body),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => toastError(e.response?.data?.message || 'Erreur'),
  });

  const set = (k: keyof ConfirmFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const dateStr = new Date(tour.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck size={18} className="text-blue-600" />
              {isEdit ? 'Modifier' : 'Confirmer'} — {tour.tourCode}
            </DialogTitle>
            <p className="text-sm text-gray-500">{dateStr}</p>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <Label>Total clients <span className="text-red-500">*</span></Label>
              <Input type="number" min="0" value={f.totalClients} onChange={set('totalClients')} placeholder="0" className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-green-700">Livrés *</Label>
                <Input type="number" min="0" value={f.delivered} onChange={set('delivered')} placeholder="0" className="mt-1 border-green-200" />
              </div>
              <div>
                <Label className="text-orange-700">Absents *</Label>
                <Input type="number" min="0" value={f.absent} onChange={set('absent')} placeholder="0" className="mt-1 border-orange-200" />
              </div>
              <div>
                <Label className="text-red-700">Non-conf. *</Label>
                <Input type="number" min="0" value={f.nonConform} onChange={set('nonConform')} placeholder="0" className="mt-1 border-red-200" />
              </div>
            </div>
            {total > 0 && (
              <div className={`text-sm font-medium rounded-lg px-3 py-2 flex justify-between border ${sum <= total ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                <span>{n(f.delivered)} + {n(f.absent)} + {n(f.nonConform)} = {sum}</span>
                <span>/ Total : {total}</span>
              </div>
            )}
            <div>
              <Label>Notes (optionnel)</Label>
              <textarea value={f.notes} onChange={set('notes')} placeholder="Observations..."
                rows={2} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={() => mut.mutate({ totalClients: n(f.totalClients), delivered: n(f.delivered), absent: n(f.absent), nonConform: n(f.nonConform), notes: f.notes || undefined })}
              disabled={!valid || mut.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {mut.isPending
                ? <><Loader2 size={14} className="mr-1 animate-spin" /> Enregistrement…</>
                : isEdit ? 'Mettre à jour' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Delete confirmation dialog ──────────────────────────────────────────────

function DeleteTourDialog({ tour, onClose, onDeleted }: {
  tour: Tour; onClose: () => void; onDeleted: () => void;
}) {
  const isAssigned = ['assigned', 'notified', 'completed'].includes(tour.status);
  const { error: toastError, toasts, removeToast } = useToast();

  const dateStr = new Date(tour.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const mut = useMutation({
    mutationFn: () => api.delete(`/tours/${tour.id}`),
    onSuccess: () => { onDeleted(); onClose(); },
    onError: (e: any) => toastError(e.response?.data?.message || 'Erreur lors de la suppression'),
  });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 size={18} /> Supprimer la tournée
            </DialogTitle>
          </DialogHeader>
          {isAssigned ? (
            <div className="py-2 space-y-2">
              <p className="text-sm text-gray-700">
                Cette tournée est <strong>assignée</strong>. Désassignez-la d'abord avant de la supprimer.
              </p>
            </div>
          ) : (
            <div className="py-2 space-y-2">
              <p className="text-sm text-gray-700">
                Supprimer la tournée <strong className="font-mono">{tour.tourCode}</strong> du <strong>{dateStr}</strong> ?
              </p>
              <p className="text-xs text-red-600">Cette action est irréversible.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {isAssigned ? 'OK' : 'Annuler'}
            </Button>
            {!isAssigned && (
              <Button
                onClick={() => mut.mutate()}
                disabled={mut.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {mut.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                Supprimer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Tour row ────────────────────────────────────────────────────────────────

function TourRow({ tour, onView, onEdit, onDelete, dimmed }: { tour: Tour; onView: () => void; onEdit: () => void; onDelete: () => void; dimmed?: boolean }) {
  const asgn = tour.assignments?.[0];
  const st   = statusMap[tour.status];
  const confirmed = tour.confirmationStatus === 'CONFIRMED';
  const tb = typeBadge(tour.tourType);

  return (
    <tr
      className={`border-b last:border-0 text-sm cursor-pointer transition-colors
        ${confirmed ? 'bg-green-50/40 hover:bg-green-50/60' : 'hover:bg-gray-50'}
        ${dimmed ? 'opacity-60' : ''}`}
      onClick={onView}
    >
      {/* Tour code + manual badge */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold">{tour.tourCode}</span>
          {tour.source === 'MANUAL' && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Manuel</span>
          )}
        </div>
      </td>
      {/* Type badge */}
      <td className="px-3 py-2">
        {tb && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tb.cls}`}>{tb.label}</span>}
      </td>
      <td className="px-3 py-2 text-gray-600">{tour.platform?.name ?? '—'}</td>
      <td className="px-3 py-2 text-gray-600">{tour.quai ?? '—'}</td>
      <td className="px-3 py-2 text-gray-500 text-xs">{tour.horaire ?? '—'}</td>
      {/* Status */}
      <td className="px-3 py-2">
        <Badge className={`text-xs ${st?.cls ?? 'bg-gray-100 text-gray-700'}`}>{st?.label ?? tour.status}</Badge>
      </td>
      {/* Confirmation */}
      <td className="px-3 py-2">
        {confirmed
          ? <span className="flex items-center gap-1 text-green-700 text-xs font-medium"><CheckCircle2 size={12} /> Confirmé</span>
          : <span className="text-gray-300 text-xs flex items-center gap-1"><Clock size={12} /> —</span>}
      </td>
      <td className="px-3 py-2 text-gray-700">{asgn?.chauffeur?.name ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-3 py-2 text-gray-700">{asgn?.aide?.name ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-3 py-2 font-mono text-xs text-gray-600">{asgn?.truck?.immatriculation ?? <span className="text-gray-300">—</span>}</td>
      {/* Seen avatars */}
      <td className="px-3 py-2">
        <div className="flex gap-1">
          {asgn?.chauffeur && (
            <span title={asgn.chauffeurSeenAt ? `Vu le ${new Date(asgn.chauffeurSeenAt).toLocaleString('fr-FR')}` : 'Pas encore vu'}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold select-none
                ${asgn.chauffeurSeenAt ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'bg-gray-100 text-gray-400'}`}>
              {asgn.chauffeur.name.charAt(0).toUpperCase()}
            </span>
          )}
          {asgn?.aide && (
            <span title={asgn.aideSeenAt ? `Vu le ${new Date(asgn.aideSeenAt).toLocaleString('fr-FR')}` : 'Pas encore vu'}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold select-none
                ${asgn.aideSeenAt ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'bg-gray-100 text-gray-400'}`}>
              {asgn.aide.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button onClick={onView} className="text-xs border rounded px-2 py-1 text-gray-500 hover:bg-gray-50">
            Voir
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Modifier"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Tour card (mobile) ───────────────────────────────────────────────────────

function TourCard({ tour, onView, onEdit, onDelete }: { tour: Tour; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const asgn      = tour.assignments?.[0];
  const st        = statusMap[tour.status];
  const confirmed = tour.confirmationStatus === 'CONFIRMED';
  const tb        = typeBadge(tour.tourType);

  return (
    <div
      onClick={onView}
      className={`rounded-lg border p-3 shadow-sm cursor-pointer active:opacity-90 transition-opacity
        ${confirmed ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-mono font-bold text-sm leading-snug">{tour.tourCode}</span>
          {tour.source === 'MANUAL' && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Manuel</span>
          )}
          {tb && <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${tb.cls}`}>{tb.label}</span>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 h-7 w-7 flex items-center justify-center"
            title="Modifier"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 h-7 w-7 flex items-center justify-center"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-gray-500 leading-snug mb-1.5">
        {tour.platform?.name && <span className="font-medium text-gray-700">{tour.platform.name}</span>}
        {tour.quai   && <span>Quai {tour.quai}</span>}
        {tour.horaire && <span>{tour.horaire}</span>}
      </div>

      {asgn && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 leading-snug mb-1.5">
          {asgn.chauffeur && <span>👤 <span className="truncate max-w-[100px] inline-block align-bottom">{asgn.chauffeur.name}</span></span>}
          {asgn.aide      && <span>👤 <span className="truncate max-w-[100px] inline-block align-bottom">{asgn.aide.name}</span></span>}
          {asgn.truck     && <span>🚛 {asgn.truck.immatriculation}</span>}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {st && <Badge className={`text-[10px] px-1.5 py-0.5 h-5 ${st.cls}`}>{st.label}</Badge>}
        {confirmed
          ? <span className="flex items-center gap-0.5 text-green-700 text-[10px] font-medium"><CheckCircle2 size={10} /> Confirmé</span>
          : <span className="text-[10px] text-gray-400">Non confirmé</span>}
      </div>
    </div>
  );
}

// ─── Date group ───────────────────────────────────────────────────────────────

function DateGroup({ dateKey, tours, defaultExpanded, onView, onEdit, onDelete }: {
  dateKey: string; tours: Tour[]; defaultExpanded: boolean;
  onView: (t: Tour) => void; onEdit: (t: Tour) => void; onDelete: (t: Tour) => void;
}) {
  const [open, setOpen] = useState(defaultExpanded);

  const assigned  = tours.filter(t => t.status !== 'imported' && t.status !== 'cancelled').length;

  const label = new Date(dateKey + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday  = dateKey === todayStr;

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
          ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold capitalize truncate ${isToday ? 'text-white' : 'text-gray-800'}`}>{label}</span>
          {isToday && <span className="hidden sm:inline text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Aujourd'hui</span>}
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          <div className={`flex items-center gap-1.5 md:gap-3 text-xs md:text-sm ${isToday ? 'text-blue-100' : 'text-gray-500'}`}>
            <span className="font-medium">{tours.length}</span>
            {assigned > 0 && <span className={isToday ? 'text-blue-100' : 'text-blue-600 font-medium'}>{assigned}✓</span>}
          </div>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Rows */}
      {open && (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b">
                <tr className="text-xs text-gray-500">
                  {['Code','Type','Plateforme','Quai','Heure','Statut','Confirmation','Chauffeur','Aide','Camion','Vu',''].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tours.map(t => (
                  <TourRow key={t.id} tour={t} onView={() => onView(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="block md:hidden p-3 space-y-2">
            {tours.map(t => (
              <TourCard key={t.id} tour={t} onView={() => onView(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ tour, onClose, onEdit, onDelete, onConfirm, onRefresh }: {
  tour: Tour; onClose: () => void; onEdit: () => void; onDelete: () => void; onConfirm: () => void; onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const asgn = tour.assignments?.[0];
  const confirmed = tour.confirmationStatus === 'CONFIRMED';
  const tb = typeBadge(tour.tourType);
  const isAssigned = !!asgn && (!!asgn.chauffeur || !!asgn.aide);

  // Assignment state
  const [chauffeurId, setChauffeurId] = useState(asgn?.chauffeur?.id ?? '');
  const [aideId, setAideId] = useState(asgn?.aide?.id ?? '');
  const [truckId, setTruckId] = useState(asgn?.truck?.id ?? '');
  const [truckAutoFilled, setTruckAutoFilled] = useState(false);

  // Employees + trucks
  const { data: employees } = useQuery<{ id: string; name: string; role: string; isActive: boolean; responsibleTruckId: string | null }[]>({
    queryKey: ['employees-active'],
    queryFn: () => api.get('/employees', { params: { isActive: true } }).then(r => r.data),
  });
  const { data: trucks } = useQuery<{ id: string; immatriculation: string; isAvailable: boolean }[]>({
    queryKey: ['trucks-all'],
    queryFn: () => api.get('/trucks').then(r => r.data),
  });

  // Auto-fill truck when chauffeur is selected
  useEffect(() => {
    if (!chauffeurId) { setTruckAutoFilled(false); return; }
    const emp = employees?.find(e => e.id === chauffeurId);
    if (emp?.responsibleTruckId && !truckId) {
      setTruckId(emp.responsibleTruckId);
      setTruckAutoFilled(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chauffeurId, employees]);

  // Assigned tours same day — for conflict warnings
  const tourDateStr = tour.date.split('T')[0];
  const { data: sameDayTours } = useQuery<Tour[]>({
    queryKey: ['tours-same-day', tourDateStr],
    queryFn: async () => {
      const [a, b, c] = await Promise.all([
        api.get('/tours', { params: { date: tourDateStr, status: 'assigned', limit: 100 } }),
        api.get('/tours', { params: { date: tourDateStr, status: 'notified', limit: 100 } }),
        api.get('/tours', { params: { date: tourDateStr, status: 'completed', limit: 100 } }),
      ]);
      return [...a.data.data, ...b.data.data, ...c.data.data].filter((t: Tour) => t.id !== tour.id);
    },
    staleTime: 30000,
  });

  const chauffeurs = employees?.filter(e => e.role === 'CHAUFFEUR' || e.role === 'BOTH') ?? [];
  const aides = employees?.filter(e => e.role === 'AIDE' || e.role === 'BOTH') ?? [];

  const chauffeurConflict = chauffeurId
    ? sameDayTours?.some(t => t.assignments?.[0]?.chauffeur?.id === chauffeurId)
    : false;
  const truckConflict = truckId
    ? sameDayTours?.some(t => t.assignments?.[0]?.truck?.id === truckId)
    : false;

  const assignMutation = useMutation({
    mutationFn: () => api.patch(`/tours/${tour.id}/assignment`, {
      chauffeurId: chauffeurId || undefined,
      aideId: aideId || undefined,
      truckId: truckId || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours-active'] });
      queryClient.invalidateQueries({ queryKey: ['tours-history'] });
      queryClient.invalidateQueries({ queryKey: ['tours-same-day', tourDateStr] });
      onRefresh();
    },
  });

  const unassignMutation = useMutation({
    mutationFn: () => api.delete(`/tours/${tour.id}/assignment`),
    onSuccess: () => {
      setChauffeurId(''); setAideId(''); setTruckId('');
      queryClient.invalidateQueries({ queryKey: ['tours-active'] });
      queryClient.invalidateQueries({ queryKey: ['tours-same-day', tourDateStr] });
      onRefresh();
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 hidden md:block" onClick={onClose} />
      <div className="w-full md:w-96 bg-white h-full shadow-xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">Tournée {tour.tourCode}</h2>
            {tour.source === 'MANUAL' && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Manuel</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <DR label="Date" value={new Date(tour.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })} />
          <DR label="Plateforme" value={tour.platform?.name} />
          <DR label="Horaire" value={tour.horaire} />
          <DR label="Quai" value={tour.quai} />
          <DR label="Nb colis" value={tour.nbColis != null ? String(tour.nbColis) : undefined} />
          <DR label="Prestataire" value={tour.prestataire} />

          {tb && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Type</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tb.cls}`}>{tb.label}</span>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Statut</p>
            <Badge className={`text-xs ${statusMap[tour.status]?.cls ?? ''}`}>
              {statusMap[tour.status]?.label ?? tour.status}
            </Badge>
          </div>

          {/* ── Assignment form ──────────────────────────────────────── */}
          <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Affectation</p>

            <div className="space-y-1">
              <Label className="text-xs">Chauffeur</Label>
              <select
                value={chauffeurId}
                onChange={e => { setChauffeurId(e.target.value); setTruckAutoFilled(false); setTruckId(''); }}
                className="w-full border rounded-md px-3 py-1.5 text-sm bg-white"
              >
                <option value="">— Sélectionner —</option>
                {chauffeurs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {chauffeurConflict && (
                <p className="text-xs text-orange-600">⚠ Déjà affecté ce jour</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Aide</Label>
              <select
                value={aideId}
                onChange={e => setAideId(e.target.value)}
                className="w-full border rounded-md px-3 py-1.5 text-sm bg-white"
              >
                <option value="">— Aucun —</option>
                {aides.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                Camion
                {truckAutoFilled && <span className="text-[10px] text-blue-500 font-normal">🔁 auto</span>}
              </Label>
              <select
                value={truckId}
                onChange={e => { setTruckId(e.target.value); setTruckAutoFilled(false); }}
                className="w-full border rounded-md px-3 py-1.5 text-sm bg-white"
              >
                <option value="">— Sélectionner —</option>
                {trucks?.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.immatriculation}{!t.isAvailable && t.id !== asgn?.truck?.id ? ' (indispo)' : ''}
                  </option>
                ))}
              </select>
              {truckConflict && (
                <p className="text-xs text-orange-600">⚠ Déjà utilisé ce jour</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => assignMutation.mutate()}
                disabled={!chauffeurId || assignMutation.isPending}
                className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-2 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {assignMutation.isPending ? 'En cours…' : isAssigned ? 'Modifier' : 'Affecter'}
              </button>
              {isAssigned && (
                <button
                  onClick={() => unassignMutation.mutate()}
                  disabled={unassignMutation.isPending}
                  className="px-3 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  {unassignMutation.isPending ? '…' : 'Désaffecter'}
                </button>
              )}
            </div>
          </div>

          {/* Seen */}
          {asgn && (asgn.chauffeur || asgn.aide) && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Accusé de réception</p>
              <div className="space-y-2">
                {asgn.chauffeur && (
                  <SeenRow name={asgn.chauffeur.name} role="chauffeur" seenAt={asgn.chauffeurSeenAt} />
                )}
                {asgn.aide && (
                  <SeenRow name={asgn.aide.name} role="aide" seenAt={asgn.aideSeenAt} />
                )}
              </div>
            </div>
          )}

          {/* Delivery report */}
          <div className="border-t pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Rapport de livraison</p>
            {confirmed && tour.confirmation ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Par <strong>{tour.confirmation.confirmedBy.name}</strong> le{' '}
                  {new Date(tour.confirmation.confirmedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <SBox label="Total" value={tour.confirmation.totalClients} color="text-gray-800" bg="bg-gray-50" />
                  <SBox label="Livrés" value={tour.confirmation.delivered} color="text-green-700" bg="bg-green-50" />
                  <SBox label="Absents" value={tour.confirmation.absent} color="text-orange-700" bg="bg-orange-50" />
                  <SBox label="Non-conf." value={tour.confirmation.nonConform} color="text-red-700" bg="bg-red-50" />
                </div>
                <div className="bg-blue-50 rounded-lg px-3 py-2 flex justify-between">
                  <span className="text-sm text-blue-700 font-medium">Taux de livraison</span>
                  <span className="font-bold text-blue-700">
                    {tour.confirmation.totalClients > 0
                      ? Math.round((tour.confirmation.delivered / tour.confirmation.totalClients) * 100) : 0}%
                  </span>
                </div>
                {tour.confirmation.notes && (
                  <p className="text-xs text-gray-500 italic bg-gray-50 rounded p-2">"{tour.confirmation.notes}"</p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400">
                <Clock size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">En attente de confirmation de l'équipe</p>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t space-y-2">
          {isAssigned && (
            <button
              onClick={onConfirm}
              className={`w-full flex items-center justify-center gap-2 text-sm rounded-lg py-2 transition-colors border ${
                confirmed
                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                  : 'border-blue-200 text-blue-700 hover:bg-blue-50'
              }`}
            >
              <ClipboardCheck size={14} />
              {confirmed ? 'Modifier la confirmation' : 'Confirmer la tournée'}
            </button>
          )}
          <button
            onClick={onEdit}
            className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
          >
            <Pencil size={14} /> Modifier la tournée
          </button>
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 text-sm text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} /> Supprimer la tournée
          </button>
        </div>
      </div>
    </div>
  );
}

function DR({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-gray-900">{value}</p>
    </div>
  );
}

function SeenRow({ name, role, seenAt }: { name: string; role: string; seenAt: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${seenAt ? 'bg-green-100' : 'bg-gray-100'}`}>
        {seenAt ? <Eye size={11} className="text-green-600" /> : <EyeOff size={11} className="text-gray-400" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{name} <span className="text-xs text-gray-400 font-normal">{role}</span></p>
        {seenAt
          ? <p className="text-xs text-green-700">Vu le {new Date(seenAt).toLocaleString('fr-FR')}</p>
          : <p className="text-xs text-gray-400">En attente</p>}
      </div>
    </div>
  );
}

function SBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${bg}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type TabType = 'active' | 'history';

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export default function Tours() {
  usePageTitle('Tournées');
  const queryClient = useQueryClient();
  const { success: showSuccess, toasts, removeToast } = useToast();

  // Tabs
  const [tab, setTab] = useState<TabType>('active');

  // Filters (shared between tabs)
  const [platform, setPlatform]     = useState('');
  const [status, setStatus]         = useState('');
  const [confirmFilter, setConfirm] = useState('');
  const [search, setSearch]         = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // History pagination
  const now = new Date();
  const [histMonth, setHistMonth] = useState(now.getMonth() + 1);
  const [histYear, setHistYear]   = useState(now.getFullYear());

  // Detail + create + edit + delete + confirm
  const [detail, setDetail]             = useState<Tour | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [editingTour, setEditingTour]   = useState<Tour | null>(null);
  const [deletingTour, setDeletingTour] = useState<Tour | null>(null);
  const [confirmingTour, setConfirmingTour] = useState<Tour | null>(null);

  const handleEditDone = (newPlatform?: Platform) => {
    setEditingTour(null);
    showSuccess('Tournée modifiée');
    if (newPlatform) queryClient.invalidateQueries({ queryKey: ['platforms'] });
    queryClient.invalidateQueries({ queryKey: ['tours-active'] });
    queryClient.invalidateQueries({ queryKey: ['tours-history'] });
    if (detail) {
      api.get<Tour>(`/tours/${detail.id}`).then(r => setDetail(r.data)).catch(() => {});
    }
  };

  const handleDeleteDone = () => {
    setDeletingTour(null);
    setDetail(null);
    showSuccess('Tournée supprimée');
    queryClient.invalidateQueries({ queryKey: ['tours-active'] });
    queryClient.invalidateQueries({ queryKey: ['tours-history'] });
  };

  const handleConfirmDone = () => {
    setConfirmingTour(null);
    showSuccess('Confirmation enregistrée');
    queryClient.invalidateQueries({ queryKey: ['tours-active'] });
    queryClient.invalidateQueries({ queryKey: ['tours-history'] });
    if (detail) {
      api.get<Tour>(`/tours/${detail.id}`).then(r => setDetail(r.data)).catch(() => {});
    }
  };

  // Platforms
  const { data: platforms } = useQuery<Platform[]>({
    queryKey: ['platforms'],
    queryFn: () => api.get<Platform[]>('/platforms').then(r => r.data),
  });

  // Today/tomorrow strings (YYYY-MM-DD in UTC)
  const todayStr    = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Active tours query
  const { data: activeData, isLoading: activeLoading } = useQuery<ToursResponse>({
    queryKey: ['tours-active', platform, status, confirmFilter],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom: todayStr, limit: '500', page: '1' });
      if (platform)      p.set('platformId', platform);
      if (status)        p.set('status', status);
      if (confirmFilter) p.set('confirmationStatus', confirmFilter);
      return api.get<ToursResponse>(`/tours?${p}`).then(r => r.data);
    },
    enabled: tab === 'active',
  });

  // History tours query
  const histStart = `${histYear}-${String(histMonth).padStart(2, '0')}-01`;
  const histEnd   = new Date(histYear, histMonth, 0).toISOString().split('T')[0];
  const { data: histData, isLoading: histLoading } = useQuery<ToursResponse>({
    queryKey: ['tours-history', histYear, histMonth, platform, status, confirmFilter],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom: histStart, dateTo: histEnd, limit: '500', page: '1' });
      if (platform)      p.set('platformId', platform);
      if (status)        p.set('status', status);
      if (confirmFilter) p.set('confirmationStatus', confirmFilter);
      return api.get<ToursResponse>(`/tours?${p}`).then(r => r.data);
    },
    enabled: tab === 'history',
  });

  const rawTours = tab === 'active'
    ? (activeData?.data ?? [])
    : (histData?.data ?? []);

  const isLoading = tab === 'active' ? activeLoading : histLoading;

  // Client-side code search
  const tours = search
    ? rawTours.filter(t => t.tourCode.toLowerCase().includes(search.toLowerCase()))
    : rawTours;

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      const key = new Date(t.date).toISOString().split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const entries = Array.from(map.entries());
    // Active: ascending; History: descending
    entries.sort(([a], [b]) => tab === 'active' ? a.localeCompare(b) : b.localeCompare(a));
    return entries;
  }, [tours, tab]);

  function clearFilters() {
    setPlatform(''); setStatus(''); setConfirm(''); setSearch('');
  }

  const prevHistMonth = () => { if (histMonth === 1) { setHistMonth(12); setHistYear(y => y - 1); } else setHistMonth(m => m - 1); };
  const nextHistMonth = () => { if (histMonth === 12) { setHistMonth(1); setHistYear(y => y + 1); } else setHistMonth(m => m + 1); };

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Tournées</h1>
        {/* Wrap all buttons in one relative container so the popup anchors to the right edge */}
        <div ref={filterRef} className="relative flex items-center gap-2">
          {(() => {
            const activeCount = [platform, status, confirmFilter, search].filter(Boolean).length;
            return (
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={`relative h-9 w-9 flex items-center justify-center rounded-lg border text-gray-600 transition-colors ${filterOpen ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                title="Filtres"
              >
                <SlidersHorizontal size={16} />
                {activeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {activeCount}
                  </span>
                )}
              </button>
            );
          })()}

          <SyncButton />
          <Button onClick={() => setCreateOpen(true)} size="sm" className="flex items-center gap-1.5 h-9 md:h-10">
            <Plus size={15} /> <span className="hidden sm:inline">Nouvelle</span> tournée
          </Button>

          {filterOpen && (
            <div className="absolute right-0 top-11 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filtres</p>
              <select
                className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={platform} onChange={e => setPlatform(e.target.value)}
              >
                <option value="">Toutes les plateformes</option>
                {(platforms ?? []).map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
              <select
                className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={status} onChange={e => setStatus(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select
                className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={confirmFilter} onChange={e => setConfirm(e.target.value)}
              >
                <option value="">Toutes confirmations</option>
                <option value="CONFIRMED">Confirmé</option>
                <option value="UNCONFIRMED">En attente</option>
              </select>
              <input
                placeholder="Rechercher par code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {(platform || status || confirmFilter || search) && (
                <button
                  onClick={() => { clearFilters(); setFilterOpen(false); }}
                  className="w-full h-8 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                >
                  <X size={12} /> Effacer les filtres
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['active', 'Tournées actives'], ['history', 'Historique']] as [TabType, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* History month navigator */}
      {tab === 'history' && (
        <div className="flex items-center gap-2">
          <button onClick={prevHistMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
          <span className="font-semibold text-gray-700 w-36 text-center">{MONTH_NAMES[histMonth - 1]} {histYear}</span>
          <button onClick={nextHistMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <p className="font-medium">Aucune tournée trouvée</p>
          <p className="text-sm mt-1">Ajustez les filtres ou importez un fichier</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, dateTours]) => (
            <DateGroup
              key={dateKey}
              dateKey={dateKey}
              tours={dateTours}
              defaultExpanded={tab === 'active' && (dateKey === todayStr || dateKey === tomorrowStr)}
              onView={setDetail}
              onEdit={setEditingTour}
              onDelete={setDeletingTour}
            />
          ))}
        </div>
      )}

      {/* ── Detail panel ───────────────────────────────────────────────── */}
      {detail && (
        <DetailPanel
          tour={detail}
          onClose={() => setDetail(null)}
          onEdit={() => setEditingTour(detail)}
          onDelete={() => setDeletingTour(detail)}
          onConfirm={() => setConfirmingTour(detail)}
          onRefresh={() => api.get<Tour>(`/tours/${detail.id}`).then(r => setDetail(r.data)).catch(() => {})}
        />
      )}

      {/* ── Admin confirm modal ─────────────────────────────────────────── */}
      {confirmingTour && (
        <AdminConfirmModal
          tour={confirmingTour}
          onClose={() => setConfirmingTour(null)}
          onSaved={handleConfirmDone}
        />
      )}

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      {deletingTour && (
        <DeleteTourDialog
          tour={deletingTour}
          onClose={() => setDeletingTour(null)}
          onDeleted={handleDeleteDone}
        />
      )}

      {/* ── Create modal ───────────────────────────────────────────────── */}
      <CreateTourModal
        open={createOpen}
        platforms={platforms ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={(newPlatform) => {
          if (newPlatform) queryClient.invalidateQueries({ queryKey: ['platforms'] });
          queryClient.invalidateQueries({ queryKey: ['tours-active'] });
          queryClient.invalidateQueries({ queryKey: ['tours-history'] });
        }}
      />

      {/* ── Edit modal ─────────────────────────────────────────────────── */}
      {editingTour && (
        <EditTourModal
          tour={editingTour}
          platforms={platforms ?? []}
          onClose={() => setEditingTour(null)}
          onSaved={handleEditDone}
        />
      )}
    </div>
  );
}
