import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Flame,
  Lock,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
} from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import type { DoseLog, DoseStatus, ScheduledDoseInstance } from '../types/pilluminati';
import {
  buildDatesInPastRange,
  calculateDailyAdherence,
  computeAdherenceStreak,
  computeCalendarMonthDays,
  computeMedicationAdherenceBreakdown,
  computeWeeklyAdherenceSeries,
  DOUBLE_DOSE_SAFETY_GUIDANCE,
  expandScheduledDosesForDate,
  formatDoseStatusLabel,
  formatTime12Hour,
} from '../utils/adherence';
import { cn } from '../utils/cn';

type HistoryViewMode = 'daily' | 'weekly' | 'monthly' | 'calendar';

const VIEW_MODES: { value: HistoryViewMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly (7d)' },
  { value: 'monthly', label: 'Monthly (30d)' },
  { value: 'calendar', label: 'Calendar' },
];

const STATUS_FILTERS: { value: 'all' | DoseStatus; label: string }[] = [
  { value: 'all', label: 'All Logs' },
  { value: 'taken', label: 'Taken' },
  { value: 'corrected', label: 'Corrected' },
  { value: 'unconfirmed', label: 'Unconfirmed' },
  { value: 'missed', label: 'Missed' },
  { value: 'skipped', label: 'Skipped' },
];

function getStatusTextClass(status: DoseStatus): string {
  switch (status) {
    case 'taken':
      return 'text-[#116B4B]';
    case 'corrected':
      return 'text-[#1A7A68]';
    case 'unconfirmed':
    case 'due':
      return 'text-[#9E5A00]';
    case 'missed':
      return 'text-[#B42318]';
    case 'skipped':
      return 'text-[#5D4A96]';
    default:
      return 'text-[#4B7478]';
  }
}

export function HistoryPage() {
  const {
    medications,
    doseLogs,
    activeRole,
    familyPermissions,
    todayDate,
    canEditClinical,
    emailVerified,
    markDoseInstanceStatus,
  } = useCare();

  const [viewMode, setViewMode] = useState<HistoryViewMode>('weekly');
  const [selectedMedId, setSelectedMedId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DoseStatus>('all');
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);

  const [todayYear, todayMonthOneIndexed] = todayDate.split('-').map(Number);
  const [calendarYear, setCalendarYear] = useState<number>(todayYear || 2026);
  const [calendarMonth, setCalendarMonth] = useState<number>(
    (todayMonthOneIndexed || 1) - 1,
  );

  // Correction modal state
  const [correctingTarget, setCorrectingTarget] = useState<{
    instance?: ScheduledDoseInstance;
    log?: DoseLog;
  } | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<DoseStatus>('corrected');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);

  const scopedMeds = useMemo(
    () =>
      selectedMedId === 'all'
        ? medications
        : medications.filter((m) => m.id === selectedMedId),
    [medications, selectedMedId],
  );

  const scopedLogs = useMemo(
    () =>
      selectedMedId === 'all'
        ? doseLogs
        : doseLogs.filter((l) => l.medicationId === selectedMedId),
    [doseLogs, selectedMedId],
  );

  const weeklyDates = useMemo(() => buildDatesInPastRange(todayDate, 7), [todayDate]);
  const monthlyDates = useMemo(() => buildDatesInPastRange(todayDate, 30), [todayDate]);

  const weeklySeries = useMemo(
    () => computeWeeklyAdherenceSeries(scopedMeds, scopedLogs, weeklyDates),
    [scopedMeds, scopedLogs, weeklyDates],
  );

  const monthlySeries = useMemo(
    () => computeWeeklyAdherenceSeries(scopedMeds, scopedLogs, monthlyDates),
    [scopedMeds, scopedLogs, monthlyDates],
  );

  const dailyStats = useMemo(
    () => calculateDailyAdherence(scopedMeds, scopedLogs, selectedDate),
    [scopedMeds, scopedLogs, selectedDate],
  );

  const dailyInstances = useMemo(
    () => expandScheduledDosesForDate(scopedMeds, scopedLogs, selectedDate),
    [scopedMeds, scopedLogs, selectedDate],
  );

  const calendarDays = useMemo(
    () =>
      computeCalendarMonthDays(scopedMeds, scopedLogs, calendarYear, calendarMonth),
    [scopedMeds, scopedLogs, calendarYear, calendarMonth],
  );

  const streak = useMemo(
    () => computeAdherenceStreak(scopedMeds, scopedLogs, todayDate, 60),
    [scopedMeds, scopedLogs, todayDate],
  );

  const breakdownDates = viewMode === 'monthly' ? monthlyDates : weeklyDates;
  const perMedicationBreakdown = useMemo(
    () =>
      computeMedicationAdherenceBreakdown(
        medications,
        doseLogs,
        breakdownDates,
      ),
    [medications, doseLogs, breakdownDates],
  );

  const activeSeries = viewMode === 'monthly' ? monthlySeries : weeklySeries;
  const periodAverage = useMemo(() => {
    if (viewMode === 'daily') return dailyStats.percentage;
    const withScheduled = activeSeries.filter((d) => d.total > 0);
    if (withScheduled.length === 0) return 100;
    const totalTaken = withScheduled.reduce((acc, item) => acc + item.taken, 0);
    const totalSched = withScheduled.reduce((acc, item) => acc + item.total, 0);
    return totalSched === 0 ? 100 : Math.round((totalTaken / totalSched) * 100);
  }, [viewMode, dailyStats.percentage, activeSeries]);

  const filteredLogs = useMemo(() => {
    return scopedLogs
      .filter((log) => statusFilter === 'all' || log.status === statusFilter)
      .slice()
      .sort((a, b) => {
        if (a.scheduledDate !== b.scheduledDate) {
          return b.scheduledDate.localeCompare(a.scheduledDate);
        }
        return b.scheduledTime.localeCompare(a.scheduledTime);
      });
  }, [scopedLogs, statusFilter]);

  const isAdherenceHidden =
    activeRole === 'family' && !familyPermissions.showAdherencePercentage;
  const isDetailedMedsHidden =
    activeRole === 'family' && !familyPermissions.showDetailedMedications;

  const shiftCalendarMonth = (delta: number) => {
    const dt = new Date(Date.UTC(calendarYear, calendarMonth + delta, 1));
    setCalendarYear(dt.getUTCFullYear());
    setCalendarMonth(dt.getUTCMonth());
  };

  const openCorrectionForInstance = (inst: ScheduledDoseInstance) => {
    setCorrectingTarget({ instance: inst, log: inst.log ?? undefined });
    setCorrectionStatus(inst.status === 'missed' || inst.status === 'unconfirmed' ? 'corrected' : inst.status);
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const openCorrectionForLog = (log: DoseLog) => {
    const med = medications.find((m) => m.id === log.medicationId);
    if (!med) return;
    const matchedInst = expandScheduledDosesForDate([med], [log], log.scheduledDate).find(
      (i) => i.scheduledTime === log.scheduledTime,
    );
    setCorrectingTarget({ instance: matchedInst, log });
    setCorrectionStatus('corrected');
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingTarget?.instance) return;
    if (!correctionReason.trim()) {
      setCorrectionError('Enter a brief clinical reason for correcting this record.');
      return;
    }
    setSavingCorrection(true);
    try {
      await markDoseInstanceStatus(correctingTarget.instance, correctionStatus, {
        correctedFromStatus: correctingTarget.instance.status,
        correctionReason: correctionReason.trim(),
        note: `Corrected from ${correctingTarget.instance.status}: ${correctionReason.trim()}`,
      });
      setCorrectingTarget(null);
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <AppShell
      title="Adherence History"
      subtitle="Daily, weekly, monthly, calendar, and medication-specific adherence records."
    >
      {isAdherenceHidden ? (
        <Card tone="lavender" className="p-8 flex items-start gap-4">
          <Lock className="h-6 w-6 text-[#5D4A96] shrink-0" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Adherence History Restricted
            </h2>
            <p className="mt-2 text-base text-[#2C5E63]">
              Current patient privacy preferences hide adherence history from
              the Family perspective.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Top Controls: View Mode + Medication Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EBF6F1] p-1"
              role="tablist"
              aria-label="Adherence history timeframe"
            >
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode.value}
                  onClick={() => setViewMode(mode.value)}
                  className={cn(
                    'min-h-[44px] sm:min-h-[40px] rounded-lg px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0',
                    viewMode === mode.value
                      ? 'bg-white text-[#10373A] shadow-sm font-semibold'
                      : 'text-[#2C5E63] hover:text-[#10373A]',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {!isDetailedMedsHidden && (
              <div className="w-full md:w-72">
                <Select
                  label="Medication Filter"
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Medications' },
                    ...medications.map((m) => ({
                      value: m.id,
                      label: `${m.name} (${m.dosage})${m.discontinued ? ' — Discontinued' : ''}`,
                    })),
                  ]}
                />
              </div>
            )}
          </div>

          {/* KPI Strip: Streak & Period Adherence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card tone="mint" className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1A7A68]">
                <Flame className="h-4 w-4" />
                <span>Current Streak</span>
              </div>
              <p
                className="mt-1.5 font-mono text-2xl font-bold text-[#10373A] tabular-nums"
                data-testid="current-streak-days"
              >
                {streak.currentStreakDays} days
              </p>
              <p className="mt-1 text-xs text-[#2C5E63]">
                100% scheduled adherence streak
              </p>
            </Card>

            <Card tone="white" className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5D4A96]">
                <TrendingUp className="h-4 w-4" />
                <span>Best Streak</span>
              </div>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#10373A] tabular-nums">
                {streak.bestStreakDays} days
              </p>
              <p className="mt-1 text-xs text-[#4B7478]">
                Evaluated across {streak.evaluatedDays} active days
              </p>
            </Card>

            <Card tone="white" className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#4B7478]">
                <CheckCircle2 className="h-4 w-4 text-[#1A7A68]" />
                <span>
                  {viewMode === 'daily'
                    ? `${selectedDate} Adherence`
                    : viewMode === 'monthly'
                      ? '30-Day Adherence'
                      : '7-Day Adherence'}
                </span>
              </div>
              <p
                className="mt-1.5 font-mono text-2xl font-bold text-[#1A7A68] tabular-nums"
                data-testid="period-adherence-pct"
              >
                {periodAverage}%
              </p>
              <p className="mt-1 text-xs text-[#4B7478]">
                Taken + verified corrections
              </p>
            </Card>

            <Card tone="lavender" className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5D4A96]">
                <AlertCircle className="h-4 w-4" />
                <span>Corrections & Missed</span>
              </div>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#10373A] tabular-nums">
                {scopedLogs.filter((l) => l.status === 'corrected').length} /{' '}
                {scopedLogs.filter((l) => l.status === 'missed').length}
              </p>
              <p className="mt-1 text-xs text-[#4A397C]">
                Corrected vs classified missed
              </p>
            </Card>
          </div>

          {/* View 1: Weekly / Monthly Bar Chart */}
          {(viewMode === 'weekly' || viewMode === 'monthly') && (
            <Card tone="white" className="p-6 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#10373A]">
                    {viewMode === 'weekly'
                      ? '7-Day Adherence Rhythm'
                      : '30-Day Adherence Trend'}
                  </h2>
                  <p className="text-sm text-[#4B7478]">
                    Confirmed scheduled doses divided by scheduled doses for each day
                  </p>
                </div>
                <p className="font-mono text-lg font-bold text-[#1A7A68] tabular-nums">
                  {periodAverage}% avg
                </p>
              </div>

              <div className="mt-6 overflow-x-auto pb-1">
                <div
                  className={cn(
                    'flex items-end h-48 pt-4',
                    viewMode === 'weekly'
                      ? 'gap-3'
                      : 'gap-1.5 min-w-[580px] md:min-w-0',
                  )}
                >
                  {activeSeries.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day.date);
                        setViewMode('daily');
                      }}
                      className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1.5 cursor-pointer group"
                      title={`${day.date}: ${day.taken}/${day.total} confirmed (${day.percentage}%)`}
                    >
                      {viewMode === 'weekly' && (
                        <span className="font-mono text-xs font-semibold text-[#2C5E63] tabular-nums">
                          {day.percentage}%
                        </span>
                      )}
                      <div className="w-full max-w-[44px] flex-1 flex items-end rounded-lg bg-[#F1F8F5] p-0.5 group-hover:ring-1 group-hover:ring-[#1A7A68]">
                        <div
                          className={cn(
                            'w-full rounded-md transition-all duration-300',
                            day.total === 0
                              ? 'bg-[#D6E3DF]'
                              : day.percentage === 100
                                ? 'bg-[#1A7A68]'
                                : day.percentage >= 70
                                  ? 'bg-[#7EC1A8]'
                                  : 'bg-[#5D4A96]',
                          )}
                          style={{ height: `${Math.max(day.percentage, 8)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-[#4B7478] tabular-nums">
                        {viewMode === 'weekly' ? day.label : day.date.slice(8)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* View 2: Calendar History */}
          {viewMode === 'calendar' && (
            <Card tone="white" className="p-6 sm:p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#10373A]">
                    {new Date(Date.UTC(calendarYear, calendarMonth, 1)).toLocaleDateString(
                      'en-US',
                      { month: 'long', year: 'numeric', timeZone: 'UTC' },
                    )}
                  </h2>
                  <p className="text-sm text-[#4B7478]">
                    Select any day to review scheduled doses and correction workflows
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => shiftCalendarMonth(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => shiftCalendarMonth(1)}
                    aria-label="Next month"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[#4B7478]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2" data-testid="adherence-calendar-grid">
                {calendarDays.map((cell) => {
                  const isSelected = cell.date === selectedDate;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => setSelectedDate(cell.date)}
                      className={cn(
                        'min-h-[68px] rounded-xl border p-2 text-left transition-colors cursor-pointer flex flex-col justify-between',
                        !cell.inCurrentMonth && 'opacity-45 bg-[#FAF9F6]',
                        isSelected
                          ? 'border-[#10373A] bg-[#EBF6F1] ring-1 ring-[#10373A]'
                          : 'border-[#DCE5E2] bg-white hover:bg-[#FAF9F6]',
                      )}
                    >
                      <span className="font-mono text-xs font-bold text-[#10373A] tabular-nums">
                        {cell.dayOfMonth}
                      </span>
                      {cell.totalScheduled > 0 ? (
                        <span
                          className={cn(
                            'font-mono text-xs font-semibold tabular-nums',
                            cell.percentage === 100
                              ? 'text-[#116B4B]'
                              : cell.missedCount > 0
                                ? 'text-[#B42318]'
                                : 'text-[#9E5A00]',
                          )}
                        >
                          {cell.percentage}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#8FA8AA]">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* View 3: Daily (or Calendar Selected Day) Breakdown */}
          {(viewMode === 'daily' || viewMode === 'calendar') && (
            <Card tone="white" className="p-6 sm:p-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#10373A]">
                    Scheduled Doses for {selectedDate}
                  </h2>
                  <p className="text-sm text-[#4B7478] tabular-nums">
                    {dailyStats.takenCount} confirmed of {dailyStats.totalScheduled}{' '}
                    scheduled ({dailyStats.percentage}%)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-[#4B7478]" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    aria-label="Inspect adherence date"
                    className="min-h-[40px] rounded-xl border border-[#C9D8D4] bg-white px-3 text-sm text-[#10373A]"
                  />
                </div>
              </div>

              {isDetailedMedsHidden ? (
                <p className="rounded-xl bg-[#F5F2FB] p-4 text-sm text-[#4A397C]">
                  Detailed dose names are hidden by family visibility permissions.
                </p>
              ) : dailyInstances.length === 0 ? (
                <p className="text-sm text-[#4B7478]">
                  No active medications were scheduled on {selectedDate}.
                </p>
              ) : (
                <div className="divide-y divide-[#EBF0EE]">
                  {dailyInstances.map((inst) => (
                    <div
                      key={inst.doseKey}
                      className="py-3.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold tabular-nums">
                          <span className="font-mono text-[#1A7A68]">
                            {formatTime12Hour(inst.scheduledTime)}
                          </span>
                          <span aria-hidden="true" className="text-[#CBD8D4]">
                            ·
                          </span>
                          <span className={getStatusTextClass(inst.status)}>
                            {formatDoseStatusLabel(inst.status)}
                          </span>
                          <span aria-hidden="true" className="text-[#CBD8D4]">
                            ·
                          </span>
                          <span className="text-[#4B7478]">{inst.formattedCountdown}</span>
                        </div>
                        <p className="font-display text-base font-bold text-[#10373A]">
                          {inst.medication.name} · {inst.medication.dosage}
                        </p>
                        {inst.log?.correctionReason && (
                          <p className="text-xs text-[#4A397C]">
                            Correction note: {inst.log.correctionReason}
                          </p>
                        )}
                      </div>

                      {canEditClinical && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!emailVerified}
                            onClick={() => openCorrectionForInstance(inst)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Correct / Update
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Medication-Specific Breakdown */}
          {!isDetailedMedsHidden && perMedicationBreakdown.length > 0 && (
            <Card tone="white" className="p-6 sm:p-7 space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-[#10373A]">
                  Medication-Specific Breakdown ({viewMode === 'monthly' ? '30 days' : '7 days'})
                </h2>
                <span className="text-xs font-medium text-[#4B7478]">
                  Includes discontinued meds for historical dates
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DCE5E2] text-xs font-semibold text-[#4B7478]">
                      <th className="py-2.5 pr-4">Medication</th>
                      <th className="py-2.5 pr-4">Scheduled</th>
                      <th className="py-2.5 pr-4">Taken</th>
                      <th className="py-2.5 pr-4">Corrected</th>
                      <th className="py-2.5 pr-4">Unconfirmed / Missed</th>
                      <th className="py-2.5">Adherence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBF0EE] text-sm tabular-nums">
                    {perMedicationBreakdown.map((item) => (
                      <tr key={item.medicationId}>
                        <td className="py-3 pr-4 font-semibold text-[#10373A]">
                          {item.medicationName} · {item.dosage}
                          {item.discontinued && (
                            <span className="ml-2 text-xs font-normal text-[#6B7280]">
                              (Discontinued)
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[#2C5E63]">
                          {item.scheduledCount}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[#116B4B]">
                          {item.takenCount}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[#1A7A68]">
                          {item.correctedCount}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[#9E5A00]">
                          {item.unconfirmedCount} / {item.missedCount}
                        </td>
                        <td className="py-3 font-mono text-sm font-bold text-[#10373A]">
                          {item.percentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Dose Audit Trail */}
          <Card tone="white" className="p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-[#10373A]">
                Dose Confirmation Audit Log
              </h2>
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EBF6F1] p-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={cn(
                      'min-h-[42px] sm:min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0',
                      statusFilter === f.value
                        ? 'bg-white text-[#10373A] shadow-sm font-semibold'
                        : 'text-[#2C5E63] hover:text-[#10373A]',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {isDetailedMedsHidden ? (
              <p className="rounded-xl bg-[#F5F2FB] p-4 text-sm text-[#4A397C]">
                Detailed per-medication records are hidden by patient privacy
                settings. Aggregate daily percentages remain visible above.
              </p>
            ) : filteredLogs.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No adherence log entries match the selected filter yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DCE5E2] text-xs font-semibold text-[#4B7478]">
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 pr-4">Scheduled</th>
                      <th className="py-3 pr-4">Medication</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Confirmation & Audit Detail</th>
                      {canEditClinical && <th className="py-3">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBF0EE] text-sm">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FAF9F6]">
                        <td className="py-3 pr-4 font-mono text-xs text-[#2C5E63] tabular-nums whitespace-nowrap">
                          {log.scheduledDate}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[#10373A] tabular-nums whitespace-nowrap">
                          {formatTime12Hour(log.scheduledTime)}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-[#10373A]">
                          {log.medicationName} · {log.dosage}
                        </td>
                        <td className="py-3 pr-4 font-semibold whitespace-nowrap">
                          <span className={getStatusTextClass(log.status)}>
                            {formatDoseStatusLabel(log.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[#4B7478]">
                          <div>
                            {log.confirmedBy
                              ? `${log.confirmedBy} (${log.confirmedAt || log.scheduledTime})`
                              : log.note || 'Awaiting confirmation'}
                          </div>
                          {log.correctedFromStatus && (
                            <div className="text-xs text-[#5D4A96] mt-0.5">
                              Corrected from {log.correctedFromStatus}: {log.correctionReason}
                            </div>
                          )}
                        </td>
                        {canEditClinical && (
                          <td className="py-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!emailVerified}
                              onClick={() => openCorrectionForLog(log)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Correct
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Safe Adherence Correction Modal */}
      <Modal
        open={Boolean(correctingTarget)}
        onClose={() => setCorrectingTarget(null)}
        title="Correct or Classify Dose Record"
        description={
          correctingTarget?.instance
            ? `${correctingTarget.instance.medication.name} (${correctingTarget.instance.scheduledDate} at ${formatTime12Hour(correctingTarget.instance.scheduledTime)})`
            : 'Update dose record with audit reason'
        }
      >
        <form onSubmit={handleSaveCorrection} className="space-y-4">
          <div className="rounded-xl border border-[#DDD4F2] bg-[#F5F2FB] p-3.5 flex items-start gap-2.5 text-xs text-[#4A397C]">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{DOUBLE_DOSE_SAFETY_GUIDANCE}</span>
          </div>

          <Select
            label="Corrected Dose Status"
            value={correctionStatus}
            onChange={(e) => setCorrectionStatus(e.target.value as DoseStatus)}
            options={[
              { value: 'corrected', label: 'Corrected (Verified Taken Late/Offline)' },
              { value: 'taken', label: 'Taken' },
              { value: 'skipped', label: 'Skipped (Intentional / Clinical Hold)' },
              { value: 'missed', label: 'Missed (Verified Missed)' },
              { value: 'unconfirmed', label: 'Unconfirmed (Needs Follow-Up)' },
            ]}
          />

          <Input
            label="Reason for Correction / Audit Note"
            placeholder="e.g., Patient confirmed taking dose on time before app check-in"
            value={correctionReason}
            onChange={(e) => {
              setCorrectionReason(e.target.value);
              setCorrectionError(null);
            }}
            error={correctionError ?? undefined}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setCorrectingTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingCorrection}>
              {savingCorrection ? 'Saving...' : 'Save Audit Correction'}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
