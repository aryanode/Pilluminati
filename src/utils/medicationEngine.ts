import type {
  AdherenceCalendarDay,
  AdherenceStreakInfo,
  DailyAdherenceStats,
  DoseLog,
  DoseStatus,
  FoodInstruction,
  Medication,
  MedicationAdherenceSummary,
  MedicationFrequency,
  ScheduledDoseInstance,
  TimeSlot,
} from '../types/pilluminati.ts';

export const DEFAULT_GRACE_PERIOD_MINUTES = 30;
export const DEFAULT_MISSED_AFTER_MINUTES = 180;

export const DOUBLE_DOSE_SAFETY_GUIDANCE =
  'Safety reminder: Never take a double dose or extra tablets to make up for a missed or unconfirmed dose unless specifically directed by your physician or pharmacist.';

export function parseTimeToMinutes(timeStr: string): number {
  const parts = String(timeStr || '').split(':');
  if (parts.length !== 2) return 0;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function formatTime12Hour(timeStr: string): string {
  const totalMinutes = parseTimeToMinutes(timeStr);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export function inferTimeSlotFromTime(hhmm: string): TimeSlot {
  const mins = parseTimeToMinutes(hhmm);
  if (mins < 12 * 60) return 'morning';
  if (mins < 17 * 60) return 'midday';
  if (mins < 20 * 60 + 30) return 'evening';
  return 'bedtime';
}

export function normalizeScheduledTimes(
  times: string[] | undefined,
  fallbackTime = '08:00',
): string[] {
  const validPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const source = Array.isArray(times) && times.length > 0 ? times : [fallbackTime];
  const unique = new Set<string>();
  for (const raw of source) {
    const clean = String(raw || '').trim();
    if (validPattern.test(clean)) {
      unique.add(clean);
    }
  }
  if (unique.size === 0) {
    unique.add(validPattern.test(fallbackTime) ? fallbackTime : '08:00');
  }
  return Array.from(unique).sort(
    (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b),
  );
}

export function getMedicationTimes(med: Medication): string[] {
  return normalizeScheduledTimes(med.scheduledTimes, med.scheduledTime || '08:00');
}

export function formatFoodInstructionLabel(food?: FoodInstruction): string {
  switch (food) {
    case 'before_food':
      return 'Take before food';
    case 'after_food':
      return 'Take after food';
    case 'with_food':
      return 'Take with food';
    case 'no_restriction':
    default:
      return 'No food restriction';
  }
}

export function formatFrequencyLabel(
  freq?: MedicationFrequency,
  weekdays?: number[],
  customIntervalDays?: number,
): string {
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (freq) {
    case 'twice_daily':
      return 'Twice daily';
    case 'three_times_daily':
      return 'Three times daily';
    case 'specific_weekdays': {
      const days = (weekdays || [])
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b)
        .map((d) => DAY_SHORT[d]);
      return days.length > 0 ? `Weekdays: ${days.join(', ')}` : 'Specific weekdays';
    }
    case 'custom': {
      const n = Math.max(1, Math.round(customIntervalDays ?? 2));
      return n === 1 ? 'Custom daily' : `Every ${n} days`;
    }
    case 'once_daily':
    default:
      return 'Once daily';
  }
}

export function formatDoseStatusLabel(status: DoseStatus): string {
  switch (status) {
    case 'upcoming':
    case 'pending':
      return 'Upcoming';
    case 'due':
      return 'Due now';
    case 'taken':
      return 'Taken';
    case 'unconfirmed':
      return 'Unconfirmed';
    case 'missed':
      return 'Missed';
    case 'skipped':
      return 'Skipped';
    case 'corrected':
      return 'Corrected';
  }
}

export function isValidTimeZone(tz: string | undefined): boolean {
  if (!tz || typeof tz !== 'string' || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getZonedNowParts(
  now: Date,
  timeZone?: string,
): {
  isoDate: string;
  minutesOfDay: number;
  hhmm: string;
  weekday: number;
  timeZone: string;
} {
  const safeTz = isValidTimeZone(timeZone) ? timeZone!.trim() : getBrowserTimeZone();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const map = new Map<string, string>();
    for (const p of parts) {
      map.set(p.type, p.value);
    }
    const year = map.get('year') || String(now.getFullYear());
    const month = map.get('month') || String(now.getMonth() + 1).padStart(2, '0');
    const day = map.get('day') || String(now.getDate()).padStart(2, '0');
    const rawHour = Number(map.get('hour') || now.getHours());
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(map.get('minute') || now.getMinutes());
    const isoDate = `${year}-${month}-${day}`;
    const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const weekday = parseIsoDateToUtcDayIndex(isoDate);
    return {
      isoDate,
      minutesOfDay: hour * 60 + minute,
      hhmm,
      weekday,
      timeZone: safeTz,
    };
  } catch {
    const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
      isoDate,
      minutesOfDay: now.getHours() * 60 + now.getMinutes(),
      hhmm,
      weekday: parseIsoDateToUtcDayIndex(isoDate),
      timeZone: 'UTC',
    };
  }
}

export function parseIsoDateToUtcDayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diffDaysIso(startIso: string, targetIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ty, tm, td] = targetIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ty || !tm || !td) return 0;
  const startMs = Date.UTC(sy, sm - 1, sd);
  const targetMs = Date.UTC(ty, tm - 1, td);
  return Math.round((targetMs - startMs) / 86_400_000);
}

export function buildDoseKey(
  medicationId: string,
  scheduledDate: string,
  scheduledTime: string,
): string {
  return `${medicationId}__${scheduledDate}__${scheduledTime}`;
}

export function isMedicationScheduledOnDate(
  med: Medication,
  isoDate: string,
  logsForDate: DoseLog[] = [],
): boolean {
  const hasHistoricalLog = logsForDate.some(
    (l) => l.medicationId === med.id && l.scheduledDate === isoDate,
  );

  if (med.discontinued) {
    const discDate = med.discontinuedAt ? med.discontinuedAt.slice(0, 10) : undefined;
    if (discDate && isoDate >= discDate) {
      return hasHistoricalLog;
    }
    if (!discDate) return hasHistoricalLog;
  }

  if (!med.active) {
    return hasHistoricalLog;
  }

  if (med.startDate && isoDate < med.startDate) {
    return hasHistoricalLog;
  }
  if (med.endDate && isoDate > med.endDate) {
    return hasHistoricalLog;
  }

  const freq = med.frequency || 'once_daily';
  if (freq === 'specific_weekdays') {
    const allowed = Array.isArray(med.weekdays) ? med.weekdays : [];
    if (allowed.length === 0) return true;
    const dayIdx = parseIsoDateToUtcDayIndex(isoDate);
    return allowed.includes(dayIdx) || hasHistoricalLog;
  }

  if (freq === 'custom') {
    const interval = Math.max(1, Math.round(med.customIntervalDays ?? 1));
    if (!med.startDate || interval === 1) return true;
    const delta = diffDaysIso(med.startDate, isoDate);
    return (delta >= 0 && delta % interval === 0) || hasHistoricalLog;
  }

  return true;
}

export function classifyUnloggedDoseStatus(params: {
  scheduledDate: string;
  scheduledTime: string;
  referenceNow: Date;
  timeZone?: string;
  gracePeriodMinutes?: number;
  missedAfterMinutes?: number;
}): {
  status: DoseStatus;
  minutesDelta: number;
  isDueNow: boolean;
  isUnconfirmedWindow: boolean;
  isMissedWindow: boolean;
  formattedCountdown: string;
} {
  const grace = params.gracePeriodMinutes ?? DEFAULT_GRACE_PERIOD_MINUTES;
  const missedAfter = Math.max(
    grace + 15,
    params.missedAfterMinutes ?? DEFAULT_MISSED_AFTER_MINUTES,
  );
  const zonedNow = getZonedNowParts(params.referenceNow, params.timeZone);
  const dayDiff = diffDaysIso(zonedNow.isoDate, params.scheduledDate);
  const schedMins = parseTimeToMinutes(params.scheduledTime);
  const deltaMinutes = dayDiff * 1440 + (schedMins - zonedNow.minutesOfDay);

  if (deltaMinutes > 15) {
    const hrs = Math.floor(deltaMinutes / 60);
    const mins = deltaMinutes % 60;
    const formattedCountdown =
      dayDiff > 0
        ? `Scheduled ${params.scheduledDate}`
        : hrs > 0
          ? `In ${hrs}h ${mins}m`
          : `In ${mins} min`;
    return {
      status: 'upcoming',
      minutesDelta: deltaMinutes,
      isDueNow: false,
      isUnconfirmedWindow: false,
      isMissedWindow: false,
      formattedCountdown,
    };
  }

  if (deltaMinutes >= -grace) {
    const overdueMins = Math.max(0, -deltaMinutes);
    return {
      status: 'due',
      minutesDelta: deltaMinutes,
      isDueNow: true,
      isUnconfirmedWindow: false,
      isMissedWindow: false,
      formattedCountdown:
        deltaMinutes > 0
          ? `Due in ${deltaMinutes} min`
          : overdueMins === 0
            ? 'Due now'
            : `Due (${overdueMins}m grace window)`,
    };
  }

  const overdueBy = -deltaMinutes;
  const hrs = Math.floor(overdueBy / 60);
  const mins = overdueBy % 60;
  const overdueLabel = hrs > 0 ? `${hrs}h ${mins}m overdue` : `${mins} min overdue`;

  if (overdueBy < missedAfter) {
    return {
      status: 'unconfirmed',
      minutesDelta: deltaMinutes,
      isDueNow: false,
      isUnconfirmedWindow: true,
      isMissedWindow: false,
      formattedCountdown: overdueLabel,
    };
  }

  // Note: Do not auto-treat past-window unconfirmed as permanently missed without review when < 1 day;
  // past missedAfter threshold it surfaces as missed-window needing safe review/classification.
  return {
    status: dayDiff < 0 ? 'missed' : 'unconfirmed',
    minutesDelta: deltaMinutes,
    isDueNow: false,
    isUnconfirmedWindow: dayDiff >= 0,
    isMissedWindow: true,
    formattedCountdown: overdueLabel,
  };
}

export function findMatchingDoseLog(
  logsForDate: DoseLog[],
  medicationId: string,
  scheduledTime: string,
  totalTimesForMed: number,
): DoseLog | null {
  const exact = logsForDate.find(
    (l) => l.medicationId === medicationId && l.scheduledTime === scheduledTime,
  );
  if (exact) return exact;

  // Backward compatibility for Phase 2 single-time logs whose scheduledTime was defaulted
  if (totalTimesForMed === 1) {
    const singleFallback = logsForDate.find((l) => l.medicationId === medicationId);
    if (singleFallback) return singleFallback;
  }
  return null;
}

export function expandScheduledDosesForDate(
  medications: Medication[],
  doseLogs: DoseLog[],
  targetDate: string,
  referenceNow: Date = new Date(),
): ScheduledDoseInstance[] {
  const logsForDate = doseLogs.filter((l) => l.scheduledDate === targetDate);
  const seenKeys = new Set<string>();
  const instances: ScheduledDoseInstance[] = [];

  for (const med of medications) {
    if (!isMedicationScheduledOnDate(med, targetDate, logsForDate)) {
      continue;
    }

    const times = getMedicationTimes(med);
    for (const scheduledTime of times) {
      const doseKey = buildDoseKey(med.id, targetDate, scheduledTime);
      if (seenKeys.has(doseKey)) continue;
      seenKeys.add(doseKey);

      const log = findMatchingDoseLog(logsForDate, med.id, scheduledTime, times.length);
      const timeSlot = times.length === 1 ? med.timeSlot : inferTimeSlotFromTime(scheduledTime);

      const timeEval = classifyUnloggedDoseStatus({
        scheduledDate: targetDate,
        scheduledTime,
        referenceNow,
        timeZone: med.timezone,
        gracePeriodMinutes: med.gracePeriodMinutes,
        missedAfterMinutes: med.missedAfterMinutes,
      });

      let status: DoseStatus;
      if (log) {
        if (log.status === 'pending') {
          status = timeEval.status;
        } else {
          status = log.status;
        }
      } else {
        status = timeEval.status;
      }

      instances.push({
        doseKey,
        medication: med,
        scheduledDate: targetDate,
        scheduledTime,
        timeSlot,
        status,
        log,
        minutesDelta: timeEval.minutesDelta,
        isDueNow: status === 'due',
        isUnconfirmedWindow: status === 'unconfirmed',
        isMissedWindow: status === 'missed' || timeEval.isMissedWindow,
        formattedCountdown:
          status === 'taken'
            ? `Taken at ${log?.actualConfirmedAt || log?.confirmedAt || scheduledTime}`
            : status === 'corrected'
              ? `Corrected (${log?.actualConfirmedAt || log?.confirmedAt || scheduledTime})`
              : status === 'skipped'
                ? 'Skipped intentionally'
                : status === 'missed'
                  ? 'Classified missed'
                  : timeEval.formattedCountdown,
      });
    }
  }

  return instances.sort(
    (a, b) =>
      parseTimeToMinutes(a.scheduledTime) - parseTimeToMinutes(b.scheduledTime) ||
      a.medication.name.localeCompare(b.medication.name),
  );
}

export function isConfirmedAdherenceStatus(status: DoseStatus): boolean {
  return status === 'taken' || status === 'corrected';
}

export function calculateDailyStatsFromInstances(
  instances: ScheduledDoseInstance[],
): DailyAdherenceStats {
  const totalScheduled = instances.length;
  if (totalScheduled === 0) {
    return {
      totalScheduled: 0,
      takenCount: 0,
      correctedCount: 0,
      pendingCount: 0,
      dueCount: 0,
      unconfirmedCount: 0,
      missedOrSkippedCount: 0,
      missedCount: 0,
      skippedCount: 0,
      percentage: 100,
    };
  }

  let takenCount = 0;
  let correctedCount = 0;
  let pendingCount = 0;
  let dueCount = 0;
  let unconfirmedCount = 0;
  let missedCount = 0;
  let skippedCount = 0;

  for (const inst of instances) {
    if (inst.status === 'taken') takenCount += 1;
    else if (inst.status === 'corrected') correctedCount += 1;
    else if (inst.status === 'due') dueCount += 1;
    else if (inst.status === 'unconfirmed') unconfirmedCount += 1;
    else if (inst.status === 'missed') missedCount += 1;
    else if (inst.status === 'skipped') skippedCount += 1;
    else pendingCount += 1;
  }

  const confirmedCount = takenCount + correctedCount;
  const percentage = Math.round((confirmedCount / totalScheduled) * 100);

  return {
    totalScheduled,
    takenCount: confirmedCount,
    correctedCount,
    pendingCount: pendingCount + dueCount,
    dueCount,
    unconfirmedCount,
    missedOrSkippedCount: missedCount + skippedCount,
    missedCount,
    skippedCount,
    percentage,
  };
}

export function computeCalendarMonthDays(
  medications: Medication[],
  doseLogs: DoseLog[],
  year: number,
  monthZeroIndexed: number,
  referenceNow: Date = new Date(),
): AdherenceCalendarDay[] {
  const firstDay = new Date(Date.UTC(year, monthZeroIndexed, 1));
  const startWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells: AdherenceCalendarDay[] = [];
  for (let idx = 0; idx < totalCells; idx += 1) {
    const dayOffset = idx - startWeekday;
    const cellDate = new Date(Date.UTC(year, monthZeroIndexed, 1 + dayOffset));
    const y = cellDate.getUTCFullYear();
    const m = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cellDate.getUTCDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    const inCurrentMonth = cellDate.getUTCMonth() === monthZeroIndexed;

    const instances = expandScheduledDosesForDate(
      medications,
      doseLogs,
      isoDate,
      referenceNow,
    );
    const stats = calculateDailyStatsFromInstances(instances);

    cells.push({
      date: isoDate,
      dayOfMonth: cellDate.getUTCDate(),
      inCurrentMonth,
      totalScheduled: stats.totalScheduled,
      takenCount: stats.takenCount - stats.correctedCount,
      correctedCount: stats.correctedCount,
      unconfirmedCount: stats.unconfirmedCount,
      missedCount: stats.missedCount,
      skippedCount: stats.skippedCount,
      percentage: stats.percentage,
    });
  }

  return cells;
}

export function computeMedicationAdherenceBreakdown(
  medications: Medication[],
  doseLogs: DoseLog[],
  dates: string[],
  referenceNow: Date = new Date(),
): MedicationAdherenceSummary[] {
  const summaryMap = new Map<string, MedicationAdherenceSummary>();

  for (const med of medications) {
    summaryMap.set(med.id, {
      medicationId: med.id,
      medicationName: med.name,
      dosage: med.dosage,
      active: med.active,
      discontinued: Boolean(med.discontinued),
      scheduledCount: 0,
      takenCount: 0,
      correctedCount: 0,
      unconfirmedCount: 0,
      missedCount: 0,
      skippedCount: 0,
      percentage: 100,
    });
  }

  for (const dateStr of dates) {
    const instances = expandScheduledDosesForDate(
      medications,
      doseLogs,
      dateStr,
      referenceNow,
    );
    for (const inst of instances) {
      const entry = summaryMap.get(inst.medication.id);
      if (!entry) continue;
      entry.scheduledCount += 1;
      if (inst.status === 'taken') entry.takenCount += 1;
      else if (inst.status === 'corrected') entry.correctedCount += 1;
      else if (inst.status === 'unconfirmed') entry.unconfirmedCount += 1;
      else if (inst.status === 'missed') entry.missedCount += 1;
      else if (inst.status === 'skipped') entry.skippedCount += 1;
    }
  }

  return Array.from(summaryMap.values()).map((entry) => ({
    ...entry,
    percentage:
      entry.scheduledCount === 0
        ? 100
        : Math.round(
            ((entry.takenCount + entry.correctedCount) / entry.scheduledCount) *
              100,
          ),
  }));
}

export function computeAdherenceStreak(
  medications: Medication[],
  doseLogs: DoseLog[],
  todayDate: string,
  lookbackDays = 60,
  referenceNow: Date = new Date(),
): AdherenceStreakInfo {
  const [ty, tm, td] = todayDate.split('-').map(Number);
  if (!ty || !tm || !td) {
    return { currentStreakDays: 0, bestStreakDays: 0, evaluatedDays: 0 };
  }

  const dates: string[] = [];
  for (let i = lookbackDays - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(ty, tm - 1, td - i));
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    );
  }

  const dayResults = dates
    .map((dateStr) => {
      const instances = expandScheduledDosesForDate(
        medications,
        doseLogs,
        dateStr,
        referenceNow,
      );
      const stats = calculateDailyStatsFromInstances(instances);
      return { dateStr, ...stats };
    })
    .filter((d) => d.totalScheduled > 0);

  if (dayResults.length === 0) {
    return { currentStreakDays: 0, bestStreakDays: 0, evaluatedDays: 0 };
  }

  let bestStreak = 0;
  let running = 0;
  for (const day of dayResults) {
    if (day.percentage === 100) {
      running += 1;
      if (running > bestStreak) bestStreak = running;
    } else {
      running = 0;
    }
  }

  // Current streak walks backwards from today; if today is still in progress (upcoming/due only, no missed/unconfirmed), check from yesterday
  let currentStreak = 0;
  const lastIdx = dayResults.length - 1;
  const todayResult = dayResults[lastIdx];
  const todayInProgressOnly =
    todayResult.dateStr === todayDate &&
    todayResult.percentage < 100 &&
    todayResult.missedOrSkippedCount === 0 &&
    todayResult.unconfirmedCount === 0;

  let startIdx = todayInProgressOnly ? lastIdx - 1 : lastIdx;
  for (let i = startIdx; i >= 0; i -= 1) {
    if (dayResults[i].percentage === 100) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreakDays: currentStreak,
    bestStreakDays: Math.max(bestStreak, currentStreak),
    evaluatedDays: dayResults.length,
  };
}

export function buildDatesInPastRange(endIsoDate: string, days: number): string[] {
  const [y, m, d] = endIsoDate.split('-').map(Number);
  if (!y || !m || !d) return [];
  const res: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    res.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`,
    );
  }
  return res;
}
