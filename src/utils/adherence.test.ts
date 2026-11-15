import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailyAdherence,
  computeWeeklyAdherenceSeries,
  filterVisibleDataByPermission,
  formatTime12Hour,
  getNextUpcomingDose,
  getPilluContextualCopy,
  getPilluMoodForState,
  isTimeInQuietHours,
  validateAppointmentInput,
  validateMedicationInput,
} from './adherence';
import type {
  Appointment,
  CareUpdate,
  DoseLog,
  FamilyVisibilityPermissions,
  Medication,
} from '../types/pilluminati';

const sampleMeds: Medication[] = [
  {
    id: 'm1',
    name: 'Lisinopril',
    dosage: '10 mg',
    timeSlot: 'morning',
    scheduledTime: '08:00',
    instructions: 'Take with water',
    prescriber: 'Dr. Thorne',
    pillAppearance: 'Round pink tablet',
    supplyDays: 18,
    active: true,
  },
  {
    id: 'm2',
    name: 'Metformin',
    dosage: '500 mg',
    timeSlot: 'midday',
    scheduledTime: '12:30',
    instructions: 'Take with lunch',
    prescriber: 'Dr. Thorne',
    pillAppearance: 'Oval white tablet',
    supplyDays: 12,
    active: true,
  },
  {
    id: 'm3',
    name: 'Atorvastatin',
    dosage: '20 mg',
    timeSlot: 'bedtime',
    scheduledTime: '21:00',
    instructions: 'Take at bedtime',
    prescriber: 'Dr. Thorne',
    pillAppearance: 'White capsule',
    supplyDays: 24,
    active: true,
  },
  {
    id: 'm4',
    name: 'Paused Vitamin D',
    dosage: '1000 IU',
    timeSlot: 'morning',
    scheduledTime: '09:00',
    instructions: 'Paused',
    prescriber: 'Dr. Thorne',
    pillAppearance: 'Softgel',
    supplyDays: 30,
    active: false,
  },
];

const sampleLogs: DoseLog[] = [
  {
    id: 'l1',
    medicationId: 'm1',
    medicationName: 'Lisinopril',
    dosage: '10 mg',
    scheduledDate: '2026-11-14',
    scheduledTime: '08:00',
    status: 'taken',
    confirmedAt: '08:05',
    confirmedBy: 'Eleanor Vance',
  },
  {
    id: 'l2',
    medicationId: 'm2',
    medicationName: 'Metformin',
    dosage: '500 mg',
    scheduledDate: '2026-11-14',
    scheduledTime: '12:30',
    status: 'unconfirmed',
  },
];

test('calculateDailyAdherence counts only active medications and computes percentage accurately', () => {
  const refNow = new Date(2026, 10, 14, 13, 0);
  const stats = calculateDailyAdherence(sampleMeds, sampleLogs, '2026-11-14', refNow);
  assert.equal(stats.totalScheduled, 3);
  assert.equal(stats.takenCount, 1);
  assert.equal(stats.unconfirmedCount, 1);
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.percentage, 33);
});

test('getNextUpcomingDose prioritizes unconfirmed or overdue dose before later pending doses', () => {
  const next = getNextUpcomingDose(sampleMeds, sampleLogs, '2026-11-14', 13 * 60);
  assert.ok(next);
  assert.equal(next.medication.id, 'm2');
  assert.equal(next.isOverdue, true);
  assert.equal(next.formattedCountdown, '30 min overdue');
});

test('getPilluMoodForState maps Phase 6 Pillu states accurately and non-punitively', () => {
  const refNow = new Date(2026, 10, 14, 13, 0);
  const partialStats = calculateDailyAdherence(sampleMeds, sampleLogs, '2026-11-14', refNow);

  // Unconfirmed dose -> gently concerned (never angry/punitive)
  assert.equal(getPilluMoodForState(partialStats, true, false), 'concerned');
  // Medication confirmed -> happy (triggers small bounce in UI)
  assert.equal(getPilluMoodForState(partialStats, true, true), 'happy');
  // Patient reports feeling unwell -> caring expression
  assert.equal(
    getPilluMoodForState(partialStats, false, true, { patientFeelingUnwell: true }),
    'caring',
  );

  // Upcoming dose with no unconfirmed doses -> encouraging reminder
  const upcomingOnlyLogs: DoseLog[] = [sampleLogs[0]];
  const upcomingStats = calculateDailyAdherence(
    sampleMeds,
    upcomingOnlyLogs,
    '2026-11-14',
    new Date(2026, 10, 14, 10, 0),
  );
  assert.equal(getPilluMoodForState(upcomingStats, false, false), 'encouraging');

  // All daily medications completed -> celebrating
  const allTakenLogs: DoseLog[] = [
    ...sampleLogs.filter((l) => l.medicationId !== 'm2'),
    { ...sampleLogs[1], status: 'taken' },
    {
      id: 'l3',
      medicationId: 'm3',
      medicationName: 'Atorvastatin',
      dosage: '20 mg',
      scheduledDate: '2026-11-14',
      scheduledTime: '21:00',
      status: 'taken',
    },
  ];
  const fullStats = calculateDailyAdherence(sampleMeds, allTakenLogs, '2026-11-14', refNow);
  assert.equal(fullStats.percentage, 100);
  assert.equal(getPilluMoodForState(fullStats, false, false), 'celebrating');

  // Quiet hours when no active medications scheduled -> sleepy
  const emptyStats = calculateDailyAdherence([], [], '2026-11-14', refNow);
  assert.equal(getPilluMoodForState(emptyStats, false, false, { isQuietHours: true }), 'sleepy');
  assert.equal(getPilluMoodForState(emptyStats, false, false, { isQuietHours: false }), 'idle');

  assert.equal(isTimeInQuietHours(23 * 60, '22:00', '07:00'), true);
  assert.equal(isTimeInQuietHours(14 * 60, '22:00', '07:00'), false);

  const concernedCopy = getPilluContextualCopy({
    mood: 'concerned',
    stats: partialStats,
    patientFirstName: 'Eleanor',
    role: 'patient',
  });
  assert.ok(concernedCopy.message.toLowerCase().includes('gentle') || concernedCopy.message.toLowerCase().includes('gently'));
});

test('filterVisibleDataByPermission restricts family data when permissions are disabled', () => {
  const permissions: FamilyVisibilityPermissions = {
    showDetailedMedications: false,
    showAdherencePercentage: true,
    showAppointments: false,
    showCareUpdates: true,
    showEmergencyPassport: false,
  };
  const appts: Appointment[] = [
    {
      id: 'a1',
      title: 'Cardiology Follow-up',
      doctorName: 'Dr. Chen',
      specialty: 'Cardiology',
      date: '2026-11-18',
      time: '10:30',
      location: 'Suite 300',
      assignedCaregiver: 'Maya Lin',
      notes: 'Bring med list',
      status: 'upcoming',
    },
  ];
  const updates: CareUpdate[] = [
    {
      id: 'u1',
      authorName: 'Maya Lin',
      authorRole: 'caregiver',
      category: 'wellness',
      message: 'Morning walk went smoothly.',
      createdAt: '2026-11-14T09:15:00Z',
    },
  ];

  const familyView = filterVisibleDataByPermission(
    'family',
    permissions,
    sampleMeds,
    appts,
    updates,
  );
  assert.equal(familyView.canViewAdherence, true);
  assert.equal(familyView.medications.length, 0);
  assert.equal(familyView.appointments.length, 0);
  assert.equal(familyView.careUpdates.length, 1);

  const caregiverView = filterVisibleDataByPermission(
    'caregiver',
    permissions,
    sampleMeds,
    appts,
    updates,
  );
  assert.equal(caregiverView.medications.length, 4);
  assert.equal(caregiverView.appointments.length, 1);
});

test('validateMedicationInput and validateAppointmentInput reject empty required fields', () => {
  const medErrors = validateMedicationInput({
    name: '   ',
    dosage: '',
    timeSlot: 'morning',
    scheduledTime: 'invalid',
    instructions: '',
    prescriber: '',
    supplyDays: -5,
  });
  assert.ok(medErrors.name);
  assert.ok(medErrors.dosage);
  assert.ok(medErrors.scheduledTime);
  assert.ok(medErrors.supplyDays);

  const validMedErrors = validateMedicationInput({
    name: 'Eliquis',
    dosage: '5 mg',
    timeSlot: 'evening',
    scheduledTime: '18:00',
    instructions: 'With dinner',
    prescriber: 'Dr. Chen',
    supplyDays: 30,
  });
  assert.deepEqual(validMedErrors, {});

  const apptErrors = validateAppointmentInput({
    title: '',
    doctorName: '',
    date: 'bad',
    time: 'bad',
    location: '',
  });
  assert.ok(apptErrors.title);
  assert.ok(apptErrors.doctorName);
  assert.ok(apptErrors.date);
  assert.ok(apptErrors.time);
});

test('computeWeeklyAdherenceSeries and formatTime12Hour return deterministic formatting', () => {
  assert.equal(formatTime12Hour('08:00'), '8:00 AM');
  assert.equal(formatTime12Hour('12:30'), '12:30 PM');
  assert.equal(formatTime12Hour('21:05'), '9:05 PM');

  const refNow = new Date(2026, 10, 14, 13, 0);
  const series = computeWeeklyAdherenceSeries(sampleMeds, sampleLogs, ['2026-11-14'], refNow);
  assert.equal(series.length, 1);
  assert.equal(series[0].taken, 1);
  assert.equal(series[0].total, 3);
  assert.equal(series[0].percentage, 33);
});
