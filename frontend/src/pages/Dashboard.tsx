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
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Error state */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
          Failed to load dashboard stats. Please check your connection or try again later.
        </div>
      )}

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-md ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? (
                    <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
                  ) : (
                    stat.value
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Welcome message */}
      <Card>
        <CardHeader>
          <CardTitle>Welcome to TourneePro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            Your logistics management dashboard. Use the sidebar to navigate to different sections.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
