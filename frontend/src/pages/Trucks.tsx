import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Truck as TruckIcon,
  History,
  Wrench,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Truck {
  id: string;
  immatriculation: string;
  isAvailable: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface TruckFormData {
  immatriculation: string;
  notes: string;
  isAvailable: boolean;
}

interface AssignmentHistory {
  id: string;
  tourId: string;
  tourCode: string;
  date: string;
  chauffeurName: string | null;
  aideName: string | null;
  action: 'assigned' | 'unassigned';
  createdAt: string;
}

interface RepairLog {
  id: string;
  date: string;
  type: string;
  description: string;
  cost: number | null;
  createdAt: string;
  createdBy: { id: string; email: string } | null;
}

interface TruckHistory {
  assignments: AssignmentHistory[];
  repairs: RepairLog[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const REPAIR_TYPES = [
  { value: 'OIL_CHANGE', label: 'Oil Change' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'BREAKDOWN', label: 'Breakdown' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'OTHER', label: 'Other' },
] as const;

const REPAIR_TYPE_COLORS: Record<string, string> = {
  OIL_CHANGE: 'bg-blue-100 text-blue-800',
  REPAIR: 'bg-orange-100 text-orange-800',
  BREAKDOWN: 'bg-red-100 text-red-800',
  INSPECTION: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-gray-100 text-gray-700',
};

const empty: TruckFormData = { immatriculation: '', notes: '', isAvailable: true };
const emptyRepair = {
  date: new Date().toISOString().split('T')[0],
  type: 'REPAIR',
  description: '',
  cost: '',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function Trucks() {
  const queryClient = useQueryClient();

  // Truck CRUD state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [form, setForm] = useState<TruckFormData>(empty);
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // History panel state
  const [historyTruckId, setHistoryTruckId] = useState<string | null>(null);
  const [repairForm, setRepairForm] = useState(emptyRepair);
  const [repairError, setRepairError] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: trucks, isLoading } = useQuery<Truck[]>({
    queryKey: ['trucks'],
    queryFn: async () => (await api.get<Truck[]>('/trucks')).data,
  });

  const { data: history, isLoading: historyLoading } = useQuery<TruckHistory>({
    queryKey: ['truck-history', historyTruckId],
    queryFn: async () =>
      (await api.get<TruckHistory>(`/trucks/${historyTruckId}/history`)).data,
    enabled: !!historyTruckId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: TruckFormData) => {
      await api.post('/trucks', {
        immatriculation: data.immatriculation.trim().toUpperCase(),
        notes: data.notes.trim() || undefined,
        isAvailable: data.isAvailable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trucks-available'] });
      closeDialog();
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message || 'Failed to create truck'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TruckFormData }) => {
      await api.patch(`/trucks/${id}`, {
        immatriculation: data.immatriculation.trim().toUpperCase(),
        notes: data.notes.trim() || undefined,
        isAvailable: data.isAvailable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trucks-available'] });
      closeDialog();
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message || 'Failed to update truck'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      await api.patch(`/trucks/${id}`, { isAvailable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trucks-available'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trucks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trucks-available'] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Failed to delete truck');
      setDeleteId(null);
    },
  });

  const addRepairMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof repairForm }) => {
      await api.post(`/trucks/${id}/repair-logs`, {
        date: data.date,
        type: data.type,
        description: data.description,
        cost: data.cost ? parseFloat(data.cost) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-history', historyTruckId] });
      setRepairForm(emptyRepair);
      setRepairError('');
    },
    onError: (err: any) =>
      setRepairError(err?.response?.data?.message || 'Failed to add repair log'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingTruck(null);
    setForm(empty);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (truck: Truck) => {
    setEditingTruck(truck);
    setForm({ immatriculation: truck.immatriculation, notes: truck.notes ?? '', isAvailable: truck.isAvailable });
    setFormError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTruck(null);
    setForm(empty);
    setFormError('');
  };

  const handleSubmit = () => {
    if (!form.immatriculation.trim()) { setFormError('Immatriculation is required'); return; }
    setFormError('');
    if (editingTruck) {
      updateMutation.mutate({ id: editingTruck.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const available = trucks?.filter((t) => t.isAvailable).length ?? 0;
  const unavailable = trucks?.filter((t) => !t.isAvailable).length ?? 0;
  const historyTruck = trucks?.find((t) => t.id === historyTruckId);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trucks</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Truck
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md">
            <TruckIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold">{trucks?.length ?? '-'}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-md">
            <ToggleRight className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Available</p>
            <p className="text-2xl font-bold text-green-600">{available}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-md">
            <ToggleLeft className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Unavailable</p>
            <p className="text-2xl font-bold text-red-500">{unavailable}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !trucks || trucks.length === 0 ? (
          <div className="p-16 text-center">
            <TruckIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No trucks yet</p>
            <p className="text-gray-400 text-sm mt-1">Add your first truck to get started</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Truck
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Immatriculation</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Notes</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Added</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => (
                <tr key={truck.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{truck.immatriculation}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        truck.status === 'in_repair'
                          ? 'bg-orange-100 text-orange-800'
                          : truck.isAvailable
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {truck.status === 'in_repair'
                        ? 'In Repair'
                        : truck.isAvailable
                        ? 'Available'
                        : 'Unavailable'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{truck.notes || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(truck.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Toggle availability */}
                      <Button
                        variant="ghost"
                        size="sm"
                        title={truck.isAvailable ? 'Mark unavailable' : 'Mark available'}
                        onClick={() => toggleMutation.mutate({ id: truck.id, isAvailable: !truck.isAvailable })}
                        disabled={toggleMutation.isPending}
                      >
                        {truck.isAvailable ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                      {/* Edit */}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(truck)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {/* History */}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View history"
                        onClick={() => setHistoryTruckId(truck.id)}
                      >
                        <History className="h-4 w-4 text-indigo-500" />
                      </Button>
                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteId(truck.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTruck ? 'Edit Truck' : 'Add Truck'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="immatriculation">
                Immatriculation <span className="text-red-500">*</span>
              </Label>
              <Input
                id="immatriculation"
                placeholder="AB-123-CD"
                value={form.immatriculation}
                onChange={(e) => setForm({ ...form, immatriculation: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g. needs service, reserved for platform..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  form.isAvailable ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    form.isAvailable ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <Label
                className="cursor-pointer"
                onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
              >
                {form.isAvailable ? 'Available' : 'Unavailable'}
              </Label>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Saving...' : editingTruck ? 'Save Changes' : 'Add Truck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Truck</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete this truck? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History Side Panel ────────────────────────────────────────────────── */}
      <Sheet
        open={!!historyTruckId}
        onOpenChange={(open) => {
          if (!open) { setHistoryTruckId(null); setRepairForm(emptyRepair); setRepairError(''); }
        }}
      >
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-500" />
              {historyTruck?.immatriculation} — History
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="assignments">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="assignments" className="flex-1">
                Assignment History
                {history && ` (${history.assignments.length})`}
              </TabsTrigger>
              <TabsTrigger value="repairs" className="flex-1">
                Repair Log
                {history && ` (${history.repairs.length})`}
              </TabsTrigger>
            </TabsList>

            {/* ── Assignment History tab ──────────────────────────────────────── */}
            <TabsContent value="assignments">
              {historyLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !history?.assignments.length ? (
                <div className="text-center py-12 text-gray-400">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No assignment history yet</p>
                  <p className="text-xs mt-1">History is recorded automatically when tours are assigned.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Tour</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Chauffeur</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Aide</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.assignments.map((h) => (
                        <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {new Date(h.date).toLocaleDateString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: '2-digit',
                            })}
                          </td>
                          <td className="px-3 py-2 font-semibold">{h.tourCode}</td>
                          <td className="px-3 py-2">{h.chauffeurName ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2">{h.aideName ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2">
                            <Badge
                              className={
                                h.action === 'assigned'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-600'
                              }
                            >
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

            {/* ── Repair Log tab ───────────────────────────────────────────────── */}
            <TabsContent value="repairs">
              {/* Add new repair form */}
              <div className="border rounded-lg p-4 mb-5 space-y-3 bg-gray-50">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-gray-500" />
                  Add Repair Entry
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="r-date">Date</Label>
                    <Input
                      id="r-date"
                      type="date"
                      value={repairForm.date}
                      onChange={(e) => setRepairForm({ ...repairForm, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-type">Type</Label>
                    <Select
                      value={repairForm.type}
                      onValueChange={(v) => setRepairForm({ ...repairForm, type: v })}
                    >
                      <SelectTrigger id="r-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPAIR_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-desc">Description <span className="text-red-500">*</span></Label>
                  <textarea
                    id="r-desc"
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Describe the work done..."
                    value={repairForm.description}
                    onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-cost">Cost (€, optional)</Label>
                  <Input
                    id="r-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={repairForm.cost}
                    onChange={(e) => setRepairForm({ ...repairForm, cost: e.target.value })}
                  />
                </div>
                {repairError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {repairError}
                  </p>
                )}
                <Button
                  size="sm"
                  disabled={!repairForm.description.trim() || addRepairMutation.isPending}
                  onClick={() => {
                    if (!historyTruckId || !repairForm.description.trim()) return;
                    addRepairMutation.mutate({ id: historyTruckId, data: repairForm });
                  }}
                >
                  {addRepairMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
                  ) : (
                    <><Wrench className="h-4 w-4 mr-2" />Add Entry</>
                  )}
                </Button>
              </div>

              {/* Existing repairs */}
              {historyLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : !history?.repairs.length ? (
                <div className="text-center py-10 text-gray-400">
                  <Wrench className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No repair logs yet</p>
                </div>
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
                            {new Date(r.date).toLocaleDateString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                            })}
                          </span>
                        </div>
                        {r.cost != null && (
                          <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                            {r.cost.toFixed(2)} €
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{r.description}</p>
                      {r.createdBy && (
                        <p className="text-xs text-gray-400 mt-1">Added by {r.createdBy.email}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
