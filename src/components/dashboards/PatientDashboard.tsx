import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BellRing,
  Calendar,
  Check,
  Clock,
  Flame,
  Heart,
  MessageCircleHeart,
  Phone,
  RotateCcw,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import { GrandmasVoicePanel } from '../GrandmasVoicePanel';
import { PilluMascot } from '../PilluMascot';
import { Button, Card, EmptyState } from '../ui/Primitives';
import { useCare } from '../../context/CareContext';
import {
  calculateDailyStatsFromInstances,
  computeAdherenceStreak,
  DOUBLE_DOSE_SAFETY_GUIDANCE,
  formatDoseStatusLabel,
  formatFoodInstructionLabel,
  formatTime12Hour,
  getGreetingForHour,
  getNextUpcomingDose,
  getPilluContextualCopy,
  getPilluMoodForState,
  isTimeInQuietHours,
} from '../../utils/adherence';
import {
  formatAvailabilityStatusLabel,
  formatCaregiverTierLabel,
  partitionCaregiversByTier,
} from '../../utils/careRelay';
import { cn } from '../../utils/cn';

export function PatientDashboard() {
  const {
    medications,
    doseLogs,
    scheduledDosesToday,
    markDoseInstanceStatus,
    justConfirmedDoseId,
    appointments,
    members,
    notifyUnconfirmedDoses,
    patientFeelingUnwell,
    reportPatientWellness,
    settings,
    todayDate,
    activePatientProfile,
    activeProfile,
    emailVerified,
  } = useCare();
  const navigate = useNavigate();
  const [notifyingCaregivers, setNotifyingCaregivers] = useState(false);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);
  const [updatingWellness, setUpdatingWellness] = useState(false);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const greeting = getGreetingForHour(now.getHours());

  const stats = useMemo(
    () => calculateDailyStatsFromInstances(scheduledDosesToday),
    [scheduledDosesToday],
  );

  const streak = useMemo(
    () => computeAdherenceStreak(medications, doseLogs, todayDate, 60),
    [medications, doseLogs, todayDate],
  );

  const nextDose = useMemo(
    () => getNextUpcomingDose(medications, doseLogs, todayDate, nowMinutes, now),
    [medications, doseLogs, todayDate, nowMinutes],
  );

  const nextDoseInstance = useMemo(() => {
    if (!nextDose) return null;
    return (
      scheduledDosesToday.find((inst) => inst.doseKey === nextDose.doseKey) ?? null
    );
  }, [scheduledDosesToday, nextDose]);

  const unconfirmedInstances = useMemo(
    () => scheduledDosesToday.filter((inst) => inst.status === 'unconfirmed'),
    [scheduledDosesToday],
  );

  const remainingCount = stats.pendingCount;
  const firstName = (
    activePatientProfile?.fullName || activeProfile.displayName
  ).split(' ')[0];
  const quietHoursActive = isTimeInQuietHours(
    nowMinutes,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  );
  const pilluMood = getPilluMoodForState(
    stats,
    Boolean(nextDose?.isOverdue || stats.unconfirmedCount > 0),
    Boolean(justConfirmedDoseId),
    {
      hasUpcomingDose: Boolean(nextDose && !nextDose.isOverdue),
      patientFeelingUnwell,
      isQuietHours: quietHoursActive,
    },
  );
  const pilluCopy = getPilluContextualCopy({
    mood: pilluMood,
    stats,
    nextDose,
    patientFirstName: firstName,
    role: 'patient',
  });

  const { primary: primaryCaregivers, backup: backupCaregivers } = useMemo(
    () => partitionCaregiversByTier(members),
    [members],
  );
  const careRelayTeam = useMemo(
    () => [...primaryCaregivers, ...backupCaregivers],
    [primaryCaregivers, backupCaregivers],
  );
  const upcomingAppointments = appointments
    .filter((a) => a.status === 'upcoming')
    .slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Greeting & Pillu Companion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <Card tone="mint" className="lg:col-span-7 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1A7A68]">
              {now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <h2 className="font-display mt-1.5 text-2xl sm:text-3xl font-bold text-[#10373A]">
              {greeting}, {(activePatientProfile?.fullName || activeProfile.displayName).split(' ')[0]}
            </h2>
          </div>
          <div className="mt-5">
            <PilluMascot
              state={pilluMood}
              size="md"
              message={pilluCopy.message}
              subMessage={pilluCopy.subMessage}
              bounceOnHappy={Boolean(justConfirmedDoseId)}
              animationConfig={{ reducedMotion: settings.reducedMotion }}
            />
          </div>
          <div className="mt-5 pt-4 border-t border-[#CBE4D8] flex flex-wrap items-center gap-3">
            <Link to="/companion">
              <Button variant="secondary" size="sm">
                <MessageCircleHeart className="h-4 w-4" />
                Chat with Pillu
              </Button>
            </Link>
            <Button
              variant={patientFeelingUnwell ? 'secondary' : 'lavender'}
              size="sm"
              disabled={!emailVerified || updatingWellness}
              data-testid="wellness-checkin-btn"
              onClick={async () => {
                setUpdatingWellness(true);
                try {
                  await reportPatientWellness(!patientFeelingUnwell);
                } finally {
                  setUpdatingWellness(false);
                }
              }}
            >
              <Heart className="h-4 w-4" />
              {updatingWellness
                ? 'Updating...'
                : patientFeelingUnwell
                  ? 'I’m Feeling Better'
                  : 'Feeling Unwell'}
            </Button>
            <Link
              to="/medications"
              className="text-sm font-semibold text-[#10373A] hover:underline underline-offset-4 px-2 py-1"
            >
              Manage full schedule
            </Link>
          </div>
        </Card>

        {/* Daily Adherence Progress */}
        <Card tone="white" className="lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Daily Adherence Progress
              </h3>
              <span
                className="font-mono text-2xl font-bold text-[#1A7A68] tabular-nums"
                data-testid="daily-adherence-percentage"
              >
                {stats.percentage}%
              </span>
            </div>
            <p className="mt-1 text-sm text-[#4B7478] tabular-nums">
              {stats.takenCount} of {stats.totalScheduled} scheduled doses confirmed today
            </p>

            <div
              className="mt-5 h-4 w-full overflow-hidden rounded-full bg-[#EBF6F1]"
              role="progressbar"
              aria-valuenow={stats.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily medication adherence progress"
            >
              <div
                className="h-full rounded-full bg-[#1A7A68] transition-all duration-300"
                style={{ width: `${stats.percentage}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[#EBF0EE] pt-4 text-center">
            <div>
              <p className="font-mono text-xl font-bold text-[#10373A] tabular-nums" data-testid="taken-count">
                {stats.takenCount}
              </p>
              <p className="text-xs text-[#4B7478]">Taken</p>
            </div>
            <div>
              <p className="font-mono text-xl font-bold text-[#9E5A00] tabular-nums">
                {stats.unconfirmedCount}
              </p>
              <p className="text-xs text-[#4B7478]">Unconfirmed</p>
            </div>
            <div>
              <p className="font-mono text-xl font-bold text-[#2C5E63] tabular-nums">
                {remainingCount}
              </p>
              <p className="text-xs text-[#4B7478]">Remaining</p>
            </div>
            <div>
              <p className="font-mono text-xl font-bold text-[#1A7A68] tabular-nums inline-flex items-center justify-center gap-1">
                <Flame className="h-4 w-4" />
                {streak.currentStreakDays}
              </p>
              <p className="text-xs text-[#4B7478]">Streak</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Unconfirmed Doses Safe Check-In */}
      {unconfirmedInstances.length > 0 && (
        <Card
          tone="warm"
          className="p-6 border-[#EED29F] bg-[#FFFBF2] space-y-4"
          data-testid="unconfirmed-doses-banner"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-[#9E5A00] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-lg font-bold text-[#10373A]">
                  Quick Check-In: {unconfirmedInstances.length} Unconfirmed{' '}
                  {unconfirmedInstances.length === 1 ? 'Dose' : 'Doses'}
                </h3>
                <p className="text-sm text-[#4B7478] mt-0.5">
                  Did you take {unconfirmedInstances.length === 1 ? 'this dose' : 'these doses'} earlier without tapping confirm?
                </p>
              </div>
            </div>
            {careRelayTeam.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!emailVerified || notifyingCaregivers}
                onClick={async () => {
                  setNotifyingCaregivers(true);
                  try {
                    const res = await notifyUnconfirmedDoses();
                    setNotifyNote(res.summary);
                  } finally {
                    setNotifyingCaregivers(false);
                  }
                }}
              >
                <BellRing className="h-4 w-4" />
                {notifyingCaregivers ? 'Notifying...' : 'Notify Caregivers'}
              </Button>
            )}
          </div>
          {notifyNote && (
            <p className="rounded-lg border border-[#EFE3C8] bg-white px-3 py-2 text-xs text-[#6B4200]">
              {notifyNote}
            </p>
          )}

          <div className="divide-y divide-[#EFE3C8]">
            {unconfirmedInstances.map((inst) => (
              <div
                key={inst.doseKey}
                className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-[#9E5A00] tabular-nums">
                    {formatTime12Hour(inst.scheduledTime)} · {inst.formattedCountdown}
                  </p>
                  <p className="font-display text-base font-bold text-[#10373A]">
                    {inst.medication.name} · {inst.medication.dosage}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    size="md"
                    disabled={!emailVerified}
                    onClick={() =>
                      markDoseInstanceStatus(inst, 'taken', {
                        note: `Confirmed late check-in by ${activeProfile.displayName}`,
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                    Yes, I Took It
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={!emailVerified}
                    onClick={() =>
                      markDoseInstanceStatus(inst, 'skipped', {
                        note: `Marked skipped during check-in`,
                      })
                    }
                  >
                    <SkipForward className="h-4 w-4" />
                    Skipped
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-white/80 border border-[#EFE3C8] px-3.5 py-2.5 text-xs text-[#6B4200]">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[#9E5A00]" />
            <span>{DOUBLE_DOSE_SAFETY_GUIDANCE}</span>
          </p>
        </Card>
      )}

      {/* Next Scheduled Dose Spotlight */}
      {nextDose && nextDoseInstance ? (
        <Card
          tone="lavender"
          className="p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6"
          data-testid="next-dose-spotlight"
        >
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5D4A96]">
              {nextDose.isOverdue ? 'Ready for Confirmation' : 'Next Scheduled Dose'}
            </p>
            <h3 className="font-display text-2xl font-bold text-[#10373A]">
              {nextDose.medication.name} · {nextDose.medication.dosage}
            </h3>
            <p className="text-base text-[#2C5E63]">
              {formatTime12Hour(nextDose.scheduledTime)} ·{' '}
              <span className="font-semibold text-[#4A397C]">
                {nextDose.formattedCountdown}
              </span>{' '}
              · {formatFoodInstructionLabel(nextDose.medication.foodInstruction)} ·{' '}
              {nextDose.medication.instructions}
            </p>
          </div>
          <Button
            size="lg"
            disabled={!emailVerified}
            onClick={() => markDoseInstanceStatus(nextDoseInstance, 'taken')}
            className="min-w-[220px]"
            data-testid="one-tap-next-dose-btn"
          >
            <Check className="h-5 w-5" />
            Mark {nextDose.medication.name} Taken
          </Button>
        </Card>
      ) : scheduledDosesToday.length > 0 ? (
        <Card tone="mint" className="p-6 text-center">
          <p className="font-display text-lg font-bold text-[#10373A]">
            All scheduled doses for today have been handled.
          </p>
          <p className="mt-1 text-sm text-[#2C5E63]">
            Your authorized care circle can see your updated progress in real time.
          </p>
        </Card>
      ) : null}

      {/* Grandma's Voice Guided Logging (or Clear One-Tap Fallback) */}
      <GrandmasVoicePanel
        scheduledDosesToday={scheduledDosesToday}
        emailVerified={emailVerified}
        onConfirmDose={(dose) =>
          markDoseInstanceStatus(dose, 'taken', {
            note: `Confirmed via Grandma's Voice by ${activeProfile.displayName}`,
          })
        }
        onJumpToOneTap={() => {
          document
            .getElementById('todays-doses-section')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* Today's Medications List + Right Column (Appointments & Caregiver) */}
      <div
        id="todays-doses-section"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-xl font-bold text-[#10373A]">
              Today’s Scheduled Doses
            </h3>
            <Link
              to="/history"
              className="text-sm font-semibold text-[#1A7A68] hover:underline underline-offset-4"
            >
              View adherence history
            </Link>
          </div>

          {scheduledDosesToday.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-6 w-6" />}
              title="No active medications scheduled today"
              description="Add a prescription or review weekday/date schedule rules to begin one-tap tracking."
              actionLabel="Manage Medications"
              onAction={() => navigate('/medications')}
            />
          ) : (
            <div className="space-y-3" data-testid="todays-medications-list">
              {scheduledDosesToday.map((inst) => {
                const med = inst.medication;
                const isDone = inst.status === 'taken' || inst.status === 'corrected';
                const isSkippedOrMissed =
                  inst.status === 'skipped' || inst.status === 'missed';
                const isUnconfirmed = inst.status === 'unconfirmed';

                return (
                  <Card
                    key={inst.doseKey}
                    tone="white"
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-[#1A7A68] tabular-nums">
                          {formatTime12Hour(inst.scheduledTime)}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD8D4]">
                          ·
                        </span>
                        <span className="text-xs font-semibold capitalize text-[#4B7478]">
                          {inst.timeSlot}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD8D4]">
                          ·
                        </span>
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            isDone
                              ? 'text-[#116B4B]'
                              : isUnconfirmed
                                ? 'text-[#9E5A00]'
                                : inst.status === 'missed'
                                  ? 'text-[#B42318]'
                                  : 'text-[#4B7478]',
                          )}
                        >
                          {formatDoseStatusLabel(inst.status)}
                          {isDone && inst.log?.confirmedAt
                            ? ` at ${inst.log.confirmedAt}`
                            : ''}
                        </span>
                      </div>
                      <h4 className="font-display text-lg font-bold text-[#10373A]">
                        {med.name} — {med.dosage}
                      </h4>
                      <p className="text-sm text-[#4B7478]">
                        {formatFoodInstructionLabel(med.foodInstruction)} ·{' '}
                        {med.instructions} ({med.pillAppearance})
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isDone || isSkippedOrMissed ? (
                        <Button
                          variant="ghost"
                          size="md"
                          disabled={!emailVerified}
                          onClick={() =>
                            markDoseInstanceStatus(inst, 'pending', {
                              note: 'Reset confirmation status',
                            })
                          }
                          aria-label={`Reset status for ${med.name} at ${formatTime12Hour(inst.scheduledTime)}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reset
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="md"
                            disabled={!emailVerified}
                            onClick={() =>
                              markDoseInstanceStatus(inst, 'skipped', {
                                note: 'Skipped by patient',
                              })
                            }
                            aria-label={`Skip ${med.name} at ${formatTime12Hour(inst.scheduledTime)}`}
                          >
                            Skip
                          </Button>
                          <Button
                            variant={isUnconfirmed || inst.isDueNow ? 'primary' : 'secondary'}
                            size="lg"
                            disabled={!emailVerified}
                            onClick={() => markDoseInstanceStatus(inst, 'taken')}
                            aria-label={`Mark ${med.name} as taken`}
                          >
                            <Check className="h-4 w-4" />
                            Mark Taken
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Upcoming Appointments + Caregiver Info */}
        <div className="lg:col-span-5 space-y-6">
          <Card tone="white" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Upcoming Appointments
              </h3>
              <Link
                to="/appointments"
                className="text-sm font-semibold text-[#1A7A68] hover:underline underline-offset-4"
              >
                All visits
              </Link>
            </div>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No upcoming appointments scheduled.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {upcomingAppointments.map((appt) => (
                  <div key={appt.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#5D4A96]">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="tabular-nums">
                        {appt.date} · {formatTime12Hour(appt.time)}
                      </span>
                    </div>
                    <p className="mt-1 font-display text-base font-bold text-[#10373A]">
                      {appt.title}
                    </p>
                    <p className="text-sm text-[#4B7478]">
                      {appt.doctorName} · Escort: {appt.assignedCaregiver}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {careRelayTeam.length > 0 && (
            <Card tone="white" className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-[#10373A]">
                  Care Relay Team
                </h3>
                <Link
                  to="/caregivers"
                  className="text-sm font-semibold text-[#1A7A68] hover:underline underline-offset-4"
                >
                  Care Relay
                </Link>
              </div>
              <div className="divide-y divide-[#EBF0EE]">
                {careRelayTeam.map((cg) => (
                  <div
                    key={cg.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={cg.avatarUrl}
                        alt={cg.name}
                        referrerPolicy="no-referrer"
                        className="h-11 w-11 rounded-full object-cover border border-[#C6E3D5] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-[#10373A] truncate">
                          {cg.name}
                        </p>
                        <p className="text-xs text-[#4B7478] truncate">
                          {formatCaregiverTierLabel(cg.caregiverTier)} · {cg.relation}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-semibold shrink-0',
                        cg.availabilityStatus === 'busy'
                          ? 'text-[#9E5A00]'
                          : cg.availabilityStatus === 'away'
                            ? 'text-[#4B7478]'
                            : 'text-[#116B4B]',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-2 w-2 rounded-full',
                          cg.availabilityStatus === 'busy'
                            ? 'bg-[#D97706]'
                            : cg.availabilityStatus === 'away'
                              ? 'bg-[#8FA8AA]'
                              : 'bg-[#16A34A]',
                        )}
                      />
                      {formatAvailabilityStatusLabel(cg.availabilityStatus)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#F1F8F5] px-4 py-3 text-xs text-[#2C5E63]">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Phone className="h-3.5 w-3.5 text-[#1A7A68]" />
                  {primaryCaregivers[0]
                    ? `${primaryCaregivers[0].name} (Primary)`
                    : 'Care Relay Active'}
                </span>
                <Link
                  to="/caregivers"
                  className="font-semibold text-[#1A7A68] hover:underline"
                >
                  Manage status
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
