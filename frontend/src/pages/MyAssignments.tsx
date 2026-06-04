import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Truck, Users, Clock, Phone,
  CheckCircle2, ClipboardCheck, History,
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
  totalClients: number; delivered: number; absent: number; nonConform: number;
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

// ── Confirm modal ──────────────────────────────────────────────────────────────

interface Fields { totalClients: string; delivered: string; absent: string; nonConform: string; notes: string }
const EMPTY: Fields = { totalClients: '', delivered: '', absent: '', nonConform: '', notes: '' };
const fromConf = (c: TourConfirmation): Fields => ({
  totalClients: String(c.totalClients), delivered: String(c.delivered),
  absent: String(c.absent), nonConform: String(c.nonConform), notes: c.notes ?? '',
});

function ConfirmModal({ tour, onClose, onSaved }: { tour: TourItem; onClose: () => void; onSaved: () => void }) {
  const isEdit = tour.confirmationStatus === 'CONFIRMED';
  const [f, setF] = useState<Fields>(isEdit && tour.confirmation ? fromConf(tour.confirmation) : EMPTY);
  const { success, error, toasts, removeToast } = useToast();

  const n = (v: string) => (v === '' ? 0 : parseInt(v, 10) || 0);
  const total = n(f.totalClients);
  const sum   = n(f.delivered) + n(f.absent) + n(f.nonConform);
  const valid = total > 0 && sum <= total;
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
                <span>{n(f.delivered)} + {n(f.absent)} + {n(f.nonConform)} = {sum}</span>
                <span>/ Total: {total}</span>
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
            <Button onClick={() => mut.mutate({ totalClients: n(f.totalClients), delivered: n(f.delivered), absent: n(f.absent), nonConform: n(f.nonConform), notes: f.notes || undefined })}
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
    <Card className={`p-4 border ${confirmed ? 'border-green-200 bg-green-50/20' : isPast ? 'border-orange-200 bg-orange-50/20' : 'border-gray-200'}`}>
      <div className="flex items-start gap-4 justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-bold text-lg font-mono">{tour.tourCode}</span>
            <Badge className={tour.myRole === 'chauffeur' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
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

        <Button size="sm"
          variant={confirmed ? 'outline' : 'default'}
          className={`shrink-0 ${confirmed ? 'border-green-300 text-green-700 hover:bg-green-50' : isPast ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          onClick={() => onConfirm(tour)}>
          <ClipboardCheck size={14} className="mr-1" />
          {confirmed ? 'Modifier' : 'Confirmer'}
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyAssignments() {
  const queryClient = useQueryClient();
  const [confirmingTour, setConfirmingTour] = useState<TourItem | null>(null);

  const { data, isLoading, isError } = useQuery<AssignmentsResponse>({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<AssignmentsResponse>('/employees/me/assignments').then(r => r.data),
  });

  useEffect(() => {
    const all = [...(data?.upcoming ?? []), ...(data?.history ?? [])];
    all.forEach(a => api.post(`/tours/${a.id}/assignment/seen`).catch(() => {}));
  }, [data]);

  const upcoming = data?.upcoming ?? [];
  const history  = data?.history  ?? [];

  return (
    <div className="space-y-6">
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

      {confirmingTour && (
        <ConfirmModal
          tour={confirmingTour}
          onClose={() => setConfirmingTour(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['my-assignments'] })}
        />
      )}
    </div>
  );
}
