import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Calendar, Truck, Users, Clock, Phone,
  CheckCircle2, ClipboardCheck, History, Zap, Camera,
  AlertTriangle, X, Loader2,
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

type ExpressType   = 'STANDARD' | 'GV';
type ExpressStatus = 'PENDING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';

interface ExpressItem {
  id: string; type: ExpressType; date: string; status: ExpressStatus;
  photo: string | null; notes: string | null;
  pay: number; confirmedAt: string | null;
  partner: { id: string; name: string; phone: string | null } | null;
}

interface PendingInspection {
  id: string;
  scheduledDate: string;
  truck: { id: string; immatriculation: string };
  assignedTo: { id: string; name: string };
}

const CHECKLIST_ITEMS = [
  { key: 'HUILE',        label: "Niveau d'huile" },
  { key: 'RADIATEUR',    label: 'Eau du radiateur' },
  { key: 'CAISSE_OUTILS',label: 'Caisse à outils' },
  { key: 'CHARIOT',      label: 'Chariot' },
  { key: 'ROULETTES',    label: 'Roulettes' },
  { key: 'COUVERCLE',    label: 'Couvercle de produit' },
] as const;

type CheckKey = typeof CHECKLIST_ITEMS[number]['key'];
type CheckStatus = 'OK' | 'PROBLEME';

// ── Constants ──────────────────────────────────────────────────────────────────

const EXPRESS_TYPE_CONFIG: Record<ExpressType, { label: string; cls: string }> = {
  STANDARD: { label: 'Standard', cls: 'bg-blue-100 text-blue-800' },
  GV:       { label: 'GV',       cls: 'bg-violet-100 text-violet-800' },
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
  const { success, error, toasts, removeToast } = useToast();

  const mut = useMutation({
    mutationFn: () => api.post(`/express/${item.id}/confirm`, { notes: notes || undefined }),
    onSuccess: () => { success('Mission express confirmée !'); onSaved(); onClose(); },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur'),
  });

  const typeConf = EXPRESS_TYPE_CONFIG[item.type];
  const dateStr = new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const timeStr = new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
            <div className="flex items-center gap-2 mt-1">
              <Badge className={typeConf.cls}>{typeConf.label}</Badge>
              <span className="text-sm text-gray-500">{dateStr} · {timeStr}</span>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-4">
            <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800">
              Rémunération : <span className="font-bold">{item.pay}€</span>
            </div>
            <div>
              <Label>Notes (optionnel)</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observations…"
                rows={2}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {mut.isPending ? 'Confirmation…' : 'Confirmer ✓'}
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
  onViewPhoto: (id: string) => void;
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
          {item.photo && (
            <Button size="sm" variant="outline" onClick={() => onViewPhoto(item.id)}
              className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
              <Camera size={13} className="mr-1" /> Voir les détails de la livraison
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Photo lightbox ─────────────────────────────────────────────────────────────

function PhotoLightbox({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/express/${deliveryId}/photo`, { responseType: 'blob' })
      .then(r => setSrc(URL.createObjectURL(r.data)))
      .catch(() => setSrc(null))
      .finally(() => setLoading(false));
  }, [deliveryId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Photo de la mission express</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-48">
          {loading ? (
            <div className="text-sm text-gray-500">Chargement…</div>
          ) : src ? (
            <img src={src} alt="Photo express" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
          ) : (
            <p className="text-gray-400 text-sm">Impossible de charger la photo.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Inspection modal ───────────────────────────────────────────────────────────

function InspectionModal({ inspection, onClose, onSubmitted }: {
  inspection: PendingInspection;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const emptySelections = Object.fromEntries(CHECKLIST_ITEMS.map(({ key }) => [key, null])) as Record<CheckKey, CheckStatus | null>;
  const emptyComments   = Object.fromEntries(CHECKLIST_ITEMS.map(({ key }) => [key, ''])) as Record<CheckKey, string>;

  const [selections,     setSelections]     = useState<Record<CheckKey, CheckStatus | null>>(emptySelections);
  const [itemComments,   setItemComments]   = useState<Record<CheckKey, string>>(emptyComments);
  const [generalComment, setGeneralComment] = useState('');
  const [photos,         setPhotos]         = useState<File[]>([]);
  const [photoUrls,      setPhotoUrls]      = useState<string[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [errorMsg,       setErrorMsg]       = useState('');
  const [photoRetryId,   setPhotoRetryId]   = useState<string | null>(null);

  const allSelected = CHECKLIST_ITEMS.every(({ key }) => selections[key] !== null);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - photos.length);
    setPhotos((prev) => [...prev, ...arr]);
    setPhotoUrls((prev) => [...prev, ...arr.map((f) => URL.createObjectURL(f))]);
  };

  const removePhoto = (i: number) => {
    URL.revokeObjectURL(photoUrls[i]);
    setPhotos((prev) => prev.filter((_, j) => j !== i));
    setPhotoUrls((prev) => prev.filter((_, j) => j !== i));
  };

  const uploadPhotosFor = async (inspectionId: string) => {
    const fd = new FormData();
    photos.forEach((p) => fd.append('photos', p));
    // Delete Content-Type so the browser sets multipart/form-data with the correct boundary.
    // The api instance has a default 'application/json' header that would break Multer parsing.
    await api.post(`/inspections/${inspectionId}/photos`, fd, {
      headers: { 'Content-Type': undefined },
    });
  };

  const handleSubmit = async () => {
    if (!allSelected) return;
    setSubmitting(true);
    setErrorMsg('');
    setPhotoRetryId(null);

    // Step 1: submit checklist as JSON
    try {
      const items = CHECKLIST_ITEMS.map(({ key }) => ({
        item: key,
        status: selections[key]!,
        comment: itemComments[key] || undefined,
      }));
      await api.post(`/inspections/${inspection.id}/submit`, {
        items,
        generalComment: generalComment || undefined,
      });
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Erreur lors de la soumission.');
      setSubmitting(false);
      return;
    }

    // Step 2: upload photos (separate multipart request — axios sets boundary automatically)
    if (photos.length > 0) {
      try {
        await uploadPhotosFor(inspection.id);
      } catch {
        setPhotoRetryId(inspection.id);
        setErrorMsg(
          "Contrôle soumis mais erreur lors de l'envoi des photos.",
        );
        setSubmitting(false);
        onSubmitted();
        return;
      }
    }

    setSubmitting(false);
    onSubmitted();
    onClose();
  };

  const retryPhotos = async () => {
    if (!photoRetryId) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await uploadPhotosFor(photoRetryId);
      setPhotoRetryId(null);
      onClose();
    } catch {
      setErrorMsg("Échec de l'envoi des photos. Vérifiez votre connexion et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const dateStr = new Date(inspection.scheduledDate).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-blue-600" />
            Contrôle — {inspection.truck.immatriculation}
          </DialogTitle>
          <p className="text-sm text-gray-500">{dateStr}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Checklist */}
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map(({ key, label }) => {
              const sel = selections[key];
              return (
                <div key={key} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <span className="text-sm font-medium">{label}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelections((p) => ({ ...p, [key]: 'OK' }))}
                        className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${
                          sel === 'OK'
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <CheckCircle2 size={15} /> OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelections((p) => ({ ...p, [key]: 'PROBLEME' }))}
                        className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${
                          sel === 'PROBLEME'
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-red-300'
                        }`}
                      >
                        <AlertTriangle size={15} /> Problème
                      </button>
                    </div>
                  </div>
                  {sel === 'PROBLEME' && (
                    <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                      <input
                        type="text"
                        placeholder="Décrire le problème…"
                        value={itemComments[key]}
                        onChange={(e) => setItemComments((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full text-sm bg-white border border-red-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* General comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Commentaire général / problème moteur
            </label>
            <textarea
              rows={3}
              placeholder="Observations générales, anomalies moteur…"
              value={generalComment}
              onChange={(e) => setGeneralComment(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <Camera size={14} /> Photos ({photos.length}/5)
            </label>
            {photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`photo-${i}`} className="h-20 w-20 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full p-0.5 shadow-sm hover:bg-red-50"
                    >
                      <X size={12} className="text-gray-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 5 && (
              <label className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-colors">
                <Camera size={15} />
                {photos.length === 0 ? 'Ajouter des photos' : 'Ajouter une photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
            )}
          </div>

          {errorMsg && (
            <div className={`text-sm rounded px-3 py-2 border ${photoRetryId ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-600'}`}>
              <p>{errorMsg}</p>
              {photoRetryId && (
                <button
                  type="button"
                  onClick={retryPhotos}
                  disabled={submitting}
                  className="mt-1.5 text-xs font-semibold underline hover:no-underline disabled:opacity-50"
                >
                  {submitting ? 'Envoi en cours…' : 'Réessayer les photos'}
                </button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {photoRetryId ? 'Fermer' : 'Annuler'}
          </Button>
          {!photoRetryId && (
            <Button
              onClick={handleSubmit}
              disabled={!allSelected || submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting
                ? <><Loader2 size={14} className="mr-1 animate-spin" />Envoi…</>
                : 'Soumettre le contrôle'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyAssignments() {
  usePageTitle('Mes tournées');
  const queryClient = useQueryClient();
  const [confirmingTour, setConfirmingTour]       = useState<TourItem | null>(null);
  const [confirmingExpress, setConfirmingExpress] = useState<ExpressItem | null>(null);
  const [photoDeliveryId, setPhotoDeliveryId]     = useState<string | null>(null);
  const [inspectingId, setInspectingId]           = useState<PendingInspection | null>(null);

  const { data, isLoading, isError } = useQuery<AssignmentsResponse>({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<AssignmentsResponse>('/employees/me/assignments').then(r => r.data),
  });

  const { data: expressList = [], isLoading: expressLoading } = useQuery<ExpressItem[]>({
    queryKey: ['my-express'],
    queryFn: () => api.get<ExpressItem[]>('/employees/me/express').then(r => r.data),
  });

  const { data: pendingInspections = [], isLoading: inspectionsLoading } = useQuery<PendingInspection[]>({
    queryKey: ['my-inspections'],
    queryFn: () => api.get<PendingInspection[]>('/employees/me/inspections').then(r => r.data),
  });

  useEffect(() => {
    const all = [...(data?.upcoming ?? []), ...(data?.history ?? [])];
    all.forEach(a => api.post(`/tours/${a.id}/assignment/seen`).catch(() => {}));
  }, [data]);

  const upcoming = data?.upcoming ?? [];
  const history  = data?.history  ?? [];

  const pendingExpress  = expressList.filter(e => e.status !== 'CONFIRMED' && !e.confirmedAt);
  const confirmedExpress = expressList.filter(e => e.status === 'CONFIRMED' || !!e.confirmedAt);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Mes Tournées</h1>

      {/* ── Contrôles en attente (alert banner on mobile) ──────────────────── */}
      {(inspectionsLoading || pendingInspections.length > 0) && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <ClipboardCheck size={15} className="text-orange-500" /> Contrôles en attente ({pendingInspections.length})
          </h2>
          {inspectionsLoading ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {pendingInspections.map((insp) => (
                <div key={insp.id} className="flex items-center justify-between gap-3 bg-white border border-orange-100 rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Truck size={13} className="text-orange-500 flex-shrink-0" />
                      <span className="font-bold font-mono text-sm truncate">{insp.truck.immatriculation}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug">
                      {new Date(insp.scheduledDate).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                    <Button
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white shrink-0 min-h-[44px] px-3 text-xs"
                      onClick={() => setInspectingId(insp)}
                    >
                      <ClipboardCheck size={13} className="mr-1" /> Contrôle
                    </Button>
                  </div>
              ))}
            </div>
          )}
        </section>
      )}

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
                onViewPhoto={setPhotoDeliveryId}
              />
            ))}
            {confirmedExpress.map(e => (
              <ExpressCard
                key={e.id}
                item={e}
                onConfirm={setConfirmingExpress}
                onViewPhoto={setPhotoDeliveryId}
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
      {photoDeliveryId && (
        <PhotoLightbox deliveryId={photoDeliveryId} onClose={() => setPhotoDeliveryId(null)} />
      )}

      {/* Inspection modal */}
      {inspectingId && (
        <InspectionModal
          inspection={inspectingId}
          onClose={() => setInspectingId(null)}
          onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['my-inspections'] })}
        />
      )}
    </div>
  );
}
