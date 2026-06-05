import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, AlertCircle, Truck as TruckIcon, User, UserPlus, Loader2, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

// Types — matching actual backend response shape
interface TourAssignment {
  id: string;
  chauffeur: { id: string; name: string } | null;
  aide: { id: string; name: string } | null;
  truck: { id: string; immatriculation: string } | null;
}

interface Tour {
  id: string;
  tourCode: string;
  date: string;
  platform: { id: string; name: string; code: string } | null;
  tourType: string | null;
  status: 'imported' | 'assigned' | 'notified' | 'completed' | 'conflict' | 'cancelled';
  nbColis?: number;
  horaire?: string | null;
  assignments: TourAssignment[];
}

interface Employee {
  id: string;
  name: string;
  phone?: string;
  role: 'CHAUFFEUR' | 'AIDE' | 'BOTH';
  isActive: boolean;
  responsibleTruckId: string | null;
}

interface Truck {
  id: string;
  immatriculation: string;
  isAvailable: boolean;
}

interface ToursResponse {
  data: Tour[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface AssignmentData {
  chauffeurId: string;
  aideId?: string;
  truckId: string;
}

export default function Assignments() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [deletingTour, setDeletingTour] = useState<Tour | null>(null);
  const [chauffeurId, setChauffeurId] = useState('');
  const [aideId, setAideId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [truckAutoFilled, setTruckAutoFilled] = useState(false);
  const { toasts, removeToast, success, error } = useToast();
  const queryClient = useQueryClient();

  // Fetch unassigned tours
  const { data: unassignedTours, isLoading: toursLoading } = useQuery({
    queryKey: ['unassigned-tours', selectedDate],
    queryFn: async () => {
      const { data } = await api.get<ToursResponse>('/tours', {
        params: { date: selectedDate, status: 'imported', limit: 200 },
      });
      return data.data;
    },
  });

  // Fetch assigned tours for the day — three separate requests since backend does exact-match on status
  const { data: assignedTours, isLoading: assignedLoading } = useQuery({
    queryKey: ['assigned-tours', selectedDate],
    queryFn: async () => {
      const [assigned, notified, completed] = await Promise.all([
        api.get<ToursResponse>('/tours', { params: { date: selectedDate, status: 'assigned', limit: 200 } }),
        api.get<ToursResponse>('/tours', { params: { date: selectedDate, status: 'notified', limit: 200 } }),
        api.get<ToursResponse>('/tours', { params: { date: selectedDate, status: 'completed', limit: 200 } }),
      ]);
      return [
        ...assigned.data.data,
        ...notified.data.data,
        ...completed.data.data,
      ];
    },
  });

  // Fetch active employees
  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await api.get<Employee[]>('/employees', {
        params: { isActive: true },
      });
      return data;
    },
  });

  // Fetch available trucks
  const { data: trucks } = useQuery({
    queryKey: ['trucks-available'],
    queryFn: async () => {
      const { data } = await api.get<Truck[]>('/trucks', {
        params: { isAvailable: true },
      });
      return data;
    },
  });

  // Assignment mutation
  const assignMutation = useMutation({
    mutationFn: async (assignment: AssignmentData & { tourId: string }) => {
      const { tourId, ...data } = assignment;
      await api.patch(`/tours/${tourId}/assignment`, data);
    },
    onSuccess: () => {
      success('Tour assigned successfully');
      queryClient.invalidateQueries({ queryKey: ['unassigned-tours'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-tours'] });
      queryClient.invalidateQueries({ queryKey: ['trucks-available'] });
      queryClient.invalidateQueries({ queryKey: ['employees-active'] });
      setSelectedTour(null);
      setChauffeurId('');
      setAideId('');
      setTruckId('');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to assign tour');
    },
  });

  // Delete tour mutation
  const deleteMutation = useMutation({
    mutationFn: async (tourId: string) => { await api.delete(`/tours/${tourId}`); },
    onSuccess: () => {
      success('Tournée supprimée');
      setDeletingTour(null);
      if (selectedTour?.id === deletingTour?.id) setSelectedTour(null);
      queryClient.invalidateQueries({ queryKey: ['unassigned-tours'] });
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur suppression'),
  });

  // Unassignment mutation
  const unassignMutation = useMutation({
    mutationFn: async (tourId: string) => {
      await api.delete(`/tours/${tourId}/assignment`);
    },
    onSuccess: () => {
      success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['unassigned-tours'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-tours'] });
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to remove assignment');
    },
  });

  const handleAssign = () => {
    if (!selectedTour || !chauffeurId || !truckId) {
      error('Please select a chauffeur and truck');
      return;
    }

    assignMutation.mutate({
      tourId: selectedTour.id,
      chauffeurId,
      aideId: aideId || undefined,
      truckId,
    });
  };

  // Filter employees by role
  const chauffeurs = employees?.filter((e) => e.role === 'CHAUFFEUR' || e.role === 'BOTH') || [];
  const aides = employees?.filter((e) => e.role === 'AIDE' || e.role === 'BOTH') || [];

  // Check for warnings — chauffeur/truck are nested under assignments[0]
  const chauffeurHasTour = chauffeurId
    ? assignedTours?.some((t) => t.assignments?.[0]?.chauffeur?.id === chauffeurId)
    : false;

  const truckAlreadyAssigned = truckId
    ? assignedTours?.some((t) => t.assignments?.[0]?.truck?.id === truckId)
    : false;

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Affectations</h1>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedTour(null);
            }}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Left Panel: Unassigned Tours */}
        <Card className="p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
            Tournées non assignées ({unassignedTours?.length || 0})
          </h2>

          {toursLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 md:h-24 w-full" />
              ))}
            </div>
          ) : unassignedTours && unassignedTours.length > 0 ? (
            /* Mobile: horizontal scrolling chips; desktop: vertical list */
            <div className="md:hidden flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
              {unassignedTours.map((tour) => (
                <button
                  key={tour.id}
                  onClick={() => { setSelectedTour(tour); setChauffeurId(''); setAideId(''); setTruckId(''); setTruckAutoFilled(false); }}
                  className={`flex-shrink-0 snap-start border rounded-xl px-3 py-2 text-left transition-all min-w-[120px] ${
                    selectedTour?.id === tour.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="font-bold font-mono text-sm">{tour.tourCode}</div>
                  <div className="text-xs text-gray-500">{tour.platform?.name || '—'}</div>
                  {tour.horaire && <div className="text-xs text-gray-400">{tour.horaire}</div>}
                </button>
              ))}
            </div>
          ) : null}
          {unassignedTours && unassignedTours.length > 0 ? (
            <div className="hidden md:block space-y-3 max-h-[600px] overflow-y-auto">
              {unassignedTours.map((tour) => (
                <div
                  key={tour.id}
                  className={`relative border rounded-lg transition-all hover:shadow-md ${
                    selectedTour?.id === tour.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <button
                    className="w-full text-left p-4"
                    onClick={() => {
                      setSelectedTour(tour);
                      setChauffeurId('');
                      setAideId('');
                      setTruckId('');
                      setTruckAutoFilled(false);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg">{tour.tourCode}</h3>
                      <Badge variant="outline" className="ml-2">
                        {tour.platform?.name || '-'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                      {tour.tourType && (
                        <span className="flex items-center gap-1">
                          <TruckIcon className="w-4 h-4" />
                          {tour.tourType}
                        </span>
                      )}
                      {tour.nbColis && <span>{tour.nbColis} colis</span>}
                      {tour.horaire && <span>{tour.horaire}</span>}
                    </div>
                  </button>
                  <button
                    onClick={() => setDeletingTour(tour)}
                    className="absolute top-2 right-2 p-1.5 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="hidden md:block text-center py-12 text-gray-500">
              <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune tournée non assignée pour cette date</p>
            </div>
          )}
        </Card>

        {/* Right Panel: Assignment Form */}
        <Card className="p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Formulaire d'affectation</h2>

          {selectedTour ? (
            <div className="space-y-6">
              {/* Tour Summary */}
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="font-semibold mb-2">Selected Tour</h3>
                <p className="text-sm text-gray-600">
                  <strong>Code:</strong> {selectedTour.tourCode}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Platform:</strong> {selectedTour.platform?.name || '-'}
                </p>
                {selectedTour.tourType && (
                  <p className="text-sm text-gray-600">
                    <strong>Type:</strong> {selectedTour.tourType}
                  </p>
                )}
              </div>

              {/* Chauffeur Select */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Chauffeur <span className="text-red-500">*</span>
                </label>
                <Select
                  value={chauffeurId}
                  onValueChange={(val) => {
                    setChauffeurId(val);
                    const emp = chauffeurs.find((e) => e.id === val);
                    if (emp?.responsibleTruckId) {
                      setTruckId(emp.responsibleTruckId);
                      setTruckAutoFilled(true);
                    } else if (truckAutoFilled) {
                      setTruckId('');
                      setTruckAutoFilled(false);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un chauffeur" />
                  </SelectTrigger>
                  <SelectContent>
                    {chauffeurs.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {emp.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chauffeurHasTour && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Cet employé a déjà une tournée assignée aujourd'hui</span>
                  </div>
                )}
              </div>

              {/* Aide Select */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Aide (optional)</label>
                <Select
                  value={aideId || 'none'}
                  onValueChange={(value) => setAideId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select aide" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {aides
                      .filter((e) => e.id !== chauffeurId)
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            {emp.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Truck Select */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Camion <span className="text-red-500">*</span>
                </label>
                <Select
                  value={truckId}
                  onValueChange={(val) => { setTruckId(val); setTruckAutoFilled(false); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un camion" />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks?.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        <div className="flex items-center gap-2">
                          <TruckIcon className="w-4 h-4" />
                          {truck.immatriculation}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {truckAutoFilled && (
                  <p className="text-xs text-gray-400">Camion habituel de ce chauffeur</p>
                )}
                {truckAlreadyAssigned && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Ce camion est déjà assigné à une autre tournée aujourd'hui</span>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleAssign}
                disabled={!chauffeurId || !truckId || assignMutation.isPending}
                className="w-full"
              >
                {assignMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  'Assign Tour'
                )}
              </Button>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a tour from the left to assign</p>
            </div>
          )}
        </Card>
      </div>

      {/* Today's Assignments */}
      <Card className="p-4 md:p-6">
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          Affectations du jour ({assignedTours?.length || 0})
        </h2>

        {assignedLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !assignedTours?.length ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            Aucune affectation pour cette date
          </div>
        ) : (
          <>
            {/* ── Desktop table ─────────────────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left">
                    {['Code', 'Plateforme', 'Chauffeur', 'Aide', 'Camion', 'Statut', 'Actions'].map(h => (
                      <th key={h} className="pb-3 text-sm font-medium text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignedTours.map((tour) => {
                    const asgn = tour.assignments?.[0];
                    return (
                      <tr key={tour.id} className="border-b last:border-0">
                        <td className="py-3 font-mono font-semibold">{tour.tourCode}</td>
                        <td className="py-3 text-sm">{tour.platform?.name || '—'}</td>
                        <td className="py-3 text-sm">{asgn?.chauffeur?.name || '—'}</td>
                        <td className="py-3 text-sm">{asgn?.aide?.name || '—'}</td>
                        <td className="py-3 text-sm font-mono">{asgn?.truck?.immatriculation || '—'}</td>
                        <td className="py-3">
                          <Badge className={
                            tour.status === 'assigned' ? 'bg-blue-100 text-blue-800'
                            : tour.status === 'notified' ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                          }>{tour.status}</Badge>
                        </td>
                        <td className="py-3">
                          <Button variant="ghost" size="sm"
                            onClick={() => unassignMutation.mutate(tour.id)}
                            disabled={unassignMutation.isPending}>
                            Désassigner
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards ──────────────────────────────────── */}
            <div className="block md:hidden space-y-2">
              {assignedTours.map((tour) => {
                const asgn = tour.assignments?.[0];
                const statusCls = tour.status === 'assigned' ? 'bg-blue-100 text-blue-800'
                  : tour.status === 'notified' ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800';
                const typeColors: Record<string, string> = {
                  STANDARD: 'bg-blue-100 text-blue-700',
                  GV:       'bg-violet-100 text-violet-700',
                  INSTALL:  'bg-amber-100 text-amber-700',
                  MONO:     'bg-teal-100 text-teal-700',
                  SPECIAL:  'bg-pink-100 text-pink-700',
                };
                const typeLabel: Record<string, string> = {
                  STANDARD: 'Standard', GV: 'GV', INSTALL: 'Install',
                  MONO: 'Mono', SPECIAL: 'Spéciale',
                };
                const tourTypeKey = (tour.tourType ?? '').toUpperCase();
                const typeCls  = typeColors[tourTypeKey] ?? 'bg-gray-100 text-gray-600';
                const typeText = typeLabel[tourTypeKey] ?? tour.tourType;

                return (
                  <div key={tour.id} className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm space-y-2">
                    {/* Row 1: code + type + platform */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-sm">{tour.tourCode}</span>
                        {typeText && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeCls}`}>
                            {typeText}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-medium truncate max-w-[100px]">
                        {tour.platform?.name || '—'}
                      </span>
                    </div>

                    {/* Row 2: employees */}
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Users size={11} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        {asgn?.chauffeur?.name || '—'}
                        {asgn?.aide && <> <span className="text-gray-400">+</span> {asgn.aide.name}</>}
                      </span>
                    </div>

                    {/* Row 3: truck + status + unassign */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {asgn?.truck && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <TruckIcon size={11} className="text-gray-400 flex-shrink-0" />
                            <span className="font-mono">{asgn.truck.immatriculation}</span>
                          </div>
                        )}
                        <Badge className={`text-[10px] h-5 px-1.5 ${statusCls}`}>{tour.status}</Badge>
                      </div>
                      <Button variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 flex-shrink-0"
                        onClick={() => unassignMutation.mutate(tour.id)}
                        disabled={unassignMutation.isPending}>
                        Désassigner
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Delete confirmation dialog */}
      {deletingTour && (
        <Dialog open onOpenChange={o => { if (!o) setDeletingTour(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 size={18} /> Supprimer la tournée
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm text-gray-700">
                Supprimer la tournée <strong className="font-mono">{deletingTour.tourCode}</strong> du{' '}
                <strong>{new Date(deletingTour.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</strong> ?
              </p>
              <p className="text-xs text-red-600">Cette action est irréversible.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingTour(null)}>Annuler</Button>
              <Button
                onClick={() => deleteMutation.mutate(deletingTour.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending
                  ? <Loader2 size={14} className="mr-1 animate-spin" />
                  : <Trash2 size={14} className="mr-1" />}
                Supprimer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
