import type { DoseStatus, MedicationFrequency } from '../../src/types/pilluminati.ts';
import {
  diffDaysIso,
  getZonedNowParts,
  normalizeScheduledTimes,
  parseIsoDateToUtcDayIndex,
} from '../../src/utils/medicationEngine.ts';

export interface SchedulableMedication {
  id: string;
  name: string;
  dosage: string;
  scheduledTime: string; // Primary HH:mm
  scheduledTimes?: string[]; // Multiple daily HH:mm times
  frequency?: MedicationFrequency;
  weekdays?: number[];
  customIntervalDays?: number;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  gracePeriodMinutes?: number;
  missedAfterMinutes?: number;
  active: boolean;
  discontinued?: boolean;
}

export interface SchedulableDoseLog {
  medicationId: string;
  scheduledDate: string;
  scheduledTime?: string;
  status: DoseStatus;
}

export interface SchedulableHandoff {
  id: string;
  fromCaregiver: string;
  toCaregiver: string;
  shiftWindow: string;
  status: 'active' | 'handed_off' | 'acknowledged';
  createdAtIso: string;
}

export interface ExistingAlertKey {
  dedupeKey?: string;
  resolved: boolean;
}

export interface ScheduledAlertCandidate {
  sourceType: 'scheduler_dose' | 'scheduler_relay';
  severity: 'warning' | 'urgent';
  title: string;
  detail: string;
  dedupeKey: string;
}

export function parseHhMmToMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isSchedulableMedActiveOnDate(
  med: SchedulableMedication,
  isoDate: string,
): boolean {
  if (!med.active || med.discontinued) return false;
  if (med.startDate && isoDate < med.startDate) return false;
  if (med.endDate && isoDate > med.endDate) return false;

  const freq = med.frequency || 'once_daily';
  if (freq === 'specific_weekdays') {
    const allowed = Array.isArray(med.weekdays) ? med.weekdays : [];
    if (allowed.length === 0) return true;
    return allowed.includes(parseIsoDateToUtcDayIndex(isoDate));
  }

  if (freq === 'custom') {
    const interval = Math.max(1, Math.round(med.customIntervalDays ?? 1));
    if (!med.startDate || interval === 1) return true;
    const delta = diffDaysIso(med.startDate, isoDate);
    return delta >= 0 && delta % interval === 0;
  }

  return true;
}

export function evaluateProfileSchedule(params: {
  profileId: string;
  patientName: string;
  todayDate?: string;
  nowMinutesOfDay?: number;
  nowEpochMs: number;
  escalationGraceMinutes: number;
  handoffEscalationMinutes: number;
  medications: SchedulableMedication[];
  doseLogs: SchedulableDoseLog[];
  handoffs: SchedulableHandoff[];
  existingAlerts: ExistingAlertKey[];
}): {
  schedulesChecked: number;
  overdueFound: number;
  handoffsEscalated: number;
  candidates: ScheduledAlertCandidate[];
} {
  const activeMeds = params.medications.filter((m) => m.active && !m.discontinued);
  const existingOpenKeys = new Set(
    params.existingAlerts
      .filter((a) => !a.resolved && a.dedupeKey)
      .map((a) => a.dedupeKey!),
  );

  const candidates: ScheduledAlertCandidate[] = [];
  let schedulesChecked = 0;
  let overdueFound = 0;
  let handoffsEscalated = 0;
  const nowDate = new Date(params.nowEpochMs);

  for (const med of activeMeds) {
    const zoned = med.timezone
      ? getZonedNowParts(nowDate, med.timezone)
      : {
          isoDate:
            params.todayDate ||
            `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nowDate.getUTCDate()).padStart(2, '0')}`,
          minutesOfDay:
            params.nowMinutesOfDay ??
            nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes(),
        };

    const effectiveDate = params.todayDate && !med.timezone ? params.todayDate : zoned.isoDate;
    const effectiveMinutes =
      params.nowMinutesOfDay !== undefined && !med.timezone
        ? params.nowMinutesOfDay
        : zoned.minutesOfDay;

    if (!isSchedulableMedActiveOnDate(med, effectiveDate)) {
      continue;
    }

    const times = normalizeScheduledTimes(med.scheduledTimes, med.scheduledTime);
    const grace = med.gracePeriodMinutes ?? params.escalationGraceMinutes;
    const missedThreshold = med.missedAfterMinutes ?? 180;

    for (const scheduledTime of times) {
      schedulesChecked += 1;
      const schedMins = parseHhMmToMinutes(scheduledTime);
      const overdueBy = effectiveMinutes - schedMins;
      if (overdueBy < grace) {
        continue;
      }

      const log =
        params.doseLogs.find(
          (l) =>
            l.medicationId === med.id &&
            l.scheduledDate === effectiveDate &&
            l.scheduledTime === scheduledTime,
        ) ??
        (times.length === 1
          ? params.doseLogs.find(
              (l) =>
                l.medicationId === med.id && l.scheduledDate === effectiveDate,
            )
          : undefined);

      if (
        log &&
        (log.status === 'taken' ||
          log.status === 'skipped' ||
          log.status === 'corrected' ||
          log.status === 'missed')
      ) {
        continue;
      }

      overdueFound += 1;
      const dedupeKey =
        times.length === 1
          ? `dose_${params.profileId}_${med.id}_${effectiveDate}`
          : `dose_${params.profileId}_${med.id}_${effectiveDate}_${scheduledTime}`;

      if (!existingOpenKeys.has(dedupeKey)) {
        const pastMissedWindow = overdueBy >= missedThreshold;
        candidates.push({
          sourceType: 'scheduler_dose',
          severity: overdueBy >= 60 ? 'urgent' : 'warning',
          title: pastMissedWindow
            ? `Unconfirmed Dose Review: ${med.name} (${med.dosage})`
            : `Unconfirmed Dose: ${med.name} (${med.dosage})`,
          detail: `${params.patientName}'s ${scheduledTime} dose of ${med.name} is ${overdueBy} min past schedule with no confirmation. Check in safely—never recommend a double dose without clinician advice.`,
          dedupeKey,
        });
      }
    }
  }

  for (const h of params.handoffs) {
    if (h.status !== 'handed_off') continue;
    const createdMs = Date.parse(h.createdAtIso);
    if (!Number.isFinite(createdMs)) continue;
    const ageMinutes = Math.floor((params.nowEpochMs - createdMs) / 60_000);
    if (ageMinutes < params.handoffEscalationMinutes) continue;

    handoffsEscalated += 1;
    const dedupeKey = `relay_${params.profileId}_${h.id}`;
    if (!existingOpenKeys.has(dedupeKey)) {
      candidates.push({
        sourceType: 'scheduler_relay',
        severity: 'warning',
        title: `Care Relay Acknowledgment Overdue`,
        detail: `Shift handoff from ${h.fromCaregiver} to ${h.toCaregiver} (${h.shiftWindow}) has been unacknowledged for ${ageMinutes} minutes.`,
        dedupeKey,
      });
    }
  }

  return {
    schedulesChecked,
    overdueFound,
    handoffsEscalated,
    candidates,
  };
}
