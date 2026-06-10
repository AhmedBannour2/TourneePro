import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Plus, Zap, Users, Camera, X, ChevronDown,
  CheckCircle2, Loader2, Upload, Eye, UserCheck, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type ExpressType = 'STANDARD' | 'GV';
type ExpressStatus = 'PENDING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';

interface ExpressEmployee {
  id: string; name: string; firstName: string | null; lastName: string | null;
  phone: string | null; role: string;
}

interface ExpressAssignment {
  id: string; employeeId: string; pay: number;
  confirmedAt: string | null; confirmedNotes: string | null;
  employee: ExpressEmployee;
}

interface ExpressDelivery {
  id: string; type: ExpressType; date: string; status: ExpressStatus;
  photo: string | null; notes: string | null; createdAt: string; updatedAt: string;
  createdBy: { id: string; email: string };
  assignments: ExpressAssignment[];
}

interface EmployeeOption {
  id: string; name: string; firstName: string | null; lastName: string | null;
  role: string; isActive: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ExpressType, { label: string; pay: number; cls: string }> = {
  STANDARD: { label: 'Standard', pay: 30, cls: 'bg-blue-100 text-blue-800' },
  GV:       { label: 'GV',       pay: 50, cls: 'bg-violet-100 text-violet-800' },
};

const STATUS_CONFIG: Record<ExpressStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'En attente',  cls: 'bg-yellow-100 text-yellow-700' },
  ASSIGNED:  { label: 'Assignée',    cls: 'bg-blue-100 text-blue-800' },
  CONFIRMED: { label: 'Confirmée',   cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-500' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}
function fmtDateHeader(key: string) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function groupByDate(items: ExpressDelivery[]) {
  const map = new Map<string, ExpressDelivery[]>();
  for (const item of items) {
    const key = fmtDateKey(item.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// ── Employee multi-select ──────────────────────────────────────────────────────

function EmployeeSelect({
  employees, selected, max, onChange,
}: {
  employees: EmployeeOption[];
  selected: string[];
  max: number;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = employees.filter(e =>
    e.isActive && e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  };

  const selectedEmployees = employees.filter(e => selected.includes(e.id));

  return (
    <div className="relative">
      <div
        className="min-h-9 border border-gray-300 rounded-lg px-3 py-1.5 cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen(o => !o)}
      >
        {selectedEmployees.length === 0 ? (
          <span className="text-gray-400 text-sm">Choisir des employés (max {max})…</span>
        ) : (
          selectedEmployees.map(e => (
            <span key={e.id} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              {e.name}
              <button onClick={ev => { ev.stopPropagation(); toggle(e.id); }} className="hover:text-red-600">×</button>
            </span>
          ))
        )}
        <ChevronDown size={14} className="ml-auto text-gray-400 shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Rechercher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-sm"
            />
          </div>
          {filtered.map(e => (
            <div
              key={e.id}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm ${selected.includes(e.id) ? 'bg-blue-50' : ''} ${!selected.includes(e.id) && selected.length >= max ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => toggle(e.id)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected.includes(e.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                {selected.includes(e.id) && <CheckCircle2 size={10} className="text-white" />}
              </div>
              <span>{e.name}</span>
              <span className="ml-auto text-xs text-gray-400">{e.role}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-3 py-4 text-sm text-gray-400 text-center">Aucun résultat</div>}
          <div className="p-2 border-t">
            <Button size="sm" className="w-full h-7" onClick={() => { setOpen(false); setSearch(''); }}>
              Valider
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create modal ───────────────────────────────────────────────────────────────

function CreateModal({ employees, onClose, onCreated }: {
  employees: EmployeeOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 16);
  const [dialogOpen, setDialogOpen] = useState(true);
  const [type, setType] = useState<ExpressType>('STANDARD');
  const [date, setDate] = useState(today);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const { error: toastError, toasts, removeToast } = useToast();
  const queryClient = useQueryClient();

  const uploadPhoto = (deliveryId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Let the browser set Content-Type with the correct multipart boundary
    api.post(`/express/${deliveryId}/photo`, form, {
      headers: { 'Content-Type': undefined as unknown as string },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['express'] });
    }).catch(() => {
      // Photo failed silently; express was already created and listed
    });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        type,
        date: new Date(date).toISOString(),
        ...(employeeIds.length > 0 ? { employeeIds } : {}),
        ...(notes ? { notes } : {}),
      };
      const { data } = await api.post<ExpressDelivery>('/express', body);
      return data;
    },
    onSuccess: (delivery) => {
      // Close modal and notify parent first — toast lives in parent's container
      setDialogOpen(false);
      onCreated();
      onClose();
      // Upload photo in background after modal is gone
      if (photoFile) uploadPhoto(delivery.id, photoFile);
    },
    onError: (e: any) => toastError(e.response?.data?.message || 'Erreur lors de la création'),
  });

  const pay = TYPE_CONFIG[type].pay;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); onClose(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-500" /> Nouvelle mission express
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Type toggle */}
            <div>
              <Label>Type</Label>
              <div className="flex gap-2 mt-1">
                {(['STANDARD', 'GV'] as ExpressType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${type === t ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {TYPE_CONFIG[t].label} — {TYPE_CONFIG[t].pay}€/pers.
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <Label>Date et heure <span className="text-red-500">*</span></Label>
              <Input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Employees */}
            <div>
              <Label>Employés assignés <span className="text-gray-400 font-normal">(optionnel, max 2)</span></Label>
              <div className="mt-1">
                <EmployeeSelect
                  employees={employees}
                  selected={employeeIds}
                  max={2}
                  onChange={setEmployeeIds}
                />
              </div>
              {employeeIds.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Rémunération: {pay}€ × {employeeIds.length} = {pay * employeeIds.length}€
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notes <span className="text-gray-400 font-normal">(optionnel)</span></Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Informations complémentaires…"
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Photo */}
            <div>
              <Label>Photo <span className="text-gray-400 font-normal">(optionnel, jpg/png/pdf)</span></Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  id="photo-create"
                  className="hidden"
                  onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor="photo-create" className="cursor-pointer flex items-center gap-1.5 text-sm border border-dashed border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  <Upload size={14} /> {photoFile ? photoFile.name : 'Choisir un fichier'}
                </label>
                {photoFile && (
                  <button onClick={() => setPhotoFile(null)} className="text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!date || mut.isPending || mut.isSuccess}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {mut.isPending ? <><Loader2 size={14} className="mr-1 animate-spin" /> Création…</> : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Detail panel (Sheet) ───────────────────────────────────────────────────────

function DetailPanel({ delivery, employees, onClose, onUpdated }: {
  delivery: ExpressDelivery;
  employees: EmployeeOption[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const { success, error: toastError, toasts, removeToast } = useToast();

  const [notes, setNotes] = useState(delivery.notes ?? '');
  const [assignIds, setAssignIds] = useState<string[]>(delivery.assignments.map(a => a.employeeId));
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(!!delivery.photo);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load photo as blob URL when panel opens
  useEffect(() => {
    if (!delivery.photo) return;
    setLoadingPhoto(true);
    api.get(`/express/${delivery.id}/photo`, { responseType: 'blob' })
      .then(r => setPhotoUrl(URL.createObjectURL(r.data)))
      .catch(() => {})
      .finally(() => setLoadingPhoto(false));
  }, [delivery.id, delivery.photo]);

  const saveNotesMut = useMutation({
    mutationFn: () => api.patch(`/express/${delivery.id}`, { notes: notes || null }),
    onSuccess: () => { success('Notes sauvegardées'); onUpdated(); },
    onError: () => toastError('Erreur'),
  });

  const assignMut = useMutation({
    mutationFn: () => api.post(`/express/${delivery.id}/assign`, { employeeIds: assignIds }),
    onSuccess: () => {
      success('Assignation mise à jour');
      queryClient.invalidateQueries({ queryKey: ['express'] });
      onUpdated();
    },
    onError: (e: any) => toastError(e.response?.data?.message || 'Erreur'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.delete(`/express/${delivery.id}`),
    onSuccess: () => {
      success('Express annulée');
      queryClient.invalidateQueries({ queryKey: ['express'] });
      onClose();
    },
    onError: (e: any) => toastError(e.response?.data?.message || 'Erreur'),
  });

  const photoMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/express/${delivery.id}/photo`, form);
    },
    onSuccess: () => {
      success('Photo mise à jour');
      queryClient.invalidateQueries({ queryKey: ['express'] });
      onUpdated();
    },
    onError: () => toastError('Erreur lors de l\'envoi'),
  });

  const tc = TYPE_CONFIG[delivery.type];
  const sc = STATUS_CONFIG[delivery.status];
  const canEdit = delivery.status !== 'CONFIRMED' && delivery.status !== 'CANCELLED';

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-500" />
              Mission express
              <Badge className={tc.cls}>{tc.label}</Badge>
              <Badge className={sc.cls}>{sc.label}</Badge>
            </SheetTitle>
            <p className="text-sm text-gray-500">{fmtDate(delivery.date)} · {fmtTime(delivery.date)}</p>
          </SheetHeader>

          <div className="space-y-6">
            {/* Employees */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Users size={14} /> Employés assignés
              </h3>
              {delivery.assignments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucun employé assigné</p>
              ) : (
                <div className="space-y-2">
                  {delivery.assignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{a.employee.name}</p>
                        <p className="text-xs text-gray-500">{a.employee.role} · {a.pay}€</p>
                      </div>
                      {a.confirmedAt ? (
                        <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                          <CheckCircle2 size={12} /> Confirmé
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">En attente</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Assign section */}
              {canEdit && (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs text-gray-600">Modifier les assignations (max 2)</Label>
                  <EmployeeSelect
                    employees={employees}
                    selected={assignIds}
                    max={2}
                    onChange={setAssignIds}
                  />
                  <Button
                    size="sm"
                    onClick={() => assignMut.mutate()}
                    disabled={assignIds.length === 0 || assignMut.isPending}
                    className="w-full"
                  >
                    {assignMut.isPending ? <Loader2 size={13} className="mr-1 animate-spin" /> : <UserCheck size={13} className="mr-1" />}
                    Enregistrer les assignations
                  </Button>
                </div>
              )}
            </section>

            {/* Photo */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Camera size={14} /> Photo
              </h3>
              {delivery.photo ? (
                loadingPhoto ? (
                  <Skeleton className="h-48 w-full rounded-lg" />
                ) : photoUrl ? (
                  <div className="relative">
                    <img
                      src={photoUrl}
                      alt="Photo express"
                      className="w-full rounded-lg border border-gray-200 object-contain max-h-64"
                    />
                    {canEdit && (
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="absolute top-2 right-2 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs shadow hover:bg-gray-50"
                      >
                        Remplacer
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <AlertCircle size={14} className="text-orange-400" /> Fichier introuvable
                  </div>
                )
              ) : (
                canEdit ? (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 flex flex-col items-center gap-1"
                  >
                    <Upload size={20} />
                    Joindre une photo ou PDF
                  </button>
                ) : (
                  <p className="text-sm text-gray-400 italic">Aucune photo jointe</p>
                )
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) photoMut.mutate(file);
                  e.target.value = '';
                }}
              />
              {photoMut.isPending && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Envoi en cours…
                </p>
              )}
            </section>

            {/* Notes */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
              {canEdit ? (
                <div className="space-y-2">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Aucune note…"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveNotesMut.mutate()}
                    disabled={saveNotesMut.isPending || notes === (delivery.notes ?? '')}
                    className="w-full"
                  >
                    {saveNotesMut.isPending ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
                    Sauvegarder les notes
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{delivery.notes || <span className="italic text-gray-400">Aucune note</span>}</p>
              )}
            </section>

            {/* Cancel */}
            {canEdit && delivery.status !== 'CANCELLED' && (
              <section className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    if (confirm('Annuler cette mission express ?')) cancelMut.mutate();
                  }}
                  disabled={cancelMut.isPending}
                >
                  {cancelMut.isPending ? <Loader2 size={13} className="mr-1 animate-spin" /> : <X size={13} className="mr-1" />}
                  Annuler la mission
                </Button>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Express card ───────────────────────────────────────────────────────────────

function ExpressCard({ delivery, onView }: { delivery: ExpressDelivery; onView: () => void }) {
  const tc = TYPE_CONFIG[delivery.type];
  const sc = STATUS_CONFIG[delivery.status];

  return (
    <Card className="p-4 border border-gray-200 hover:border-blue-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Badge className={`${tc.cls} text-xs font-bold`}>{tc.label}</Badge>
            <span className="text-sm text-gray-500">{fmtTime(delivery.date)}</span>
            <Badge className={`${sc.cls} text-xs`}>{sc.label}</Badge>
            {delivery.photo && (
              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                <Camera size={11} /> Photo
              </span>
            )}
          </div>

          {/* Employees */}
          <div className="flex items-center gap-1.5 flex-wrap text-sm">
            {delivery.assignments.length === 0 ? (
              <span className="text-gray-400 italic text-sm">Non assigné</span>
            ) : (
              delivery.assignments.map(a => (
                <span key={a.id} className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                    {a.employee.name.charAt(0)}
                  </span>
                  <span className="text-gray-700 text-sm">{a.employee.name}</span>
                  {a.confirmedAt && <CheckCircle2 size={11} className="text-green-500" />}
                </span>
              ))
            )}
          </div>

          {/* Pay */}
          <p className="text-xs text-gray-400 mt-1">{tc.pay}€/pers. · {delivery.assignments.length} assigné(s)</p>

          {/* Notes excerpt */}
          {delivery.notes && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">"{delivery.notes}"</p>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={onView} className="shrink-0">
          <Eye size={13} className="mr-1" /> Voir
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ExpressDeliveries() {
  usePageTitle('Livraisons express');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [panelDelivery, setPanelDelivery] = useState<ExpressDelivery | null>(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', type: '', status: '' });
  const { success: showSuccess, toasts, removeToast } = useToast();

  const params: Record<string, string> = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo)   params.dateTo   = filters.dateTo;
  if (filters.type)     params.type     = filters.type;
  if (filters.status)   params.status   = filters.status;

  const { data: deliveries = [], isLoading } = useQuery<ExpressDelivery[]>({
    queryKey: ['express', params],
    queryFn: () => api.get<ExpressDelivery[]>('/express', { params }).then(r => r.data),
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['employees-active'],
    queryFn: () => api.get<EmployeeOption[]>('/employees?isActive=true').then(r => r.data),
  });

  const grouped = groupByDate(deliveries);

  const setFilter = (k: keyof typeof filters) => (v: string) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['express'] });
    if (panelDelivery) {
      api.get<ExpressDelivery>(`/express/${panelDelivery.id}`)
        .then(r => setPanelDelivery(r.data))
        .catch(() => {});
    }
  }, [queryClient, panelDelivery]);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Zap size={20} className="text-yellow-500" /> Missions Express
        </h1>
        <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus size={16} className="mr-1" /> Nouvelle Express
        </Button>
      </div>

      {/* Filters — 2-col grid on mobile */}
      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Label className="shrink-0 text-xs">Du</Label>
          <Input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom')(e.target.value)} className="h-9 flex-1 text-sm" />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Label className="shrink-0 text-xs">Au</Label>
          <Input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo')(e.target.value)} className="h-9 flex-1 text-sm" />
        </div>
        <select
          value={filters.type}
          onChange={e => setFilter('type')(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
        >
          <option value="">Tous types</option>
          <option value="STANDARD">Standard</option>
          <option value="GV">GV</option>
        </select>
        <select
          value={filters.status}
          onChange={e => setFilter('status')(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
        >
          <option value="">Tous statuts</option>
          <option value="PENDING">En attente</option>
          <option value="ASSIGNED">Assignée</option>
          <option value="CONFIRMED">Confirmée</option>
          <option value="CANCELLED">Annulée</option>
        </select>
        {(filters.dateFrom || filters.dateTo || filters.type || filters.status) && (
          <Button size="sm" variant="ghost" className="col-span-2 md:col-span-1 h-9 text-xs text-gray-500"
            onClick={() => setFilters({ dateFrom: '', dateTo: '', type: '', status: '' })}>
            <X size={12} className="mr-1" /> Réinitialiser
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : deliveries.length === 0 ? (
        <Card className="p-12 text-center">
          <Zap size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucune mission express</p>
          <p className="text-sm text-gray-400 mt-1">Créez votre première mission express avec le bouton ci-dessus.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([dateKey, items]) => {
            const confirmed = items.filter(d => d.status === 'CONFIRMED').length;
            return (
              <section key={dateKey}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-gray-700 capitalize">
                    {fmtDateHeader(dateKey)}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{items.length} express</span>
                    {confirmed > 0 && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                        <CheckCircle2 size={10} /> {confirmed} confirmée{confirmed > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <div className="space-y-3">
                  {items.map(d => (
                    <ExpressCard
                      key={d.id}
                      delivery={d}
                      onView={() => setPanelDelivery(d)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateModal
          employees={employees}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['express'] });
            showSuccess('Express créée !');
          }}
        />
      )}

      {/* Detail panel */}
      {panelDelivery && (
        <DetailPanel
          delivery={panelDelivery}
          employees={employees}
          onClose={() => setPanelDelivery(null)}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}
