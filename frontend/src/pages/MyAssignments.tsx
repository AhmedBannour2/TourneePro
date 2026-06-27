import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Calendar, Truck, Users, Clock, Phone,
  CheckCircle2, ClipboardCheck, History, Zap, Camera, Upload, X, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TourConfirmation {
  id: string; tourId: string; confirmedById: string;
  totalClients: number; delivered: number; absent: number; nonConform: number; d3e: number | null;
  notes: string | null; confirmedAt: string; updatedAt: string;
  confirmedBy: { id: string; name: string };
}

interface TourItem {
  id: string; tourCode: string; date: string; platform: string;
  quai: string | null; horaire: string | null;
  myRole: 'chauffeur' | 'aide';
  partner: { id: string; name: string; phone: string | null } | null;
  truck: { immatriculation: string } | null;
  confirmationStatus: 'UNCONFIRMED' | 'CONFIRMED';
  confirmation: TourConfirmation | null;
}

interface AssignmentsResponse {
  upcoming: TourItem[];
  history: TourItem[];
}

type ExpressType   = 'STANDARD' | 'GV' | 'AUTRE';
type ExpressStatus = 'PENDING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';

interface ConfirmationPhoto {
  id: string; url: string; uploadedAt: string;
}

interface ExpressItem {
  id: string; type: ExpressType; date: string; status: ExpressStatus;
  photo: string | null; notes: string | null;
  startTime: string | null; endTime: string | null;
  pay: number; confirmedAt: string | null;
  partner: { id: string; name: string; phone: string | null } | null;
  confirmationPhotos: ConfirmationPhoto[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EXPRESS_TYPE_CONFIG: Record<ExpressType, { label: string; cls: string }> = {
  STANDARD: { label: 'Standard', cls: 'bg-blue-100 text-blue-800' },
  GV:       { label: 'GV',       cls: 'bg-violet-100 text-violet-800' },
  AUTRE:    { label: 'Autre',    cls: 'bg-orange-100 text-orange-800' },
};

// ── Confirm modal (tours) ──────────────────────────────────────────────────────

interface Fields { totalClients: string; delivered: string; absent: string; nonConform: string; d3e: string; notes: string }
const EMPTY: Fields = { totalClients: '', delivered: '', absent: '', nonConform: '', d3e: '', notes: '' };
const fromConf = (c: TourConfirmation): Fields => ({
  totalClients: String(c.totalClients), delivered: String(c.delivered),
  absent: String(c.absent), nonConform: String(c.nonConform), d3e: c.d3e != null ? String(c.d3e) : '', notes: c.notes ?? '',
});

function ConfirmModal({ tour, onClose, onSaved }: { tour: TourItem; onClose: () => void; onSaved: () => void }) {
  const isEdit = tour.confirmationStatus === 'CONFIRMED';
  const [f, setF] = useState<Fields>(isEdit && tour.confirmation ? fromConf(tour.confirmation) : EMPTY);
  const { success, error, toasts, removeToast } = useToast();

  const n = (v: string) => (v === '' ? 0 : parseInt(v, 10) || 0);
  const total = n(f.totalClients);
  const sum   = n(f.delivered) + n(f.absent);
  const hasD3E = f.d3e !== '';
  const valid = total > 0 && sum <= total && hasD3E;
  const sumOk = total > 0 && sum <= total;

  const mut = useMutation({
    mutationFn: (body: object) =>
      isEdit ? api.patch(`/tours/${tour.id}/confirm`, body) : api.post(`/tours/${tour.id}/confirm`, body),
    onSuccess: () => { success(isEdit ? 'Confirmation mise à jour' : 'Tournée confirmée !'); onSaved(); onClose(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const dateStr = new Date(tour.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={() => onClose()}>
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
              <div className={`text-sm font-medium rounded-lg px-3 py-2 flex justify-between border ${sumOk ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                <span>{n(f.delivered)} + {n(f.absent)} = {sum}</span>
                <span>/ Total: {total}</span>
              </div>
            )}
            <div>
              <Label>D3E (appareils repris) <span className="text-red-500">*</span></Label>
              <Input type="number" min="0" value={f.d3e} onChange={set('d3e')} placeholder="0" className="mt-1" />
              {!hasD3E && f.d3e !== '' && <p className="text-xs text-red-600 mt-1">D3E requis</p>}
            </div>
            <div>
              <Label>Notes (optionnel)</Label>
              <textarea value={f.notes} onChange={set('notes')} placeholder="Observations..."
                rows={2} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => mut.mutate({ totalClients: n(f.totalClients), delivered: n(f.delivered), absent: n(f.absent), nonConform: n(f.nonConform), d3e: n(f.d3e), notes: f.notes || undefined })}
              disabled={!valid || mut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {mut.isPending ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Tour card ──────────────────────────────────────────────────────────────────

function TourCard({ tour, onConfirm, isPast }: { tour: TourItem; onConfirm: (t: TourItem) => void; isPast?: boolean }) {
  const confirmed = tour.confirmationStatus === 'CONFIRMED';
  const dateStr = new Date(tour.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <Card className={`p-4 shadow-sm border ${confirmed ? 'border-green-200 bg-green-50/20' : isPast ? 'border-orange-200 bg-orange-50/20' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3 justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="font-bold text-base font-mono leading-snug">{tour.tourCode}</span>
            <Badge className={`text-xs flex-shrink-0 ${tour.myRole === 'chauffeur' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
              {tour.myRole === 'chauffeur' ? 'Chauffeur' : 'Aide'}
            </Badge>
            {confirmed
              ? <Badge className="bg-green-100 text-green-800 flex items-center gap-1 text-xs"><CheckCircle2 size={10} /> Confirmé</Badge>
              : isPast
              ? <Badge className="bg-orange-100 text-orange-700 text-xs">À confirmer</Badge>
              : <Badge className="bg-yellow-100 text-yellow-700 text-xs">En attente</Badge>}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-gray-600">
            <span className="flex items-center gap-1"><Calendar size={13} className="text-gray-400" />{dateStr}</span>
            <span>{tour.platform}</span>
            {tour.quai && <span>Quai {tour.quai}</span>}
            {tour.horaire && <span className="flex items-center gap-1"><Clock size={13} className="text-gray-400" />{tour.horaire}</span>}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-0.5 mt-1.5 text-sm text-gray-500">
            {tour.partner && (
              <span className="flex items-center gap-1">
                <Users size={13} className="text-gray-400" /> {tour.partner.name}
                {tour.partner.phone && (
                  <a href={`tel:${tour.partner.phone}`} className="ml-1 text-indigo-600 hover:underline flex items-center gap-0.5">
                    <Phone size={11} />{tour.partner.phone}
                  </a>
                )}
              </span>
            )}
            {tour.truck && (
              <span className="flex items-center gap-1 font-mono text-xs">
                <Truck size={13} className="text-gray-400" />{tour.truck.immatriculation}
              </span>
            )}
          </div>

          {confirmed && tour.confirmation && (
            <div className="mt-1.5 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
              <span className="text-green-700 font-medium">{tour.confirmation.delivered}/{tour.confirmation.totalClients} livrés</span>
              {tour.confirmation.absent > 0 && <span className="text-orange-600">{tour.confirmation.absent} absents</span>}
              {tour.confirmation.nonConform > 0 && <span className="text-red-600">{tour.confirmation.nonConform} non-conformes</span>}
              <span className="text-gray-400">le {new Date(tour.confirmation.confirmedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>

        <Button
          variant={confirmed ? 'outline' : 'default'}
          className={`shrink-0 min-h-[44px] px-4 ${confirmed ? 'border-green-300 text-green-700 hover:bg-green-50' : isPast ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          onClick={() => onConfirm(tour)}
        >
          <ClipboardCheck size={14} className="mr-1" />
          {confirmed ? 'Modifier' : 'Confirmer'}
        </Button>
      </div>
    </Card>
  );
}

// ── Express confirm modal ──────────────────────────────────────────────────────

function ExpressConfirmModal({ item, onClose, onSaved }: {
  item: ExpressItem; onClose: () => void; onSaved: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const { success, error, toasts, removeToast } = useToast();
  const queryClient = useQueryClient();

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setPhotoFiles(prev => [...prev, ...Array.from(files)]);
  };

  const removeFile = (idx: number) =>
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));

  const mut = useMutation({
    mutationFn: async () => {
      await api.post(`/express/${item.id}/confirm`, { notes: notes || undefined });
      for (const file of photoFiles) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/express/${item.id}/confirmation-photos`, form, {
          headers: { 'Content-Type': undefined as unknown as string },
        });
      }
    },
    onSuccess: () => {
      success('Mission express confirmée !');
      queryClient.invalidateQueries({ queryKey: ['my-express'] });
      onSaved();
      onClose();
    },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });

  const typeConf = EXPRESS_TYPE_CONFIG[item.type];
  const dateStr = new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-500" />
              Confirmer la mission express
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={typeConf.cls}>{typeConf.label}</Badge>
              <span className="text-sm text-gray-500">{dateStr}</span>
              {(item.startTime || item.endTime) && (
                <span className="text-sm text-gray-500">{item.startTime ?? '?'} → {item.endTime ?? '?'}</span>
              )}
            </div>
          </DialogHeader>

          <div className="py-2 space-y-4">
            <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800">
              Rémunération : <span className="font-bold">{item.pay}€</span>
            </div>

            {/* Multiple photos */}
            <div>
              <Label>Photos de mission <span className="text-gray-400 font-normal">(optionnel, plusieurs possibles)</span></Label>
              <div className="mt-1 space-y-1">
                {photoFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-2 py-1">
                    <Camera size={12} className="text-gray-400 shrink-0" />
                    <span className="flex-1 truncate text-xs">{f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" id="confirm-photos" className="hidden" multiple
                  onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                <label htmlFor="confirm-photos"
                  className="cursor-pointer flex items-center gap-1.5 text-sm border border-dashed border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 w-full">
                  <Upload size={14} /> Ajouter des photos
                </label>
              </div>
            </div>

            <div>
              <Label>Notes (optionnel)</Label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Observations…" rows={2}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white">
              {mut.isPending ? <><Loader2 size={13} className="mr-1 animate-spin" /> Confirmation…</> : 'Confirmer ✓'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Express card ───────────────────────────────────────────────────────────────

function ExpressCard({ item, onConfirm, onViewPhoto }: {
  item: ExpressItem;
  onConfirm: (i: ExpressItem) => void;
  onViewPhoto: (id: string, notes: string | null) => void;
}) {
  const confirmed = item.status === 'CONFIRMED' || !!item.confirmedAt;
  const tc = EXPRESS_TYPE_CONFIG[item.type];
  const dateStr = new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const timeStr = new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Card className={`p-4 border ${confirmed ? 'border-green-200 bg-green-50/20' : 'border-yellow-200 bg-yellow-50/10'}`}>
      <div className="flex items-start gap-4 justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Zap size={14} className="text-yellow-500 shrink-0" />
            <Badge className={`${tc.cls} text-xs font-bold`}>{tc.label}</Badge>
            <span className="text-sm text-gray-500">{dateStr} · {timeStr}</span>
            {confirmed
              ? <Badge className="bg-green-100 text-green-800 flex items-center gap-1 text-xs"><CheckCircle2 size={10} /> Confirmée</Badge>
              : <Badge className="bg-yellow-100 text-yellow-700 text-xs">À confirmer</Badge>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600">
            <span className="font-semibold text-blue-700">{item.pay}€</span>
            {(item.startTime || item.endTime) && (
              <span className="flex items-center gap-1 text-gray-500">
                <Clock size={13} className="text-gray-400" />
                {item.startTime ?? '?'} → {item.endTime ?? '?'}
              </span>
            )}
            {item.partner && (
              <span className="flex items-center gap-1">
                <Users size={13} className="text-gray-400" /> {item.partner.name}
                {item.partner.phone && (
                  <a href={`tel:${item.partner.phone}`} className="ml-1 text-indigo-600 hover:underline flex items-center gap-0.5">
                    <Phone size={11} />{item.partner.phone}
                  </a>
                )}
              </span>
            )}
          </div>

          {item.notes && (
            <p className="text-xs text-gray-500 mt-1 italic line-clamp-1">"{item.notes}"</p>
          )}

          {confirmed && item.confirmedAt && (
            <p className="text-xs text-green-600 mt-1">
              Confirmée le {new Date(item.confirmedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          {!confirmed && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onConfirm(item)}>
              <ClipboardCheck size={13} className="mr-1" /> Confirmer
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onViewPhoto(item.id, item.notes)}
            className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
            <Camera size={13} className="mr-1" />
            {(item.confirmationPhotos ?? []).length > 0 ? `Photos (${(item.confirmationPhotos ?? []).length})` : 'Photos / Doc'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Confirmation photo thumbnail (employee view) ───────────────────────────────

function EmployeeConfirmThumb({ deliveryId, photo, onDelete }: {
  deliveryId: string;
  photo: ConfirmationPhoto;
  onDelete: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [mime, setMime] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/express/${deliveryId}/confirmation-photos/${photo.id}`, { responseType: 'blob' })
      .then(r => { setMime(r.data.type); setSrc(URL.createObjectURL(r.data)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deliveryId, photo.id]);

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ aspectRatio: '4/3' }}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={14} className="animate-spin text-gray-300" />
        </div>
      ) : src ? (
        mime === 'application/pdf' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer" onClick={() => window.open(src, '_blank')}>
            <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
            </svg>
            <span className="text-xs text-blue-600">PDF</span>
          </div>
        ) : (
          <img src={src} alt="Mission" className="absolute inset-0 w-full h-full object-cover cursor-pointer"
            onClick={() => window.open(src, '_blank')} />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Camera size={16} className="text-gray-300" />
        </div>
      )}
      <button onClick={onDelete}
        className="absolute top-1 right-1 hidden group-hover:flex bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow">
        <X size={10} />
      </button>
    </div>
  );
}

// ── Photo lightbox (employee) ──────────────────────────────────────────────────

function AdminDocThumb({ deliveryId }: { deliveryId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [mime, setMime] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/express/${deliveryId}/photo`, { responseType: 'blob' })
      .then(r => { setMime(r.data.type); setSrc(URL.createObjectURL(r.data)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deliveryId]);

  if (loading) return (
    <div className="flex items-center justify-center h-16 bg-gray-50 rounded-lg border border-gray-200">
      <Loader2 size={16} className="animate-spin text-gray-300" />
    </div>
  );
  if (!src) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">Document de mission</p>
      <div className="rounded-lg overflow-hidden border border-blue-200 bg-blue-50 cursor-pointer"
        onClick={() => window.open(src, '_blank')}>
        {mime === 'application/pdf' ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <svg className="w-8 h-8 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
            </svg>
            <div>
              <p className="text-xs font-medium text-blue-800">Document de mission</p>
              <p className="text-xs text-blue-500">Cliquer pour ouvrir le PDF</p>
            </div>
          </div>
        ) : (
          <img src={src} alt="Document de mission" className="w-full max-h-48 object-contain" />
        )}
      </div>
    </div>
  );
}

function PhotoLightbox({ deliveryId, initialNotes, onClose, onChanged }: {
  deliveryId: string;
  initialNotes: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const { success, error, toasts, removeToast } = useToast();

  const { data: liveDelivery, isLoading: deliveryLoading, refetch } = useQuery({
    queryKey: ['express-detail', deliveryId],
    queryFn: () => api.get<{ photo: string | null; confirmationPhotos: ConfirmationPhoto[] }>(`/express/${deliveryId}`).then(r => r.data),
  });
  const photos: ConfirmationPhoto[] = liveDelivery?.confirmationPhotos ?? [];
  const hasAdminPhoto = !!(liveDelivery?.photo?.startsWith('https://'));

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/express/${deliveryId}/confirmation-photos`, form, {
          headers: { 'Content-Type': undefined as unknown as string },
        });
      }
      await refetch();
      onChanged();
      success(files.length > 1 ? `${files.length} photos enregistrées` : 'Photo enregistrée');
    } catch {
      error('Erreur lors de l\'envoi');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    try {
      await api.delete(`/express/${deliveryId}/confirmation-photos/${photoId}`);
      await refetch();
      onChanged();
      success('Photo supprimée');
    } catch {
      error('Erreur');
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.patch(`/express/${deliveryId}`, { notes: notes || null });
      onChanged();
      success('Notes sauvegardées');
    } catch {
      error('Erreur');
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera size={16} /> Photos de mission
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">

            {/* Admin mission document — header inside AdminDocThumb, hides on 404 */}
            {hasAdminPhoto && <AdminDocThumb deliveryId={deliveryId} />}

            {/* Employee confirmation photos */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Mes photos de mission</p>
            {deliveryLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photos.map(p => (
                  <EmployeeConfirmThumb
                    key={p.id}
                    deliveryId={deliveryId}
                    photo={p}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-gray-400">
                <Camera size={28} className="text-gray-300" />
                <p className="text-sm">Aucune photo ajoutée</p>
              </div>
            )}
            </div>

            {/* Add photos */}
            <div>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" id="lb-confirm-upload" className="hidden" multiple
                onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
              <label htmlFor="lb-confirm-upload"
                className={`flex items-center justify-center gap-2 w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading
                  ? <><Loader2 size={14} className="animate-spin" /> Envoi…</>
                  : <><Upload size={14} /> Ajouter des photos</>}
              </label>
            </div>

            {/* Notes */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-medium text-gray-700">Notes</Label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Observations…" rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
              <Button size="sm" variant="outline" className="w-full" onClick={handleSaveNotes}
                disabled={savingNotes || notes === (initialNotes ?? '')}>
                {savingNotes ? <><Loader2 size={13} className="mr-1 animate-spin" /> Sauvegarde…</> : 'Sauvegarder les notes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyAssignments() {
  usePageTitle('Mes tournées');
  const queryClient = useQueryClient();
  const [confirmingTour, setConfirmingTour]       = useState<TourItem | null>(null);
  const [confirmingExpress, setConfirmingExpress] = useState<ExpressItem | null>(null);
  const [photoDelivery, setPhotoDelivery]         = useState<{ id: string; notes: string | null } | null>(null);

  const { data, isLoading, isError } = useQuery<AssignmentsResponse>({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<AssignmentsResponse>('/employees/me/assignments').then(r => r.data),
  });

  const { data: expressList = [], isLoading: expressLoading } = useQuery<ExpressItem[]>({
    queryKey: ['my-express'],
    queryFn: () => api.get<ExpressItem[]>('/employees/me/express').then(r => r.data),
  });

  const upcoming = data?.upcoming ?? [];
  const history  = data?.history  ?? [];

  const pendingExpress  = expressList.filter(e => e.status !== 'CONFIRMED' && !e.confirmedAt);
  const confirmedExpress = expressList.filter(e => e.status === 'CONFIRMED' || !!e.confirmedAt);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Mes Tournées</h1>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : isError ? (
        <Card className="p-10 text-center text-gray-500">Aucun profil employé lié à ce compte.</Card>
      ) : (
        <>
          {/* Upcoming */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Calendar size={14} /> À venir ({upcoming.length})
            </h2>
            {upcoming.length === 0
              ? <Card className="p-8 text-center text-gray-400 text-sm">Aucune tournée à venir</Card>
              : <div className="space-y-3">{upcoming.map(t => <TourCard key={t.id} tour={t} onConfirm={setConfirmingTour} />)}</div>}
          </section>

          {/* History */}
          {history.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <History size={14} /> Historique — 30 derniers jours ({history.length})
              </h2>
              <div className="space-y-3">{history.map(t => <TourCard key={t.id} tour={t} onConfirm={setConfirmingTour} isPast />)}</div>
            </section>
          )}
        </>
      )}

      {/* ── Mes Express ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Zap size={14} className="text-yellow-500" /> Mes Express ({expressList.length})
        </h2>

        {expressLoading ? (
          <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : expressList.length === 0 ? (
          <Card className="p-8 text-center text-gray-400 text-sm">Aucune mission express assignée</Card>
        ) : (
          <div className="space-y-3">
            {pendingExpress.map(e => (
              <ExpressCard
                key={e.id}
                item={e}
                onConfirm={setConfirmingExpress}
                onViewPhoto={(id, notes) => setPhotoDelivery({ id, notes })}
              />
            ))}
            {confirmedExpress.map(e => (
              <ExpressCard
                key={e.id}
                item={e}
                onConfirm={setConfirmingExpress}
                onViewPhoto={(id, notes) => setPhotoDelivery({ id, notes })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Tour confirm modal */}
      {confirmingTour && (
        <ConfirmModal
          tour={confirmingTour}
          onClose={() => setConfirmingTour(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['my-assignments'] })}
        />
      )}

      {/* Express confirm modal */}
      {confirmingExpress && (
        <ExpressConfirmModal
          item={confirmingExpress}
          onClose={() => setConfirmingExpress(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['my-express'] })}
        />
      )}

      {/* Photo lightbox */}
      {photoDelivery && (
        <PhotoLightbox
          deliveryId={photoDelivery.id}
          initialNotes={photoDelivery.notes}
          onClose={() => setPhotoDelivery(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['my-express'] })}
        />
      )}
    </div>
  );
}
