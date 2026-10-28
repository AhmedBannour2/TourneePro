import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Truck, AlertCircle, Users, Upload, Package, UserX, Recycle, TrendingUp } from 'lucide-react';

interface DashboardStats {
  toursToday: number;
  unassigned: number;
  activeEmployees: number;
  importErrors: number;
}

interface ReportTotals {
  totalClients: number; delivered: number; absent: number; nonConform: number; d3e: number;
  deliveryRate: number;
}

interface PlatformReport extends ReportTotals {
  platformId: string; platformName: string;
}

interface MonthlyReport {
  month: string;
  confirmedTours: number;
  global: ReportTotals;
  byPlatform: PlatformReport[];
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function Dashboard() {
  usePageTitle('Tableau de bord');
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

  const [reportMonth, setReportMonth] = useState(currentMonth());
  const { data: report, isLoading: reportLoading } = useQuery<MonthlyReport>({
    queryKey: ['monthly-report', reportMonth],
    queryFn: () => api.get(`/tours/dashboard/monthly-report?month=${reportMonth}`).then(r => r.data),
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

      {/* Monthly delivery report */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base md:text-lg">Rapport mensuel de livraison</CardTitle>
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {reportLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />)}
            </div>
          ) : !report || report.confirmedTours === 0 ? (
            <p className="text-sm text-gray-500">Aucune tournée confirmée pour ce mois.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">{report.confirmedTours} tournée(s) confirmée(s)</p>
              <ReportTotalsRow totals={report.global} />
              {report.byPlatform.length > 1 && (
                <div className="space-y-2">
                  {report.byPlatform.map((p) => (
                    <div key={p.platformId}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{p.platformName}</p>
                      <ReportTotalsRow totals={p} compact />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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

function ReportTotalsRow({ totals, compact }: { totals: ReportTotals; compact?: boolean }) {
  const items = [
    { label: 'Livrés', value: totals.delivered, icon: Package, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Absents', value: totals.absent, icon: UserX, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: 'D3E', value: totals.d3e, icon: Recycle, color: 'text-teal-700', bg: 'bg-teal-50' },
    { label: 'Taux de livraison', value: `${totals.deliveryRate}%`, icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`rounded-lg p-3 ${compact ? '' : item.bg}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-500">{item.label}</p>
              <Icon className={`h-3.5 w-3.5 ${item.color}`} />
            </div>
            <p className="text-lg font-bold text-gray-900">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}
