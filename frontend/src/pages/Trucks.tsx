import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Truck as TruckIcon, History, Wrench, Loader2,
  ClipboardCheck, CheckCircle2, AlertTriangle, User,
  EllipsisVertical, ChevronRight,
} from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
}

interface Truck {
  id: string;
  immatriculation: string;
  isAvailable: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  responsibleEmployee: { id: string; firstName: string | null; lastName: string | null; name: string } | null;
}

interface TruckFormData {
  immatriculation: string;
  notes: string;
  isAvailable: boolean;
}

interface AssignmentHistory {
  id: string;
  tourCode: string;
  date: string;
  chauffeurName: string | null;
  aideName: string | null;
  action: 'assigned' | 'unassigned';
}

interface RepairLog {
  id: string;
  date: string;
  type: string;
  description: string;
  cost: number | null;
  createdBy: { email: string } | null;
}

interface TruckHistory {
  assignments: AssignmentHistory[];
  repairs: RepairLog[];
}

interface InspectionItem {
  id: string;
  item: string;
  status: 'OK' | 'PROBLEME';
  comment: string | null;
}

interface Inspection {
  id: string;
  scheduledDate: string;
  submittedAt: string | null;
  status: 'PENDING' | 'SUBMITTED' | 'ACKNOWLEDGED';
  assignedTo: { id: string; name: string };
  items: InspectionItem[];
  photos: string[];
  generalComment: string | null;
  acknowledgedBy: { email: string } | null;
  acknowledgedAt: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const REPAIR_TYPES = [
  { value: 'OIL_CHANGE', label: 'Vidange' },
  { value: 'REPAIR', label: 'Réparation' },
  { value: 'BREAKDOWN', label: 'Panne' },
  { value: 'INSPECTION', label: 'Contrôle' },
  { value: 'OTHER', label: 'Autre' },
] as const;

const REPAIR_TYPE_COLORS: Record<string, string> = {
  OIL_CHANGE: 'bg-blue-100 text-blue-800',
  REPAIR: 'bg-orange-100 text-orange-800',
  BREAKDOWN: 'bg-red-100 text-red-800',
  INSPECTION: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-gray-100 text-gray-700',
};

const ITEM_LABELS: Record<string, string> = {
  HUILE: "Niveau d'huile",
  RADIATEUR: 'Eau du radiateur',
  CAISSE_OUTILS: 'Caisse à outils',
  CHARIOT: 'Chariot',
  ROULETTES: 'Roulettes',
  COUVERCLE: 'Couvercle de produit',
};

const INSPECTION_STATUS = {
  PENDING:      { label: 'En attente',  cls: 'bg-yellow-100 text-yellow-800' },
  SUBMITTED:    { label: 'Soumis',      cls: 'bg-blue-100 text-blue-800' },
  ACKNOWLEDGED: { label: 'Validé',      cls: 'bg-green-100 text-green-800' },
} as const;

const empty: TruckFormData = { immatriculation: '', notes: '', isAvailable: true };
const emptyRepair = { date: new Date().toISOString().split('T')[0], type: 'REPAIR', description: '', cost: '' };

// ── Component ──────────────────────────────────────────────────────────────────

export default function Trucks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toasts, removeToast, success, error: showError } = useToast();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

  // Truck CRUD state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [form, setForm] = useState<TruckFormData>(empty);
  const [formError, setFormError] = useState('');
  const [pendingResponsible, setPendingResponsible] = useState<string>('none');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // History panel state
  const [historyTruckId, setHistoryTruckId] = useState<string | null>(null);
  const [repairForm, setRepairForm] = useState(emptyRepair);
  const [repairError, setRepairError] = useState('');
  const [expandedInspection, setExpandedInspection] = useState<string | null>(null);
  const [requestingInspection, setRequestingInspection] = useState(false);
  const [inspectionError, setInspectionError] = useState('');
  const [requestingInspectionForTruckId, setRequestingInspectionForTruckId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: trucks, isLoading } = useQuery<Truck[]>({
    queryKey: ['trucks'],
    queryFn: async () => (await api.get<Truck[]>('/trucks')).data,
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['employees-active'],
    queryFn: async () => (await api.get<Employee[]>('/employees', { params: { isActive: true } })).data,
  });

  const { data: history, isLoading: historyLoading } = useQuery<TruckHistory>({
    queryKey: ['truck-history', historyTruckId],
    queryFn: async () => (await api.get<TruckHistory>(`/trucks/${historyTruckId}/history`)).data,
    enabled: !!historyTruckId,
  });

  const { data: inspections, isLoading: inspectionsLoading, refetch: refetchInspections } = useQuery<Inspection[]>({
    queryKey: ['truck-inspections', historyTruckId],
    queryFn: async () => (await api.get<Inspection[]>(`/trucks/${historyTruckId}/inspections`)).data,
    enabled: !!historyTruckId,
    refetchOnMount: 'always',   // always re-fetch when the panel opens
    staleTime: 0,               // never serve cached data
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: TruckFormData) => api.post('/trucks', {
      immatriculation: data.immatriculation.trim().toUpperCase(),
      notes: data.notes.trim() || undefined,
      isAvailable: data.isAvailable,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trucks'] }); closeDialog(); },
    onError: (err: any) => setFormError(err?.response?.data?.message || 'Erreur création'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TruckFormData }) =>
      api.patch(`/trucks/${id}`, {
        immatriculation: data.immatriculation.trim().toUpperCase(),
        notes: data.notes.trim() || undefined,
        isAvailable: data.isAvailable,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trucks'] }); closeDialog(); },
    onError: (err: any) => setFormError(err?.response?.data?.message || 'Erreur mise à jour'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/trucks/${id}`, { isAvailable }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trucks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/trucks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trucks'] }); setDeleteId(null); },
    onError: (err: any) => { alert(err?.response?.data?.message || 'Erreur suppression'); setDeleteId(null); },
  });

  const responsibleMutation = useMutation({
    mutationFn: async ({ truckId, employeeId }: { truckId: string; employeeId: string | null }) =>
      api.patch(`/trucks/${truckId}/responsible`, { employeeId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trucks'] }),
    onError: (err: any) => alert(err?.response?.data?.message || 'Erreur assignation'),
  });

  const addRepairMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof repairForm }) =>
      api.post(`/trucks/${id}/repair-logs`, {
        date: data.date,
        type: data.type,
        description: data.description,
        cost: data.cost ? parseFloat(data.cost) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-history', historyTruckId] });
      setRepairForm(emptyRepair);
      setRepairError('');
    },
    onError: (err: any) => setRepairError(err?.response?.data?.message || 'Erreur'),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (inspectionId: string) =>
      api.post(`/inspections/${inspectionId}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['truck-inspections', historyTruckId] }),
    onError: (err: any) => alert(err?.response?.data?.message || 'Erreur validation'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingTruck(null);
    setForm(empty);
    setPendingResponsible('none');
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (truck: Truck) => {
    setEditingTruck(truck);
    setForm({ immatriculation: truck.immatriculation, notes: truck.notes ?? '', isAvailable: truck.isAvailable });
    setPendingResponsible(truck.responsibleEmployee?.id ?? 'none');
    setFormError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTruck(null);
    setForm(empty);
    setPendingResponsible('none');
    setFormError('');
  };

  const handleSubmit = async () => {
    if (!form.immatriculation.trim()) { setFormError('Immatriculation requise'); return; }
    setFormError('');
    if (editingTruck) {
      await updateMutation.mutateAsync({ id: editingTruck.id, data: form });
      // Update responsible if changed
      const currentResponsible = editingTruck.responsibleEmployee?.id ?? null;
      const newResponsible = pendingResponsible === 'none' ? null : pendingResponsible;
      if (currentResponsible !== newResponsible) {
        responsibleMutation.mutate({ truckId: editingTruck.id, employeeId: newResponsible });
      }
    } else {
      const res = await createMutation.mutateAsync(form);
      // If responsible set, assign after creation
      if (pendingResponsible !== 'none') {
        const truckId = (res.data as any)?.id;
        if (truckId) responsibleMutation.mutate({ truckId, employeeId: pendingResponsible });
      }
    }
  };

  const requestInspection = async () => {
    if (!historyTruckId) return;
    setInspectionError('');
    if (!historyTruck?.responsibleEmployee) {
      setInspectionError(
        "Aucun chauffeur responsable assigné à ce camion. Assignez un chauffeur responsable d'abord.",
      );
      return;
    }
    setRequestingInspection(true);
    try {
      await api.post(`/trucks/${historyTruckId}/inspections`, {});
      queryClient.invalidateQueries({ queryKey: ['truck-inspections', historyTruckId] });
      success(`Contrôle demandé — ${historyTruck.responsibleEmployee.name} a été notifié`);
    } catch (err: any) {
      setInspectionError(err?.response?.data?.message || 'Erreur lors de la demande de contrôle.');
    } finally {
      setRequestingInspection(false);
    }
  };

  const requestInspectionFromRow = async (truck: Truck) => {
    if (!truck.responsibleEmployee) {
      showError("Aucun chauffeur responsable assigné à ce camion.");
      return;
    }
    setRequestingInspectionForTruckId(truck.id);
    try {
      await api.post(`/trucks/${truck.id}/inspections`, {});
      success(`Contrôle demandé — ${truck.responsibleEmployee.name} a été notifié`);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Erreur lors de la demande de contrôle.');
    } finally {
      setRequestingInspectionForTruckId(null);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const available = trucks?.filter((t) => t.isAvailable).length ?? 0;
  const unavailable = trucks?.filter((t) => !t.isAvailable).length ?? 0;
  const historyTruck = trucks?.find((t) => t.id === historyTruckId);
  const chauffeurs = employees?.filter((e) => e.role === 'CHAUFFEUR' || e.role === 'BOTH') ?? [];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Camions</h1>
        <Button onClick={openCreate} size="sm" className="h-9"><Plus className="h-4 w-4 mr-1.5" />Ajouter</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: 'Total', shortLabel: 'Total', value: trucks?.length ?? '-', icon: <TruckIcon className="h-5 w-5 text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Disponibles', shortLabel: 'Dispo.', value: available, icon: <ToggleRight className="h-5 w-5 text-green-600" />, bg: 'bg-green-50' },
          { label: 'Indisponibles', shortLabel: 'Indispo.', value: unavailable, icon: <ToggleLeft className="h-5 w-5 text-red-500" />, bg: 'bg-red-50' },
        ].map((c) => (
          <div key={c.label} className="bg-white border rounded-lg p-3 md:p-4 flex items-center gap-2 md:gap-3">
            <div className={`p-2 ${c.bg} rounded-md flex-shrink-0`}>{c.icon}</div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-500 truncate hidden md:block">{c.label}</p>
              <p className="text-xs md:text-sm text-gray-500 truncate block md:hidden">{c.shortLabel}</p>
              <p className="text-xl md:text-2xl font-bold">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop table ───────────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white border rounded-lg">
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !trucks?.length ? (
          <div className="p-16 text-center">
            <TruckIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucun camion</p>
            <Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Immatriculation', 'Statut', 'Chauffeur responsable', 'Notes', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => (
                <tr key={truck.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => { setHistoryTruckId(truck.id); setInspectionError(''); }}>
                  <td className="px-4 py-3 font-semibold">{truck.immatriculation}</td>
                  <td className="px-4 py-3">
                    <Badge className={truck.status === 'in_repair' ? 'bg-orange-100 text-orange-800' : truck.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {truck.status === 'in_repair' ? 'En réparation' : truck.isAvailable ? 'Disponible' : 'Indisponible'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {truck.responsibleEmployee ? <div className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-blue-500" /><span>{truck.responsibleEmployee.name}</span></div> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{truck.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); { setHistoryTruckId(truck.id); setInspectionError(''); } }}><EllipsisVertical className="h-4 w-4 text-gray-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mobile cards ────────────────────────────────────────────────────────── */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : !trucks?.length ? (
          <div className="py-12 text-center text-gray-400">
            <TruckIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Aucun camion</p>
            <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
          </div>
        ) : (
          trucks.map((truck) => (
            <div key={truck.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => { setHistoryTruckId(truck.id); setInspectionError(''); }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold font-mono text-sm">{truck.immatriculation}</span>
                    <Badge className={`text-[10px] h-5 px-1.5 flex-shrink-0 ${truck.status === 'in_repair' ? 'bg-orange-100 text-orange-800' : truck.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {truck.status === 'in_repair' ? 'En réparation' : truck.isAvailable ? 'Disponible' : 'Indisponible'}
                    </Badge>
                  </div>
                  {truck.responsibleEmployee && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 leading-snug">
                      <User className="h-3 w-3 text-blue-400 flex-shrink-0" /><span className="truncate">{truck.responsibleEmployee.name}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTruck ? 'Modifier le camion' : 'Ajouter un camion'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="immatriculation">Immatriculation <span className="text-red-500">*</span></Label>
              <Input id="immatriculation" placeholder="AB-123-CD"
                value={form.immatriculation}
                onChange={(e) => setForm({ ...form, immatriculation: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Input id="notes" placeholder="Réservé pour plateforme X..."
                value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Chauffeur responsable</Label>
              <Select value={pendingResponsible} onValueChange={setPendingResponsible}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {chauffeurs.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.isAvailable ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.isAvailable ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}>
                {form.isAvailable ? 'Disponible' : 'Indisponible'}
              </Label>
            </div>
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Enregistrement...' : editingTruck ? 'Sauvegarder' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer le camion</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Êtes-vous sûr ? Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteMutation.isPending}>Annuler</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History Side Panel ────────────────────────────────────────────────── */}
      <Sheet open={!!historyTruckId} onOpenChange={(open) => {
        if (!open) {
          setHistoryTruckId(null);
          setRepairForm(emptyRepair);
          setRepairError('');
          setExpandedInspection(null);
          setInspectionError('');
        }
      }}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          <div className="mb-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold">{historyTruck?.immatriculation}</h2>
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                <Badge className={historyTruck?.status === 'in_repair' ? 'bg-orange-100 text-orange-800' : historyTruck?.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                  {historyTruck?.status === 'in_repair' ? 'En réparation' : historyTruck?.isAvailable ? 'Disponible' : 'Indisponible'}
                </Badge>
              </p>
              {historyTruck?.responsibleEmployee && (
                <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-blue-500" />Chauffeur: {historyTruck.responsibleEmployee.name}
                </p>
              )}
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button size="sm" variant="outline" onClick={() => openEdit(historyTruck!)} className="flex items-center justify-center gap-1.5">
                  <Pencil className="h-4 w-4" />Modifier
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExpandedInspection(null)} className="flex items-center justify-center gap-1.5" disabled={isLoading}>
                  <History className="h-4 w-4" />Historique
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={requestInspection} disabled={requestingInspection} className="flex items-center justify-center gap-1.5">
                    {requestingInspection ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                    Contrôle
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => historyTruck && toggleMutation.mutate({ id: historyTruck.id, isAvailable: !historyTruck.isAvailable })} disabled={toggleMutation.isPending} className="flex items-center justify-center gap-1.5">
                  {toggleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ToggleRight className="h-4 w-4" />}
                  Disponibilité
                </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="assignments">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="assignments" className="flex-1">
                Tournées {history && `(${history.assignments.length})`}
              </TabsTrigger>
              <TabsTrigger value="repairs" className="flex-1">
                Réparations {history && `(${history.repairs.length})`}
              </TabsTrigger>
              <TabsTrigger value="inspections" className="flex-1">
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                Contrôles {inspections && `(${inspections.length})`}
              </TabsTrigger>
            </TabsList>

            {/* ── Assignment History ──────────────────────────────────────────── */}
            <TabsContent value="assignments">
              {historyLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !history?.assignments.length ? (
                <div className="text-center py-12 text-gray-400">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Aucun historique</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {['Date', 'Tournée', 'Chauffeur', 'Aide', 'Action'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.assignments.map((h) => (
                        <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 font-semibold">{h.tourCode}</td>
                          <td className="px-3 py-2">{h.chauffeurName ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2">{h.aideName ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2">
                            <Badge className={h.action === 'assigned' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                              {h.action}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Repair Log ────────────────────────────────────────────────────── */}
            <TabsContent value="repairs">
              <div className="border rounded-lg p-4 mb-5 space-y-3 bg-gray-50">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Wrench className="h-4 w-4 text-gray-500" />Ajouter une entrée</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="r-date">Date</Label>
                    <Input id="r-date" type="date" value={repairForm.date}
                      onChange={(e) => setRepairForm({ ...repairForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-type">Type</Label>
                    <Select value={repairForm.type} onValueChange={(v) => setRepairForm({ ...repairForm, type: v })}>
                      <SelectTrigger id="r-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REPAIR_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-desc">Description <span className="text-red-500">*</span></Label>
                  <textarea id="r-desc" rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={repairForm.description} onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })} />
                </div>
                <Input type="number" min="0" step="0.01" placeholder="Coût (€)"
                  value={repairForm.cost} onChange={(e) => setRepairForm({ ...repairForm, cost: e.target.value })} />
                {repairError && <p className="text-sm text-red-600">{repairError}</p>}
                <Button size="sm" disabled={!repairForm.description.trim() || addRepairMutation.isPending}
                  onClick={() => historyTruckId && addRepairMutation.mutate({ id: historyTruckId, data: repairForm })}>
                  {addRepairMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ajout...</> : <><Wrench className="h-4 w-4 mr-2" />Ajouter</>}
                </Button>
              </div>
              {historyLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : !history?.repairs.length ? (
                <div className="text-center py-10 text-gray-400"><Wrench className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Aucune réparation</p></div>
              ) : (
                <div className="space-y-3">
                  {history.repairs.map((r) => (
                    <div key={r.id} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={REPAIR_TYPE_COLORS[r.type] ?? 'bg-gray-100 text-gray-700'}>
                            {REPAIR_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        </div>
                        {r.cost != null && <span className="text-sm font-semibold text-gray-700">{r.cost.toFixed(2)} €</span>}
                      </div>
                      <p className="text-sm text-gray-800">{r.description}</p>
                      {r.createdBy && <p className="text-xs text-gray-400 mt-1">Ajouté par {r.createdBy.email}</p>}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Inspections tab ───────────────────────────────────────────────── */}
            <TabsContent value="inspections">
              {isAdmin && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => refetchInspections()}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Actualiser
                    </button>
                    <Button size="sm" onClick={requestInspection} disabled={requestingInspection}>
                      {requestingInspection
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Demande en cours...</>
                        : <><ClipboardCheck className="h-4 w-4 mr-2" />Demander un contrôle</>}
                    </Button>
                  </div>
                  {inspectionError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {inspectionError}
                    </p>
                  )}
                </div>
              )}

              {inspectionsLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : !inspections?.length ? (
                <div className="text-center py-12 text-gray-400">
                  <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Aucun contrôle pour ce camion</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inspections.map((insp) => {
                    const st = INSPECTION_STATUS[insp.status];
                    const isExpanded = expandedInspection === insp.id;
                    const hasProblems = insp.items.some((i) => i.status === 'PROBLEME');
                    return (
                      <div key={insp.id} className={`border rounded-lg overflow-hidden ${hasProblems && insp.status === 'SUBMITTED' ? 'border-red-200' : ''}`}>
                        <div className="p-4 bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className={st.cls}>{st.label}</Badge>
                                {hasProblems && <Badge className="bg-red-100 text-red-700">⚠️ Problème(s)</Badge>}
                              </div>
                              <p className="text-sm font-medium">
                                Prévu le {new Date(insp.scheduledDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </p>
                              <p className="text-xs text-gray-500">Assigné à : {insp.assignedTo.name}</p>
                              {insp.submittedAt && (
                                <p className="text-xs text-gray-500">
                                  Soumis le {new Date(insp.submittedAt).toLocaleDateString('fr-FR')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {insp.status === 'SUBMITTED' && isAdmin && (
                                <Button size="sm" variant="outline"
                                  className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => acknowledgeMutation.mutate(insp.id)}
                                  disabled={acknowledgeMutation.isPending}>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />Valider
                                </Button>
                              )}
                              {insp.status !== 'PENDING' && (
                                <button className="text-xs text-blue-600 hover:underline"
                                  onClick={() => setExpandedInspection(isExpanded ? null : insp.id)}>
                                  {isExpanded ? 'Masquer' : 'Voir détails'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && insp.items.length > 0 && (
                          <div className="border-t bg-gray-50 p-4 space-y-3">
                            <table className="w-full text-sm">
                              <tbody className="divide-y">
                                {insp.items.map((item) => (
                                  <tr key={item.id} className={item.status === 'PROBLEME' ? 'bg-red-50' : ''}>
                                    <td className="py-2 font-medium w-1/3">{ITEM_LABELS[item.item] ?? item.item}</td>
                                    <td className="py-2 w-24">
                                      {item.status === 'OK'
                                        ? <span className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>
                                        : <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Problème</span>}
                                    </td>
                                    <td className="py-2 text-gray-600 text-xs">{item.comment ?? ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {insp.generalComment && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-sm text-gray-700">
                                <span className="font-medium">Commentaire général : </span>{insp.generalComment}
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-2">
                                Photos ({insp.photos.length})
                              </p>
                              {insp.photos.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {insp.photos.map((p, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setLightboxSrc(`${API_URL}/${p}`)}
                                      className="focus:outline-none"
                                      title="Cliquer pour agrandir"
                                    >
                                      <img
                                        src={`${API_URL}/${p}`}
                                        alt={`photo-${i + 1}`}
                                        className="h-16 w-16 object-cover rounded border hover:opacity-75 transition-opacity"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">Aucune photo</p>
                              )}
                            </div>
                            {insp.acknowledgedBy && (
                              <p className="text-xs text-gray-400">
                                Validé le {new Date(insp.acknowledgedAt!).toLocaleDateString('fr-FR')} par {insp.acknowledgedBy.email}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Delete link at bottom */}
          <div className="mt-8 border-t pt-4">
            <button
              type="button"
              onClick={() => { setHistoryTruckId(null); setDeleteId(historyTruck?.id ?? null); }}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Supprimer ce camion
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Photo lightbox ────────────────────────────────────────────────────── */}
      {lightboxSrc && (
        <Dialog open onOpenChange={(open) => !open && setLightboxSrc(null)}>
          <DialogContent className="max-w-3xl p-2">
            <img
              src={lightboxSrc}
              alt="Photo inspection"
              className="w-full max-h-[80vh] object-contain rounded"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
