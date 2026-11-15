import type {
  Appointment,
  CareUpdate,
  DailyAdherenceStats,
  DoseLog,
  FamilyVisibilityPermissions,
  Medication,
  MedicationFrequency,
  PilluMoodState,
  ScheduledDoseInstance,
  TimeSlot,
  UpcomingDoseInfo,
  UserRole,
} from '../types/pilluminati';
import {
  calculateDailyStatsFromInstances,
  expandScheduledDosesForDate,
  formatTime12Hour,
  isValidTimeZone,
  normalizeScheduledTimes,
  parseTimeToMinutes,
} from './medicationEngine';

export * from './medicationEngine';

function buildReferenceDateForDateAndMinutes(
  isoDate: string,
  minutesOfDay: number,
  timeZone?: string,
): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const hh = Math.floor(minutesOfDay / 60) % 24;
  const mm = minutesOfDay % 60;
  if (!y || !m || !d) return new Date();
  if (!timeZone) {
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
}

export function calculateDailyAdherence(
  medications: Medication[],
  doseLogs: DoseLog[],
  targetDate: string,
  referenceNow: Date = new Date(),
): DailyAdherenceStats {
  const instances = expandScheduledDosesForDate(
    medications,
    doseLogs,
    targetDate,
    referenceNow,
  );
  return calculateDailyStatsFromInstances(instances);
}

export function getNextUpcomingDose(
  medications: Medication[],
  doseLogs: DoseLog[],
  targetDate: string,
  nowMinutes?: number,
  referenceNow?: Date,
): UpcomingDoseInfo | null {
  const effectiveNow =
    referenceNow ??
    (nowMinutes !== undefined
      ? buildReferenceDateForDateAndMinutes(targetDate, nowMinutes)
      : new Date());

  const instances = expandScheduledDosesForDate(
    medications,
    doseLogs,
    targetDate,
    effectiveNow,
  );

  const actionable = instances.filter(
    (inst) =>
      inst.status === 'pending' ||
      inst.status === 'upcoming' ||
      inst.status === 'due' ||
      inst.status === 'unconfirmed',
  );

  if (actionable.length === 0) return null;

  const prioritized =
    actionable.find(
      (inst) =>
        inst.status === 'unconfirmed' ||
        inst.status === 'due' ||
        inst.minutesDelta <= 0,
    ) ?? actionable[0];

  const isOverdue =
    prioritized.minutesDelta < 0 || prioritized.status === 'unconfirmed';

  let formattedCountdown = prioritized.formattedCountdown;
  if (nowMinutes !== undefined) {
    const delta = parseTimeToMinutes(prioritized.scheduledTime) - nowMinutes;
    if (delta > 0) {
      const hrs = Math.floor(delta / 60);
      const mins = delta % 60;
      formattedCountdown = hrs > 0 ? `In ${hrs}h ${mins}m` : `In ${mins} min`;
    } else if (delta < 0) {
      const absDelta = Math.abs(delta);
      const hrs = Math.floor(absDelta / 60);
      const mins = absDelta % 60;
      formattedCountdown =
        hrs > 0 ? `${hrs}h ${mins}m overdue` : `${mins} min overdue`;
    } else {
      formattedCountdown = 'Due now';
    }
  }

  return {
    medication: prioritized.medication,
    scheduledTime: prioritized.scheduledTime,
    doseKey: prioritized.doseKey,
    status: prioritized.status,
    log: prioritized.log,
    minutesDelta:
      nowMinutes !== undefined
        ? parseTimeToMinutes(prioritized.scheduledTime) - nowMinutes
        : prioritized.minutesDelta,
    isOverdue,
    formattedCountdown,
  };
}

export interface PilluMoodOptions {
  hasUpcomingDose?: boolean;
  patientFeelingUnwell?: boolean;
  isQuietHours?: boolean;
}

export function isTimeInQuietHours(
  nowMinutes: number,
  quietStart = '22:00',
  quietEnd = '07:00',
): boolean {
  const startMins = parseTimeToMinutes(quietStart);
  const endMins = parseTimeToMinutes(quietEnd);
  if (startMins === endMins) return false;
  if (startMins < endMins) {
    return nowMinutes >= startMins && nowMinutes < endMins;
  }
  // Spans midnight (e.g. 22:00 -> 07:00)
  return nowMinutes >= startMins || nowMinutes < endMins;
}

export function getPilluMoodForState(
  stats: DailyAdherenceStats,
  hasOverdueOrUnconfirmed: boolean,
  justCompletedDose: boolean,
  options: PilluMoodOptions = {},
): PilluMoodState {
  if (options.patientFeelingUnwell) {
    return 'caring';
  }
  if (justCompletedDose) {
    return 'happy';
  }
  if (stats.totalScheduled > 0 && stats.takenCount === stats.totalScheduled) {
    return 'celebrating';
  }
  if (hasOverdueOrUnconfirmed || stats.unconfirmedCount > 0) {
    return 'concerned';
  }
  if (
    options.hasUpcomingDose ||
    stats.pendingCount > 0 ||
    stats.dueCount > 0
  ) {
    return 'encouraging';
  }
  if (options.isQuietHours) {
    return 'sleepy';
  }
  return 'idle';
}

export function getPilluContextualCopy(params: {
  mood: PilluMoodState;
  stats: DailyAdherenceStats;
  nextDose?: UpcomingDoseInfo | null;
  patientFirstName?: string;
  role?: UserRole;
}): { message: string; subMessage?: string } {
  const { mood, stats, nextDose, patientFirstName, role = 'patient' } = params;
  const who = patientFirstName || 'your loved one';

  if (mood === 'caring') {
    return {
      message:
        role === 'patient'
          ? 'I am right here with you. Take it gentle today—your care circle knows you are not feeling well.'
          : `${who} shared that they are feeling unwell today. A warm check-in may help.`,
      subMessage:
        role === 'patient'
          ? 'Rest comfortably and tap "I’m Feeling Better" whenever you feel up to it.'
          : 'Caregivers and family can coordinate gentle support right from this view.',
    };
  }

  if (mood === 'happy') {
    return {
      message:
        role === 'patient'
          ? 'Dose confirmed! That was wonderfully smooth—one step at a time.'
          : `Dose confirmed for ${who}. Everything stays nicely in sync.`,
      subMessage: `${stats.takenCount} of ${stats.totalScheduled} scheduled doses confirmed today.`,
    };
  }

  if (mood === 'celebrating') {
    return {
      message:
        role === 'patient'
          ? 'Every scheduled medication for today is complete—time to celebrate!'
          : `All ${stats.totalScheduled} scheduled doses for ${who} are complete today!`,
      subMessage: 'Your care circle can see today’s schedule is all caught up.',
    };
  }

  if (mood === 'concerned') {
    return {
      message:
        role === 'patient'
          ? `Checking in gently—${
              stats.unconfirmedCount > 1
                ? `${stats.unconfirmedCount} earlier doses are still waiting for a tap.`
                : nextDose
                  ? `did you take ${nextDose.medication.name} (${formatTime12Hour(nextDose.scheduledTime)}) earlier?`
                  : 'an earlier dose is waiting for a quick check-in.'
            }`
          : `${stats.unconfirmedCount || 1} scheduled ${
              (stats.unconfirmedCount || 1) === 1 ? 'dose' : 'doses'
            } for ${who} still need a gentle check-in.`,
      subMessage: 'No pressure—confirm when ready or ask a caregiver to assist.',
    };
  }

  if (mood === 'encouraging') {
    if (nextDose) {
      return {
        message:
          role === 'patient'
            ? `Curious reminder: ${nextDose.medication.name} (${nextDose.medication.dosage}) is scheduled for ${formatTime12Hour(nextDose.scheduledTime)}.`
            : `Next up for ${who}: ${nextDose.medication.name} at ${formatTime12Hour(nextDose.scheduledTime)}.`,
        subMessage: `${nextDose.formattedCountdown} · You’ve got this.`,
      };
    }
    return {
      message:
        role === 'patient'
          ? `${stats.pendingCount} scheduled ${stats.pendingCount === 1 ? 'dose' : 'doses'} still ahead today—right on pace.`
          : `${stats.pendingCount} upcoming ${stats.pendingCount === 1 ? 'dose' : 'doses'} remaining for ${who} today.`,
    };
  }

  if (mood === 'sleepy' || mood === 'sleeping') {
    return {
      message:
        'Quiet hours are active. Resting peacefully until the next scheduled medication window.',
      subMessage: 'Your schedule and emergency passport stay ready anytime.',
    };
  }

  return {
    message:
      stats.totalScheduled === 0
        ? 'No active doses scheduled today. Everything is calm and organized.'
        : 'Everything looks steady today. I am right here whenever you need a hand.',
  };
}

export interface FamilyScopedView {
  canViewAdherence: boolean;
  canViewDetailedMedications: boolean;
  canViewAppointments: boolean;
  canViewCareUpdates: boolean;
  canViewPassport: boolean;
  medications: Medication[];
  appointments: Appointment[];
  careUpdates: CareUpdate[];
}

export function filterVisibleDataByPermission(
  role: UserRole,
  permissions: FamilyVisibilityPermissions,
  medications: Medication[],
  appointments: Appointment[],
  careUpdates: CareUpdate[],
): FamilyScopedView {
  if (role !== 'family') {
    return {
      canViewAdherence: true,
      canViewDetailedMedications: true,
      canViewAppointments: true,
      canViewCareUpdates: true,
      canViewPassport: true,
      medications,
      appointments,
      careUpdates,
    };
  }

  return {
    canViewAdherence: permissions.showAdherencePercentage,
    canViewDetailedMedications: permissions.showDetailedMedications,
    canViewAppointments: permissions.showAppointments,
    canViewCareUpdates: permissions.showCareUpdates,
    canViewPassport: permissions.showEmergencyPassport,
    medications: permissions.showDetailedMedications ? medications : [],
    appointments: permissions.showAppointments ? appointments : [],
    careUpdates: permissions.showCareUpdates ? careUpdates : [],
  };
}

export interface MedicationInputDraft {
  name: string;
  dosage: string;
  dosageAmount?: string;
  dosageUnit?: string;
  frequency?: MedicationFrequency;
  timeSlot: TimeSlot;
  scheduledTime: string;
  scheduledTimes?: string[];
  weekdays?: number[];
  customIntervalDays?: number;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  instructions: string;
  prescriber: string;
  supplyDays: number;
  prescriptionImageUrl?: string;
}

export function validateMedicationInput(
  input: MedicationInputDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) {
    errors.name = 'Medication name is required.';
  } else if (input.name.trim().length > 120) {
    errors.name = 'Medication name must be 120 characters or fewer.';
  }

  const combinedDosage =
    input.dosage.trim() ||
    `${input.dosageAmount?.trim() || ''} ${input.dosageUnit?.trim() || ''}`.trim();
  if (!combinedDosage) {
    errors.dosage = 'Dosage is required (e.g., 10 mg).';
  } else if (combinedDosage.length > 60) {
    errors.dosage = 'Dosage must be 60 characters or fewer.';
  }

  const timesList =
    Array.isArray(input.scheduledTimes) && input.scheduledTimes.length > 0
      ? input.scheduledTimes
      : [input.scheduledTime];

  if (timesList.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t).trim()))) {
    errors.scheduledTime = 'Enter a valid time in HH:MM format.';
  } else if (
    new Set(timesList.map((t) => t.trim())).size !== timesList.length
  ) {
    errors.scheduledTime = 'Remove duplicate scheduled times for the same day.';
  } else if (timesList.length > 8) {
    errors.scheduledTime = 'Maximum 8 daily dose times per medication.';
  }

  if (
    input.frequency === 'specific_weekdays' &&
    (!input.weekdays || input.weekdays.length === 0)
  ) {
    errors.weekdays = 'Select at least one weekday.';
  }

  if (
    input.frequency === 'custom' &&
    (!Number.isFinite(input.customIntervalDays ?? 2) ||
      (input.customIntervalDays ?? 2) < 1 ||
      (input.customIntervalDays ?? 2) > 90)
  ) {
    errors.customIntervalDays = 'Interval must be between 1 and 90 days.';
  }

  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    errors.startDate = 'Enter a valid start date.';
  }
  if (input.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
      errors.endDate = 'Enter a valid end date.';
    } else if (input.startDate && input.endDate < input.startDate) {
      errors.endDate = 'End date cannot be earlier than start date.';
    }
  }

  if (input.timezone && !isValidTimeZone(input.timezone)) {
    errors.timezone = 'Select a valid IANA timezone.';
  }

  if (
    input.prescriptionImageUrl &&
    input.prescriptionImageUrl.length > 120_000
  ) {
    errors.prescriptionImageUrl =
      'Prescription image is too large (must be under 120 KB after compression).';
  }

  if (
    Number.isNaN(input.supplyDays) ||
    input.supplyDays < 0 ||
    input.supplyDays > 365
  ) {
    errors.supplyDays = 'Supply days must be between 0 and 365.';
  }

  return errors;
}

export interface AppointmentInputDraft {
  title: string;
  doctorName: string;
  date: string;
  time: string;
  location: string;
}

export function validateAppointmentInput(
  input: AppointmentInputDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.title.trim()) {
    errors.title = 'Appointment title is required.';
  }
  if (!input.doctorName.trim()) {
    errors.doctorName = 'Doctor or clinic name is required.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Select a valid date.';
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    errors.time = 'Select a valid time.';
  }
  return errors;
}

export interface DailyAdherencePoint {
  date: string;
  label: string;
  taken: number;
  total: number;
  percentage: number;
}

export function computeWeeklyAdherenceSeries(
  medications: Medication[],
  doseLogs: DoseLog[],
  dates: string[],
  referenceNow: Date = new Date(),
): DailyAdherencePoint[] {
  return dates.map((dateStr) => {
    const stats = calculateDailyAdherence(
      medications,
      doseLogs,
      dateStr,
      referenceNow,
    );
    const d = new Date(`${dateStr}T12:00:00`);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    return {
      date: dateStr,
      label,
      taken: stats.takenCount,
      total: stats.totalScheduled,
      percentage: stats.percentage,
    };
  });
}

export function getGreetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getNormalizedDraftTimes(
  scheduledTimes: string[] | undefined,
  fallback: string,
): string[] {
  return normalizeScheduledTimes(scheduledTimes, fallback);
}

export type { ScheduledDoseInstance };
export { formatTime12Hour };
