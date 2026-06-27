import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Truck, Users, Clock, MapPin, Calendar, ChevronRight, Package, Phone,
  ClipboardCheck, CheckCircle2, AlertTriangle, Camera, X, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface PendingInspection {
  id: string;
  scheduledDate: string;
  truck: { id: string; immatriculation: string };
  assignedTo: { id: string; name: string };
}

const CHECKLIST_ITEMS = [
  { key: 'HUILE',         label: "Niveau d'huile" },
  { key: 'RADIATEUR',     label: 'Eau du radiateur' },
  { key: 'CAISSE_OUTILS', label: 'Caisse à outils' },
  { key: 'CHARIOT',       label: 'Chariot' },
  { key: 'ROULETTES',     label: 'Roulettes' },
  { key: 'COUVERCLE',     label: 'Couvercle de produit' },
] as const;

type CheckKey = typeof CHECKLIST_ITEMS[number]['key'];
type CheckStatus = 'OK' | 'PROBLEME';

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
    await api.post(`/inspections/${inspectionId}/photos`, fd);
  };

  const handleSubmit = async () => {
    if (!allSelected) return;
    setSubmitting(true);
    setErrorMsg('');
    setPhotoRetryId(null);
    try {
      const items = CHECKLIST_ITEMS.map(({ key }) => ({
        item: key,
        status: selections[key]!,
        comment: itemComments[key] || undefined,
      }));
      await api.post(`/inspections/${inspection.id}/submit`, { items, generalComment: generalComment || undefined });
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Erreur lors de la soumission.');
      setSubmitting(false);
      return;
    }
    if (photos.length > 0) {
      try {
        await uploadPhotosFor(inspection.id);
      } catch {
        setPhotoRetryId(inspection.id);
        setErrorMsg("Contrôle soumis mais erreur lors de l'envoi des photos.");
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
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map(({ key, label }) => {
              const sel = selections[key];
              return (
                <div key={key} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <span className="text-sm font-medium">{label}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelections((p) => ({ ...p, [key]: 'OK' }))}
                        className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${sel === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
                        <CheckCircle2 size={15} /> OK
                      </button>
                      <button type="button" onClick={() => setSelections((p) => ({ ...p, [key]: 'PROBLEME' }))}
                        className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${sel === 'PROBLEME' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-500 border-gray-200 hover:border-red-300'}`}>
                        <AlertTriangle size={15} /> Problème
                      </button>
                    </div>
                  </div>
                  {sel === 'PROBLEME' && (
                    <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                      <input type="text" placeholder="Décrire le problème…" value={itemComments[key]}
                        onChange={(e) => setItemComments((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full text-sm bg-white border border-red-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire général / problème moteur</label>
            <textarea rows={3} placeholder="Observations générales, anomalies moteur…" value={generalComment}
              onChange={(e) => setGeneralComment(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <Camera size={14} /> Photos ({photos.length}/5)
            </label>
            {photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`photo-${i}`} className="h-20 w-20 object-cover rounded-lg border" />
                    <button type="button" onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full p-0.5 shadow-sm hover:bg-red-50">
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
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          {errorMsg && (
            <div className={`text-sm rounded px-3 py-2 border ${photoRetryId ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-600'}`}>
              <p>{errorMsg}</p>
              {photoRetryId && (
                <button type="button" onClick={retryPhotos} disabled={submitting}
                  className="mt-1.5 text-xs font-semibold underline hover:no-underline disabled:opacity-50">
                  {submitting ? 'Envoi en cours…' : 'Réessayer les photos'}
                </button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{photoRetryId ? 'Fermer' : 'Annuler'}</Button>
          {!photoRetryId && (
            <Button onClick={handleSubmit} disabled={!allSelected || submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {submitting ? <><Loader2 size={14} className="mr-1 animate-spin" />Envoi…</> : 'Soumettre le contrôle'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssignmentItem {
  id: string;
  tourCode: string;
  date: string;
  status: string;
  platform: string;
  quai: string | null;
  horaire: string | null;
  myRole: 'chauffeur' | 'aide';
  partner: { id: string; name: string; phone: string | null } | null;
  truck: { immatriculation: string } | null;
}

interface DashboardData {
  upcoming: AssignmentItem[];
  history: AssignmentItem[];
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isTomorrow(dateStr: string) {
  const d = new Date(dateStr);
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  return (
    d.getFullYear() === tom.getFullYear() &&
    d.getMonth() === tom.getMonth() &&
    d.getDate() === tom.getDate()
  );
}

function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...options,
  });
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    assigned: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    imported: 'bg-gray-100 text-gray-700',
    notified: 'bg-purple-100 text-purple-800',
    conflict: 'bg-red-100 text-red-800',
    cancelled: 'bg-red-50 text-red-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

function TodayCard({ item }: { item: AssignmentItem }) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-blue-200 text-sm font-medium uppercase tracking-wide mb-1">
            Aujourd'hui
          </p>
          <h2 className="text-3xl font-bold">Tour {item.tourCode}</h2>
          <p className="text-blue-200 mt-1">{formatDate(item.date)}</p>
        </div>
        <Badge className="bg-white/20 text-white border-0 text-xs">
          {item.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-blue-200 text-xs uppercase tracking-wide mb-1">Platform</p>
          <p className="font-semibold text-lg">{item.platform}</p>
        </div>
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-blue-200 text-xs uppercase tracking-wide mb-1">Quai</p>
          <p className="font-semibold text-lg">{item.quai ?? '—'}</p>
        </div>
        <div className="bg-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-200 text-xs uppercase tracking-wide mb-1">
            <Clock className="w-3 h-3" />
            Horaire
          </div>
          <p className="font-semibold text-lg">{item.horaire ?? '—'}</p>
        </div>
        <div className="bg-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-200 text-xs uppercase tracking-wide mb-1">
            <Truck className="w-3 h-3" />
            Camion
          </div>
          <p className="font-semibold text-lg font-mono">
            {item.truck?.immatriculation ?? '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 bg-white/10 rounded-xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-blue-200 text-xs uppercase tracking-wide">
            {item.myRole === 'chauffeur' ? 'Aide-livreur' : 'Chauffeur'}
          </p>
          <p className="font-semibold">
            {item.partner?.name ?? 'Non assigné'}
          </p>
          {item.partner?.phone && (
            <a
              href={`tel:${item.partner.phone}`}
              className="flex items-center gap-1 mt-1 text-blue-200 hover:text-white text-sm transition-colors"
            >
              <Phone className="w-3 h-3" />
              {item.partner.phone}
            </a>
          )}
        </div>
        <Badge className="ml-auto shrink-0 bg-white/20 text-white border-0 text-xs">
          {item.myRole === 'chauffeur' ? 'Vous conduisez' : 'Vous aidez'}
        </Badge>
      </div>
    </div>
  );
}

function UpcomingCard({ item }: { item: AssignmentItem }) {
  const label = isTomorrow(item.date) ? 'Demain' : formatDate(item.date, { weekday: 'long', day: '2-digit', month: 'short' });
  return (
    <Card className="p-5 border-l-4 border-l-indigo-400">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-indigo-600 text-xs font-semibold uppercase tracking-wide">{label}</p>
          <h3 className="text-xl font-bold mt-0.5">Tour {item.tourCode}</h3>
        </div>
        <Badge className={statusColor(item.status)}>{item.status}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Platform</p>
          <p className="font-medium">{item.platform}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Quai</p>
          <p className="font-medium">{item.quai ?? '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Horaire</p>
          <p className="font-medium">{item.horaire ?? '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Camion</p>
          <p className="font-medium font-mono">{item.truck?.immatriculation ?? '—'}</p>
        </div>
      </div>
      {item.partner && (
        <div className="mt-3 pt-3 border-t flex items-start gap-2 text-sm text-gray-600">
          <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <span>
              {item.myRole === 'chauffeur' ? 'Aide :' : 'Chauffeur :'}{' '}
              <span className="font-medium text-gray-800">{item.partner.name}</span>
            </span>
            {item.partner.phone && (
              <a
                href={`tel:${item.partner.phone}`}
                className="flex items-center gap-1 mt-0.5 text-indigo-600 hover:text-indigo-800 text-xs transition-colors"
              >
                <Phone className="w-3 h-3" />
                {item.partner.phone}
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function EmployeeDashboard() {
  usePageTitle('Mon espace');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inspectingId, setInspectingId] = useState<PendingInspection | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employee-dashboard'],
    queryFn: async () => {
      const { data } = await api.get<DashboardData>('/employees/me/dashboard');
      return data;
    },
  });

  const { data: pendingInspections = [], isLoading: inspectionsLoading } = useQuery<PendingInspection[]>({
    queryKey: ['my-inspections'],
    queryFn: () => api.get<PendingInspection[]>('/employees/me/inspections').then(r => r.data),
  });

  useEffect(() => {
    if (!data) return;
    const all = [...data.upcoming, ...data.history];
    all.forEach(a => api.post(`/tours/${a.id}/assignment/seen`).catch(() => {}));
  }, [data]);

  const today = data?.upcoming.find((a) => isToday(a.date)) ?? null;
  const tomorrow = data?.upcoming.find((a) => isTomorrow(a.date)) ?? null;
  const laterUpcoming = data?.upcoming.filter((a) => !isToday(a.date) && !isTomorrow(a.date)) ?? [];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-10 text-center text-gray-500">
        Aucun profil employé n'est lié à ce compte. Contactez votre administrateur.
      </Card>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 w-full max-w-3xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {user?.email?.split('@')[0]} !
        </h1>
        <p className="text-gray-500 mt-1">Voici votre programme de livraisons.</p>
      </div>

      {/* Today */}
      {today ? (
        <TodayCard item={today} />
      ) : (
        <Card className="p-8 text-center border-dashed">
          <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500 font-medium">Pas de tournée assignée aujourd'hui</p>
        </Card>
      )}

      {/* Pending inspections */}
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

      {/* Tomorrow + later upcoming */}
      {(tomorrow || laterUpcoming.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <ChevronRight className="w-5 h-5 text-gray-400" />
            Prochaines tournées
          </h2>
          {tomorrow && <UpcomingCard item={tomorrow} />}
          {laterUpcoming.map((a) => (
            <UpcomingCard key={a.id} item={a} />
          ))}
        </div>
      )}

      {/* History */}
      {data && data.history.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            Historique des 30 derniers jours
          </h2>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Tour</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Platform</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Quai</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Horaire</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Équipier</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Camion</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {new Date(a.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-semibold">{a.tourCode}</td>
                      <td className="px-4 py-3">{a.platform}</td>
                      <td className="px-4 py-3">
                        {a.quai ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {a.quai}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.horaire ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {a.horaire}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.partner ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-gray-400 shrink-0" />
                              <span>{a.partner.name}</span>
                            </div>
                            {a.partner.phone && (
                              <a
                                href={`tel:${a.partner.phone}`}
                                className="flex items-center gap-1 mt-0.5 text-indigo-600 hover:text-indigo-800 text-xs transition-colors"
                              >
                                <Phone className="w-3 h-3" />
                                {a.partner.phone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {a.truck?.immatriculation ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusColor(a.status)}`}>
                          {a.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {data && data.upcoming.length === 0 && data.history.length === 0 && (
        <Card className="p-12 text-center">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-gray-500">Aucune tournée dans votre historique.</p>
        </Card>
      )}

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
