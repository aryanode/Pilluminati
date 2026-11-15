import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { CaregiverDashboard } from '../components/dashboards/CaregiverDashboard';
import { FamilyDashboard } from '../components/dashboards/FamilyDashboard';
import { PatientDashboard } from '../components/dashboards/PatientDashboard';
import { Button, Skeleton } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';

export function DashboardPage() {
  const { activeRole, authLoading, activePatientProfile } = useCare();

  const headerConfig = {
    patient: {
      title: 'My Daily Care Home',
      subtitle: 'One-tap medication confirmation and today’s schedule.',
      action: (
        <Link to="/companion">
          <Button size="sm" variant="lavender">
            Ask Pillu
          </Button>
        </Link>
      ),
    },
    caregiver: {
      title: 'Caregiver Command Center',
      subtitle: 'Monitor adherence, resolve unconfirmed doses, and coordinate Care Relay.',
      action: (
        <Link to="/medications">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Add Medication
          </Button>
        </Link>
      ),
    },
    family: {
      title: 'Family Care Overview',
      subtitle: `Stay connected with ${activePatientProfile?.fullName || 'your loved one'}’s wellness according to shared permissions.`,
      action: (
        <Link to="/caregivers">
          <Button size="sm" variant="secondary">
            Care Team & Relay
          </Button>
        </Link>
      ),
    },
  }[activeRole];

  return (
    <AppShell
      title={headerConfig.title}
      subtitle={headerConfig.subtitle}
      primaryAction={headerConfig.action}
    >
      {authLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : activeRole === 'patient' ? (
        <PatientDashboard />
      ) : activeRole === 'caregiver' ? (
        <CaregiverDashboard />
      ) : (
        <FamilyDashboard />
      )}
    </AppShell>
  );
}
