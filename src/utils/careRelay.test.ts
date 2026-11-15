import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAppointmentTitle,
  findUnconfirmedDoseInstances,
  formatAvailabilityStatusLabel,
  formatCaregiverTierLabel,
  partitionCaregiversByTier,
  sortCaregiversByTier,
} from './careRelay';
import type { CareCircleMember, ScheduledDoseInstance } from '../types/pilluminati';

test('Care Relay sorts and partitions Primary and Backup caregivers cleanly', () => {
  const members: CareCircleMember[] = [
    {
      id: 'pat_1',
      name: 'Eleanor Vance',
      role: 'patient',
      relation: 'Owner',
      phone: '',
      email: '',
      avatarUrl: '',
      lastActive: 'Owner',
    },
    {
      id: 'rel_backup_away',
      name: 'Samira Khan',
      role: 'caregiver',
      relation: 'Backup Nurse',
      phone: '',
      email: '',
      avatarUrl: '',
      status: 'active',
      caregiverTier: 'backup',
      availabilityStatus: 'away',
      lastActive: 'Backup',
    },
    {
      id: 'rel_primary_avail',
      name: 'Maya Lin',
      role: 'caregiver',
      relation: 'Primary RN',
      phone: '',
      email: '',
      avatarUrl: '',
      status: 'active',
      caregiverTier: 'primary',
      availabilityStatus: 'available',
      lastActive: 'Primary',
    },
    {
      id: 'rel_revoked',
      name: 'Former Aide',
      role: 'caregiver',
      relation: 'Former',
      phone: '',
      email: '',
      avatarUrl: '',
      status: 'revoked',
      caregiverTier: 'backup',
      availabilityStatus: 'available',
      lastActive: 'Revoked',
    },
  ];

  const sorted = sortCaregiversByTier(members);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].name, 'Maya Lin');
  assert.equal(sorted[1].name, 'Samira Khan');

  const partitioned = partitionCaregiversByTier(members);
  assert.equal(partitioned.primary.length, 1);
  assert.equal(partitioned.backup.length, 1);
  assert.equal(partitioned.availableCount, 1);
  assert.equal(formatCaregiverTierLabel(partitioned.backup[0].caregiverTier), 'Backup Caregiver');
  assert.equal(formatAvailabilityStatusLabel(partitioned.backup[0].availabilityStatus), 'Away');
  assert.equal(formatAvailabilityStatusLabel('busy'), 'Busy');
  assert.equal(formatAvailabilityStatusLabel(undefined), 'Available');
});

test('deriveAppointmentTitle uses explicit title or falls back to specialty and doctorName', () => {
  assert.equal(
    deriveAppointmentTitle({
      title: 'Annual Heart Check',
      specialty: 'Cardiology',
      doctorName: 'Dr. Patel',
    }),
    'Annual Heart Check',
  );
  assert.equal(
    deriveAppointmentTitle({
      title: '  ',
      specialty: 'Cardiology',
      doctorName: 'Dr. Patel',
    }),
    'Cardiology — Dr. Patel',
  );
  assert.equal(
    deriveAppointmentTitle({
      doctorName: 'Dr. Patel',
    }),
    'Visit with Dr. Patel',
  );
});

test('findUnconfirmedDoseInstances selects only unconfirmed doses', () => {
  const dummyMed = {
    id: 'm1',
    name: 'Lisinopril',
    dosage: '10 mg',
    timeSlot: 'morning' as const,
    scheduledTime: '08:00',
    instructions: 'Water',
    prescriber: 'Dr. Patel',
    pillAppearance: 'Pink',
    supplyDays: 30,
    active: true,
  };
  const instances: ScheduledDoseInstance[] = [
    {
      doseKey: 'k1',
      medication: dummyMed,
      scheduledDate: '2026-11-15',
      scheduledTime: '08:00',
      timeSlot: 'morning',
      status: 'unconfirmed',
      log: null,
      minutesDelta: -45,
      isDueNow: false,
      isUnconfirmedWindow: true,
      isMissedWindow: false,
      formattedCountdown: '45 min overdue',
    },
    {
      doseKey: 'k2',
      medication: dummyMed,
      scheduledDate: '2026-11-15',
      scheduledTime: '20:00',
      timeSlot: 'evening',
      status: 'taken',
      log: null,
      minutesDelta: 600,
      isDueNow: false,
      isUnconfirmedWindow: false,
      isMissedWindow: false,
      formattedCountdown: 'In 10h 0m',
    },
  ];

  const unconfirmed = findUnconfirmedDoseInstances(instances);
  assert.equal(unconfirmed.length, 1);
  assert.equal(unconfirmed[0].doseKey, 'k1');
});
