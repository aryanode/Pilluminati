import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CareProvider } from './context/CareContext';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AuthPage } from './pages/AuthPage';
import { CaregiversPage } from './pages/CaregiversPage';
import { CompanionPage } from './pages/CompanionPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmergencyTokenPage } from './pages/EmergencyTokenPage';
import { HistoryPage } from './pages/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { MedicationsPage } from './pages/MedicationsPage';
import { PassportPage } from './pages/PassportPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

function AutostartHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('autostart') === '1' && location.pathname === '/') {
      navigate('/auth', { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}

export default function App() {
  return (
    <CareProvider>
      <BrowserRouter>
        <AutostartHandler />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/emergency/:token" element={<EmergencyTokenPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medications"
            element={
              <ProtectedRoute>
                <MedicationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                <AppointmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caregivers"
            element={
              <ProtectedRoute>
                <CaregiversPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/passport"
            element={
              <ProtectedRoute>
                <PassportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companion"
            element={
              <ProtectedRoute>
                <CompanionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CareProvider>
  );
}
