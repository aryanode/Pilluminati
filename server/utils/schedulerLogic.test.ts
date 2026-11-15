import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProfileSchedule, parseHhMmToMinutes } from './schedulerLogic.ts';

test('parseHhMmToMinutes converts 24h strings accurately', () => {
  assert.equal(parseHhMmToMinutes('00:00'), 0);
  assert.equal(parseHhMmToMinutes('08:30'), 510);
  assert.equal(parseHhMmToMinutes('21:45'), 1305);
});

test('evaluateProfileSchedule detects overdue unconfirmed doses and avoids duplicates', () => {
  const result = evaluateProfileSchedule({
    profileId: 'prof_1234567890123456',
    patientName: 'Eleanor Vance',
    todayDate: '2026-11-15',
    nowMinutesOfDay: 10 * 60, // 10:00 AM
    nowEpochMs: Date.parse('2026-11-15T10:00:00.000Z'),
    escalationGraceMinutes: 30,
    handoffEscalationMinutes: 60,
    medications: [
      { id: 'med_1', name: 'Lisinopril', dosage: '10 mg', scheduledTime: '08:00', active: true },
      { id: 'med_2', name: 'Metformin', dosage: '500 mg', scheduledTime: '08:30', active: true },
      { id: 'med_3', name: 'Atorvastatin', dosage: '20 mg', scheduledTime: '20:00', active: true },
      { id: 'med_4', name: 'Paused Med', dosage: '5 mg', scheduledTime: '07:00', active: false },
    ],
    doseLogs: [
      { medicationId: 'med_2', scheduledDate: '2026-11-15', scheduledTime: '08:30', status: 'taken' },
    ],
    handoffs: [
      {
        id: 'relay_1',
        fromCaregiver: 'Maya',
        toCaregiver: 'Elena',
        shiftWindow: 'Morning',
        status: 'handed_off',
        createdAtIso: '2026-11-15T08:15:00.000Z',
      },
    ],
    existingAlerts: [],
  });

  assert.equal(result.schedulesChecked, 3);
  assert.equal(result.overdueFound, 1);
  assert.equal(result.handoffsEscalated, 1);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].sourceType, 'scheduler_dose');
  assert.equal(result.candidates[0].severity, 'urgent');
  assert.match(result.candidates[0].detail, /never recommend a double dose/);
  assert.equal(result.candidates[1].sourceType, 'scheduler_relay');

  // Re-evaluating with open alerts suppresses duplicate alerts
  const deduped = evaluateProfileSchedule({
    profileId: 'prof_1234567890123456',
    patientName: 'Eleanor Vance',
    todayDate: '2026-11-15',
    nowMinutesOfDay: 10 * 60,
    nowEpochMs: Date.parse('2026-11-15T10:00:00.000Z'),
    escalationGraceMinutes: 30,
    handoffEscalationMinutes: 60,
    medications: [
      { id: 'med_1', name: 'Lisinopril', dosage: '10 mg', scheduledTime: '08:00', active: true },
    ],
    doseLogs: [],
    handoffs: [],
    existingAlerts: [
      { dedupeKey: 'dose_prof_1234567890123456_med_1_2026-11-15', resolved: false },
    ],
  });
  assert.equal(deduped.overdueFound, 1);
  assert.equal(deduped.candidates.length, 0);
});

test('evaluateProfileSchedule handles multi-dose times, weekdays, discontinued meds, and corrected logs', () => {
  const result = evaluateProfileSchedule({
    profileId: 'prof_1234567890123456',
    patientName: 'Eleanor Vance',
    todayDate: '2026-11-15', // Sunday (0)
    nowMinutesOfDay: 14 * 60,
    nowEpochMs: Date.parse('2026-11-15T14:00:00.000Z'),
    escalationGraceMinutes: 30,
    handoffEscalationMinutes: 60,
    medications: [
      {
        id: 'med_multi',
        name: 'Metformin',
        dosage: '500 mg',
        scheduledTime: '08:00',
        scheduledTimes: ['08:00', '13:00', '20:00'],
        frequency: 'three_times_daily',
        active: true,
      },
      {
        id: 'med_mon',
        name: 'Weekly Med',
        dosage: '10 mg',
        scheduledTime: '09:00',
        frequency: 'specific_weekdays',
        weekdays: [1], // Monday only -> skipped on Sunday
        active: true,
      },
      {
        id: 'med_disc',
        name: 'Stopped Antibiotic',
        dosage: '500 mg',
        scheduledTime: '07:00',
        active: true,
        discontinued: true,
      },
    ],
    doseLogs: [
      {
        medicationId: 'med_multi',
        scheduledDate: '2026-11-15',
        scheduledTime: '08:00',
        status: 'corrected',
      },
    ],
    handoffs: [],
    existingAlerts: [],
  });

  // Only the 3 daily slots of med_multi are scheduled on Sunday; 08:00 is corrected, 13:00 is 60m past due -> 1 overdue
  assert.equal(result.schedulesChecked, 3);
  assert.equal(result.overdueFound, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(
    result.candidates[0].dedupeKey,
    'dose_prof_1234567890123456_med_multi_2026-11-15_13:00',
  );
});
