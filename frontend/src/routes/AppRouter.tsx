import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/layout/AppShell';
import Dashboard from '@/pages/Dashboard';
import EmployeeDashboard from '@/pages/EmployeeDashboard';
import Tours from '@/pages/Tours';
import Employees from '@/pages/Employees';
import Trucks from '@/pages/Trucks';
import ExpressDeliveries from '@/pages/ExpressDeliveries';
import WorkedDays from '@/pages/WorkedDays';
import Settings from '@/pages/Settings';
import MyAssignments from '@/pages/MyAssignments';
import MyWorkedDays from '@/pages/MyWorkedDays';
import Login from '@/pages/Login';

function RootPage() {
  const { user } = useAuth();
  return user?.role === 'EMPLOYEE' ? <EmployeeDashboard /> : <Dashboard />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<RootPage />} />
                    <Route path="/tours" element={<Tours />} />
                    <Route path="/express" element={<ExpressDeliveries />} />
                    <Route path="/employees" element={<Employees />} />
                    <Route path="/trucks" element={<Trucks />} />
                    <Route path="/worked-days" element={<WorkedDays />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/my-assignments" element={<MyAssignments />} />
                    <Route path="/my-worked-days" element={<MyWorkedDays />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
