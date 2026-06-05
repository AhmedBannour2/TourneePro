import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, AlertCircle, Users, Upload } from 'lucide-react';

interface DashboardStats {
  toursToday: number;
  unassigned: number;
  activeEmployees: number;
  importErrors: number;
}

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/tours/dashboard/stats');
      return response.data;
    },
    // Default to 0 values while loading or on error
    placeholderData: {
      toursToday: 0,
      unassigned: 0,
      activeEmployees: 0,
      importErrors: 0,
    },
  });

  const statCards = [
    {
      title: 'Tours Today',
      value: stats?.toursToday ?? 0,
      icon: Truck,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Unassigned',
      value: stats?.unassigned ?? 0,
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Active Employees',
      value: stats?.activeEmployees ?? 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Import Errors',
      value: stats?.importErrors ?? 0,
      icon: Upload,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          Impossible de charger les statistiques. Vérifiez votre connexion.
        </div>
      )}

      {/* Stat cards — 2 columns on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 leading-snug">{stat.title}</p>
                  <div className={`p-1.5 rounded-md flex-shrink-0 ${stat.bgColor}`}>
                    <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {isLoading ? <div className="h-7 w-12 bg-gray-200 animate-pulse rounded" /> : stat.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Welcome */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Bienvenue sur TourneePro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Plateforme de gestion logistique STP. Utilisez la navigation pour accéder aux différentes sections.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
