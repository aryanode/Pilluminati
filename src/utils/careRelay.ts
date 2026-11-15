import type {
  CareCircleMember,
  CaregiverAvailabilityStatus,
  CaregiverTier,
  ScheduledDoseInstance,
} from '../types/pilluminati';

export function formatAvailabilityStatusLabel(
  status?: CaregiverAvailabilityStatus,
): 'Available' | 'Busy' | 'Away' {
  if (status === 'busy') return 'Busy';
  if (status === 'away') return 'Away';
  return 'Available';
}

export function formatCaregiverTierLabel(
  tier?: CaregiverTier,
): 'Primary Caregiver' | 'Backup Caregiver' {
  return tier === 'backup' ? 'Backup Caregiver' : 'Primary Caregiver';
}

const AVAILABILITY_RANK: Record<CaregiverAvailabilityStatus, number> = {
  available: 0,
  busy: 1,
  away: 2,
};

export function sortCaregiversByTier(
  caregivers: CareCircleMember[],
): CareCircleMember[] {
  return [...caregivers]
    .filter((m) => m.role === 'caregiver' && m.status !== 'revoked')
    .sort((a, b) => {
      const aTier = a.caregiverTier === 'backup' ? 1 : 0;
      const bTier = b.caregiverTier === 'backup' ? 1 : 0;
      if (aTier !== bTier) return aTier - bTier;

      const aAvail = AVAILABILITY_RANK[a.availabilityStatus ?? 'available'];
      const bAvail = AVAILABILITY_RANK[b.availabilityStatus ?? 'available'];
      if (aAvail !== bAvail) return aAvail - bAvail;

      return a.name.localeCompare(b.name);
    });
}

export function partitionCaregiversByTier(members: CareCircleMember[]): {
  primary: CareCircleMember[];
  backup: CareCircleMember[];
  availableCount: number;
} {
  const sorted = sortCaregiversByTier(members);
  const primary = sorted.filter((m) => (m.caregiverTier ?? 'primary') === 'primary');
  const backup = sorted.filter((m) => m.caregiverTier === 'backup');
  const availableCount = sorted.filter(
    (m) => (m.availabilityStatus ?? 'available') === 'available',
  ).length;
  return { primary, backup, availableCount };
}

export function findUnconfirmedDoseInstances(
  instances: ScheduledDoseInstance[],
): ScheduledDoseInstance[] {
  return instances.filter((inst) => inst.status === 'unconfirmed');
}

export function deriveAppointmentTitle(input: {
  title?: string;
  specialty?: string;
  doctorName: string;
}): string {
  const explicit = (input.title ?? '').trim();
  if (explicit) return explicit.slice(0, 140);
  const spec = (input.specialty ?? '').trim();
  const doc = input.doctorName.trim();
  if (spec && doc) return `${spec} — ${doc}`.slice(0, 140);
  if (spec) return `${spec} Visit`.slice(0, 140);
  if (doc) return `Visit with ${doc}`.slice(0, 140);
  return 'Clinic Visit';
}
