import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, AlertCircle, Truck as TruckIcon, User, UserPlus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [chauffeurId, setChauffeurId] = useState('');
  const [aideId, setAideId] = useState('');
  const [truckId, setTruckId] = useState('');
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
        <h1 className="text-2xl font-bold">Assignment Board</h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Unassigned Tours */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Unassigned Tours ({unassignedTours?.length || 0})
          </h2>

          {toursLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : unassignedTours && unassignedTours.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {unassignedTours.map((tour) => (
                <button
                  key={tour.id}
                  onClick={() => {
                    setSelectedTour(tour);
                    setChauffeurId('');
                    setAideId('');
                    setTruckId('');
                  }}
                  className={`w-full text-left p-4 border rounded-lg transition-all hover:shadow-md ${
                    selectedTour?.id === tour.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
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
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No unassigned tours for this date</p>
            </div>
          )}
        </Card>

        {/* Right Panel: Assignment Form */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Assignment Form</h2>

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
                <Select value={chauffeurId} onValueChange={setChauffeurId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select chauffeur" />
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
                    <span>This employee already has a tour assigned today</span>
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
                  Truck <span className="text-red-500">*</span>
                </label>
                <Select value={truckId} onValueChange={setTruckId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck" />
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
                {truckAlreadyAssigned && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>This truck is already assigned to another tour today</span>
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

      {/* Today's Assignments Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          Today's Assignments ({assignedTours?.length || 0})
        </h2>

        {assignedLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : assignedTours && assignedTours.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium text-gray-700">Tour Code</th>
                  <th className="pb-3 font-medium text-gray-700">Platform</th>
                  <th className="pb-3 font-medium text-gray-700">Chauffeur</th>
                  <th className="pb-3 font-medium text-gray-700">Aide</th>
                  <th className="pb-3 font-medium text-gray-700">Truck</th>
                  <th className="pb-3 font-medium text-gray-700">Status</th>
                  <th className="pb-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignedTours.map((tour) => {
                  const asgn = tour.assignments?.[0];
                  return (
                  <tr key={tour.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{tour.tourCode}</td>
                    <td className="py-3">{tour.platform?.name || '-'}</td>
                    <td className="py-3">{asgn?.chauffeur?.name || '-'}</td>
                    <td className="py-3">{asgn?.aide?.name || '-'}</td>
                    <td className="py-3">{asgn?.truck?.immatriculation || '-'}</td>
                    <td className="py-3">
                      <Badge
                        className={
                          tour.status === 'assigned'
                            ? 'bg-blue-100 text-blue-800'
                            : tour.status === 'notified'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }
                      >
                        {tour.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unassignMutation.mutate(tour.id)}
                        disabled={unassignMutation.isPending}
                      >
                        Unassign
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No assignments for this date</p>
          </div>
        )}
      </Card>
    </div>
  );
}
