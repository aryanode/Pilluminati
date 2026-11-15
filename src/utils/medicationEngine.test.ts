import test from 'node:test';
import assert from 'node:assert/strict';
import type { DoseLog, Medication } from '../types/pilluminati';
import {
  buildDatesInPastRange,
  classifyUnloggedDoseStatus,
  computeAdherenceStreak,
  computeCalendarMonthDays,
  computeMedicationAdherenceBreakdown,
  expandScheduledDosesForDate,
  getZonedNowParts,
  isMedicationScheduledOnDate,
  normalizeScheduledTimes,
} from './medicationEngine';

const multiDoseMed: Medication = {
  id: 'med_multi_1',
  name: 'Metformin',
  dosage: '500 mg',
  dosageAmount: '500',
  dosageUnit: 'mg',
  frequency: 'twice_daily',
  timeSlot: 'morning',
  scheduledTime: '08:00',
  scheduledTimes: ['20:00', '08:00', '08:00'], // intentionally unsorted + duplicate
  startDate: '2026-11-01',
  instructions: 'With meals',
  foodInstruction: 'with_food',
  prescriber: 'Dr. Thorne',
  pillAppearance: 'Oval white tablet',
  timezone: 'UTC',
  gracePeriodMinutes: 30,
  missedAfterMinutes: 180,
  supplyDays: 30,
  active: true,
};

const weekdayMed: Medication = {
  id: 'med_weekday_1',
  name: 'Methotrexate',
  dosage: '10 mg',
  frequency: 'specific_weekdays',
  weekdays: [1, 4], // Monday, Thursday
  timeSlot: 'morning',
  scheduledTime: '09:00',
  scheduledTimes: ['09:00'],
  startDate: '2026-11-01',
  endDate: '2026-11-20',
  instructions: 'Weekly protocol',
  prescriber: 'Dr. Chen',
  pillAppearance: 'Yellow tablet',
  timezone: 'UTC',
  supplyDays: 20,
  active: true,
};

const customIntervalMed: Medication = {
  id: 'med_custom_1',
  name: 'Vitamin D3 High Dose',
  dosage: '5000 IU',
  frequency: 'custom',
  customIntervalDays: 3,
  timeSlot: 'midday',
  scheduledTime: '12:00',
  scheduledTimes: ['12:00'],
  startDate: '2026-11-10',
  instructions: 'Every 3 days with lunch',
  prescriber: 'Dr. Thorne',
  pillAppearance: 'Softgel',
  timezone: 'UTC',
  supplyDays: 30,
  active: true,
};

const discontinuedMed: Medication = {
  id: 'med_disc_1',
  name: 'Amoxicillin',
  dosage: '500 mg',
  frequency: 'once_daily',
  timeSlot: 'morning',
  scheduledTime: '08:00',
  scheduledTimes: ['08:00'],
  startDate: '2026-11-01',
  instructions: 'Course complete',
  prescriber: 'Dr. Thorne',
  pillAppearance: 'Pink capsule',
  timezone: 'UTC',
  supplyDays: 0,
  active: false,
  discontinued: true,
  discontinuedAt: '2026-11-12T10:00:00.000Z',
};

test('normalizeScheduledTimes deduplicates and sorts HH:mm dose times', () => {
  const result = normalizeScheduledTimes(['20:00', '08:00', '08:00', 'bad', '13:30']);
  assert.deepEqual(result, ['08:00', '13:30', '20:00']);
});

test('isMedicationScheduledOnDate enforces weekdays, custom intervals, date bounds, and discontinued preservation', () => {
  // 2026-11-12 is Thursday (day 4), 2026-11-13 is Friday (day 5)
  assert.equal(isMedicationScheduledOnDate(weekdayMed, '2026-11-12'), true);
  assert.equal(isMedicationScheduledOnDate(weekdayMed, '2026-11-13'), false);
  assert.equal(isMedicationScheduledOnDate(weekdayMed, '2026-11-23'), false); // past endDate (Mon)

  // Custom every 3 days starting 2026-11-10 -> 10, 13, 16 scheduled; 11, 12 not
  assert.equal(isMedicationScheduledOnDate(customIntervalMed, '2026-11-10'), true);
  assert.equal(isMedicationScheduledOnDate(customIntervalMed, '2026-11-11'), false);
  assert.equal(isMedicationScheduledOnDate(customIntervalMed, '2026-11-13'), true);

  // Discontinued med is hidden on/after discontinuedAt unless it has a historical log
  assert.equal(isMedicationScheduledOnDate(discontinuedMed, '2026-11-12'), false);
  const historicalLog: DoseLog[] = [
    {
      id: 'l_hist',
      medicationId: discontinuedMed.id,
      medicationName: discontinuedMed.name,
      dosage: discontinuedMed.dosage,
      scheduledDate: '2026-11-10',
      scheduledTime: '08:00',
      status: 'taken',
    },
  ];
  assert.equal(
    isMedicationScheduledOnDate(discontinuedMed, '2026-11-10', historicalLog),
    true,
  );
});

test('getZonedNowParts and classifyUnloggedDoseStatus support timezone-aware upcoming, due, unconfirmed, and missed classification', () => {
  // 2026-11-15T13:10:00Z is 08:10 in America/New_York (UTC-5)
  const utcInstant = new Date('2026-11-15T13:10:00.000Z');
  const nyParts = getZonedNowParts(utcInstant, 'America/New_York');
  assert.equal(nyParts.isoDate, '2026-11-15');
  assert.equal(nyParts.hhmm, '08:10');

  const dueRes = classifyUnloggedDoseStatus({
    scheduledDate: '2026-11-15',
    scheduledTime: '08:00',
    referenceNow: utcInstant,
    timeZone: 'America/New_York',
    gracePeriodMinutes: 30,
    missedAfterMinutes: 180,
  });
  assert.equal(dueRes.status, 'due');
  assert.equal(dueRes.isDueNow, true);

  // 45 mins past 08:00 -> unconfirmed (does NOT jump straight to missed)
  const unconfirmedRes = classifyUnloggedDoseStatus({
    scheduledDate: '2026-11-15',
    scheduledTime: '08:00',
    referenceNow: new Date('2026-11-15T13:45:00.000Z'),
    timeZone: 'America/New_York',
    gracePeriodMinutes: 30,
    missedAfterMinutes: 180,
  });
  assert.equal(unconfirmedRes.status, 'unconfirmed');
  assert.equal(unconfirmedRes.isUnconfirmedWindow, true);

  // Past day unconfirmed becomes missed-eligible
  const missedPastDay = classifyUnloggedDoseStatus({
    scheduledDate: '2026-11-14',
    scheduledTime: '08:00',
    referenceNow: utcInstant,
    timeZone: 'America/New_York',
  });
  assert.equal(missedPastDay.status, 'missed');
});

test('expandScheduledDosesForDate prevents duplicates and tracks multi-dose + corrected logs', () => {
  const logs: DoseLog[] = [
    {
      id: 'l_m1',
      medicationId: multiDoseMed.id,
      medicationName: multiDoseMed.name,
      dosage: multiDoseMed.dosage,
      scheduledDate: '2026-11-15',
      scheduledTime: '08:00',
      status: 'corrected',
      correctedFromStatus: 'unconfirmed',
      correctionReason: 'Verified taken before breakfast',
      confirmedAt: '08:15',
    },
  ];

  const instances = expandScheduledDosesForDate(
    [multiDoseMed],
    logs,
    '2026-11-15',
    new Date('2026-11-15T10:00:00.000Z'),
  );

  // Should produce exactly 2 non-duplicate instances: 08:00 (corrected) and 20:00 (upcoming)
  assert.equal(instances.length, 2);
  assert.equal(instances[0].scheduledTime, '08:00');
  assert.equal(instances[0].status, 'corrected');
  assert.equal(instances[1].scheduledTime, '20:00');
  assert.equal(instances[1].status, 'upcoming');
});

test('computeCalendarMonthDays, computeMedicationAdherenceBreakdown, and computeAdherenceStreak compute multi-day metrics accurately', () => {
  const dates = buildDatesInPastRange('2026-11-15', 3); // 13, 14, 15
  assert.deepEqual(dates, ['2026-11-13', '2026-11-14', '2026-11-15']);

  const simpleMed: Medication = {
    ...multiDoseMed,
    id: 'med_streak',
    scheduledTimes: ['08:00'],
    scheduledTime: '08:00',
    frequency: 'once_daily',
    startDate: '2026-11-13',
  };
  const logs: DoseLog[] = [
    {
      id: 's1',
      medicationId: simpleMed.id,
      medicationName: simpleMed.name,
      dosage: simpleMed.dosage,
      scheduledDate: '2026-11-13',
      scheduledTime: '08:00',
      status: 'taken',
    },
    {
      id: 's2',
      medicationId: simpleMed.id,
      medicationName: simpleMed.name,
      dosage: simpleMed.dosage,
      scheduledDate: '2026-11-14',
      scheduledTime: '08:00',
      status: 'corrected',
    },
  ];

  const streak = computeAdherenceStreak(
    [simpleMed],
    logs,
    '2026-11-15',
    10,
    new Date('2026-11-15T07:50:00.000Z'), // Today's 08:00 dose is upcoming, not unconfirmed/missed
  );
  assert.equal(streak.currentStreakDays, 2);
  assert.equal(streak.bestStreakDays, 2);

  const breakdown = computeMedicationAdherenceBreakdown(
    [simpleMed],
    logs,
    dates,
    new Date('2026-11-15T07:50:00.000Z'),
  );
  assert.equal(breakdown[0].scheduledCount, 3);
  assert.equal(breakdown[0].takenCount, 1);
  assert.equal(breakdown[0].correctedCount, 1);
  assert.equal(breakdown[0].percentage, 67);

  const cal = computeCalendarMonthDays(
    [simpleMed],
    logs,
    2026,
    10, // November (0-indexed)
    new Date('2026-11-15T07:50:00.000Z'),
  );
  const nov13 = cal.find((c) => c.date === '2026-11-13');
  assert.ok(nov13);
  assert.equal(nov13.percentage, 100);
});
