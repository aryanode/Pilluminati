import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Flame,
  MessageCircleHeart,
  ShieldAlert,
} from 'lucide-react';
import { PilluMascot } from '../PilluMascot';
import { Button, Card, Input, Modal, Select } from '../ui/Primitives';
import { useCare } from '../../context/CareContext';
import type {
  CaregiverAvailabilityStatus,
  DoseStatus,
  ScheduledDoseInstance,
} from '../../types/pilluminati';
import {
  buildDatesInPastRange,
  calculateDailyStatsFromInstances,
  computeAdherenceStreak,
  computeWeeklyAdherenceSeries,
  DOUBLE_DOSE_SAFETY_GUIDANCE,
  formatDoseStatusLabel,
  formatFoodInstructionLabel,
  formatTime12Hour,
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

export function CaregiverDashboard() {
  const {
    firebaseUser,
    medications,
    medicationChanges,
    doseLogs,
    scheduledDosesToday,
    markDoseInstanceStatus,
    justConfirmedDoseId,
    appointments,
    handoffs,
    alerts,
    patientFeelingUnwell,
    reportPatientWellness,
    notificationDeliveries,
    resolveAlert,
    notifyUnconfirmedDoses,
    members,
    updateCaregiverAvailability,
    authorizedProfiles,
    activePatientProfile,
    activeProfile,
    addCareUpdate,
    settings,
    todayDate,
    emailVerified,
  } = useCare();
  const [runningCheck, setRunningCheck] = useState(false);
  const [schedulerFeedback, setSchedulerFeedback] = useState<string | null>(null);
  const [correctingInst, setCorrectingInst] = useState<ScheduledDoseInstance | null>(
    null,
  );
  const [correctionStatus, setCorrectionStatus] = useState<DoseStatus>('corrected');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);

  const stats = useMemo(
    () => calculateDailyStatsFromInstances(scheduledDosesToday),
    [scheduledDosesToday],
  );

  const streak = useMemo(
    () => computeAdherenceStreak(medications, doseLogs, todayDate, 60),
    [medications, doseLogs, todayDate],
  );

  const weeklySeries = useMemo(() => {
    const dates = buildDatesInPastRange(todayDate, 7);
    return computeWeeklyAdherenceSeries(medications, doseLogs, dates);
  }, [medications, doseLogs, todayDate]);

  const weeklyAverage = useMemo(() => {
    const active = weeklySeries.filter((d) => d.total > 0);
    if (active.length === 0) return 100;
    const sumTaken = active.reduce((acc, d) => acc + d.taken, 0);
    const sumTotal = active.reduce((acc, d) => acc + d.total, 0);
    return sumTotal === 0 ? 100 : Math.round((sumTaken / sumTotal) * 100);
  }, [weeklySeries]);

  const patient = members.find((m) => m.role === 'patient');
  const { primary: primaryCaregivers, backup: backupCaregivers } = useMemo(
    () => partitionCaregiversByTier(members),
    [members],
  );
  const careRelayTeam = useMemo(
    () => [...primaryCaregivers, ...backupCaregivers],
    [primaryCaregivers, backupCaregivers],
  );
  const myCaregiverRecord = useMemo(
    () =>
      careRelayTeam.find(
        (m) => firebaseUser?.uid && m.uid === firebaseUser.uid,
      ) ?? null,
    [careRelayTeam, firebaseUser?.uid],
  );

  const unconfirmedOrPendingDoses = useMemo(
    () =>
      scheduledDosesToday.filter(
        (inst) =>
          inst.status === 'unconfirmed' ||
          inst.status === 'due' ||
          inst.status === 'upcoming' ||
          inst.status === 'pending',
      ),
    [scheduledDosesToday],
  );

  const activeAlerts = alerts.filter((a) => !a.resolved);
  const activeRelay = handoffs[0];
  const upcomingAppointments = appointments
    .filter((a) => a.status === 'upcoming')
    .slice(0, 3);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextDose = useMemo(
    () => getNextUpcomingDose(medications, doseLogs, todayDate, nowMinutes, now),
    [medications, doseLogs, todayDate, nowMinutes],
  );
  const patientFirstName = (
    activePatientProfile?.fullName ||
    patient?.name ||
    'Patient'
  ).split(' ')[0];
  const pilluMood = getPilluMoodForState(
    stats,
    Boolean(nextDose?.isOverdue || stats.unconfirmedCount > 0),
    Boolean(justConfirmedDoseId),
    {
      hasUpcomingDose: Boolean(nextDose && !nextDose.isOverdue),
      patientFeelingUnwell,
      isQuietHours: isTimeInQuietHours(
        nowMinutes,
        settings.quietHoursStart,
        settings.quietHoursEnd,
      ),
    },
  );
  const pilluCopy = getPilluContextualCopy({
    mood: pilluMood,
    stats,
    nextDose,
    patientFirstName,
    role: 'caregiver',
  });

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingInst) return;
    if (!correctionReason.trim()) {
      setCorrectionError('Provide a reason for this clinical dose correction.');
      return;
    }
    setSavingCorrection(true);
    try {
      await markDoseInstanceStatus(correctingInst, correctionStatus, {
        correctedFromStatus: correctingInst.status,
        correctionReason: correctionReason.trim(),
        note: `Corrected by caregiver ${activeProfile.displayName}: ${correctionReason.trim()}`,
      });
      setCorrectingInst(null);
      setCorrectionReason('');
      setCorrectionError(null);
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Caregiver KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card tone="mint" className="p-5">
          <p className="text-xs font-semibold text-[#4B7478]">Connected Patients</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#10373A] tabular-nums">
            {authorizedProfiles.length} Active
          </p>
          <p className="mt-1 text-sm text-[#2C5E63]">
            {activePatientProfile?.fullName || patient?.name || 'Patient'} ·{' '}
            {medications.filter((m) => m.active && !m.discontinued).length} active meds
          </p>
        </Card>

        <Card tone="white" className="p-5">
          <p className="text-xs font-semibold text-[#4B7478]">Today’s Adherence</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1A7A68] tabular-nums">
            {stats.percentage}%
          </p>
          <p className="mt-1 text-sm text-[#4B7478] tabular-nums">
            {stats.takenCount} of {stats.totalScheduled} confirmed ·{' '}
            <span className="inline-flex items-center gap-0.5 font-semibold text-[#10373A]">
              <Flame className="h-3.5 w-3.5 text-[#1A7A68]" />
              {streak.currentStreakDays}d streak
            </span>
          </p>
        </Card>

        <Card tone="white" className="p-5">
          <p className="text-xs font-semibold text-[#4B7478]">Unconfirmed & Upcoming</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#9E5A00] tabular-nums">
            {stats.unconfirmedCount + stats.pendingCount}
          </p>
          <p className="mt-1 text-sm text-[#4B7478] tabular-nums">
            {stats.unconfirmedCount} unconfirmed · {stats.missedCount} missed
          </p>
        </Card>

        <Card tone="lavender" className="p-5">
          <p className="text-xs font-semibold text-[#5D4A96]">7-Day Adherence & Relay</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#10373A] tabular-nums">
            {weeklyAverage}% (7d)
          </p>
          <p className="mt-1 text-sm text-[#4A397C] truncate">
            {activeRelay?.shiftWindow || 'Care Relay Active'}
          </p>
        </Card>
      </div>

      {/* Pillu Companion Care Strip */}
      <Card
        tone={patientFeelingUnwell ? 'warm' : 'mint'}
        className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <PilluMascot
          state={pilluMood}
          size="sm"
          message={pilluCopy.message}
          subMessage={pilluCopy.subMessage}
          bounceOnHappy={Boolean(justConfirmedDoseId)}
          animationConfig={{ reducedMotion: settings.reducedMotion }}
          className="flex-1"
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {patientFeelingUnwell && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!emailVerified}
              onClick={() => reportPatientWellness(false)}
            >
              Mark Wellness Resolved
            </Button>
          )}
          <Link to="/companion">
            <Button size="sm" variant="secondary">
              <MessageCircleHeart className="h-4 w-4" />
              Open Pillu Companion
            </Button>
          </Link>
        </div>
      </Card>

      {/* Main Two-Column Caregiver Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Unconfirmed & Assisted Dose Review */}
          <Card tone="white" className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EBF0EE] pb-4">
              <div className="flex items-center gap-3.5">
                {patient && (
                  <img
                    src={patient.avatarUrl}
                    alt={patient.name}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full object-cover border border-[#C6E3D5]"
                  />
                )}
                <div>
                  <h2 className="font-display text-lg font-bold text-[#10373A]">
                    {activePatientProfile?.fullName || patient?.name || 'Patient'} — Caregiver Review
                  </h2>
                  <p className="text-sm text-[#4B7478]">
                    Assisted dose confirmations, gentle check-ins & safe missed classification
                  </p>
                </div>
              </div>
              <Link to="/passport">
                <Button variant="secondary" size="sm">
                  View Passport
                </Button>
              </Link>
            </div>

            <div className="mt-5">
              <h3 className="font-display text-base font-bold text-[#10373A] mb-2">
                Unconfirmed & Remaining Doses Today ({unconfirmedOrPendingDoses.length})
              </h3>

              {unconfirmedOrPendingDoses.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl bg-[#F1F8F5] p-4 text-sm font-medium text-[#116B4B]">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>
                    All scheduled doses for {activePatientProfile?.fullName || 'this patient'} have been handled today.
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-[#EBF0EE]">
                  {unconfirmedOrPendingDoses.map((inst) => {
                    const med = inst.medication;
                    const isUnconfirmed = inst.status === 'unconfirmed';
                    return (
                      <div
                        key={inst.doseKey}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 first:pt-2 last:pb-0"
                      >
                        <div>
                          <p
                            className={cn(
                              'text-xs font-semibold tabular-nums',
                              isUnconfirmed ? 'text-[#9E5A00]' : 'text-[#4B7478]',
                            )}
                          >
                            {formatTime12Hour(inst.scheduledTime)} ·{' '}
                            {formatDoseStatusLabel(inst.status)} · {inst.formattedCountdown}
                          </p>
                          <p className="font-display text-base font-bold text-[#10373A]">
                            {med.name} ({med.dosage})
                          </p>
                          <p className="text-sm text-[#4B7478]">
                            {formatFoodInstructionLabel(med.foodInstruction)} · {med.instructions}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!emailVerified}
                            onClick={() =>
                              addCareUpdate(
                                'medication',
                                `Gentle reminder for ${med.name} (${formatTime12Hour(inst.scheduledTime)}). ${DOUBLE_DOSE_SAFETY_GUIDANCE}`,
                              )
                            }
                          >
                            <BellRing className="h-4 w-4" />
                            Remind
                          </Button>
                          {isUnconfirmed && (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={!emailVerified}
                              onClick={() =>
                                markDoseInstanceStatus(inst, 'missed', {
                                  note: `Classified missed by caregiver ${activeProfile.displayName}. Do not double next dose.`,
                                })
                              }
                            >
                              Mark Missed
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={!emailVerified}
                            onClick={() =>
                              markDoseInstanceStatus(inst, 'taken', {
                                note: `Assisted confirmation by caregiver ${activeProfile.displayName}`,
                              })
                            }
                          >
                            <Check className="h-4 w-4" />
                            Confirm Assisted
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Today's Full Medication Schedule */}
          <Card tone="white" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Today’s Medication Schedule ({scheduledDosesToday.length} slots)
              </h3>
              <Link
                to="/medications"
                className="text-sm font-semibold text-[#1A7A68] hover:underline"
              >
                Edit schedules
              </Link>
            </div>

            {scheduledDosesToday.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No medication doses scheduled for today.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {scheduledDosesToday.map((inst) => (
                  <div
                    key={inst.doseKey}
                    className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-[#1A7A68] tabular-nums">
                        {formatTime12Hour(inst.scheduledTime)} ·{' '}
                        {formatFoodInstructionLabel(inst.medication.foodInstruction)}
                      </p>
                      <p className="font-semibold text-[#10373A]">
                        {inst.medication.name} · {inst.medication.dosage}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          inst.status === 'taken' || inst.status === 'corrected'
                            ? 'text-[#116B4B]'
                            : inst.status === 'missed'
                              ? 'text-[#B42318]'
                              : inst.status === 'unconfirmed'
                                ? 'text-[#9E5A00]'
                                : 'text-[#4B7478]',
                        )}
                      >
                        {formatDoseStatusLabel(inst.status)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!emailVerified}
                        onClick={() => {
                          setCorrectingInst(inst);
                          setCorrectionStatus('corrected');
                          setCorrectionReason('');
                          setCorrectionError(null);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Correct
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Medication Changes Feed */}
          <Card tone="white" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#5D4A96]" />
                <h3 className="font-display text-lg font-bold text-[#10373A]">
                  Recent Medication Changes
                </h3>
              </div>
              <Link
                to="/medications"
                className="text-sm font-semibold text-[#1A7A68] hover:underline"
              >
                All meds
              </Link>
            </div>
            {medicationChanges.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No medication schedule edits, pauses, or discontinuations recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {medicationChanges.slice(0, 5).map((chg) => (
                  <div key={chg.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#4B7478]">
                      <span className="font-semibold capitalize text-[#5D4A96]">
                        {chg.changeType} · {chg.medicationName}
                      </span>
                      <span>{chg.createdAt}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-[#10373A]">{chg.summary}</p>
                    <p className="text-xs text-[#4B7478]">By {chg.changedByName}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Care Relay Availability & Shift Card */}
          <Card tone="lavender" className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#5D4A96]" />
                <h3 className="font-display text-lg font-bold text-[#10373A]">
                  Care Relay Team & Availability
                </h3>
              </div>
              <Link
                to="/caregivers"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#5D4A96] hover:underline"
              >
                Manage Relay
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {myCaregiverRecord && (
              <div className="rounded-xl bg-white border border-[#DDD4F2] p-3.5">
                <Select
                  label={`Your Status (${formatCaregiverTierLabel(myCaregiverRecord.caregiverTier)})`}
                  value={myCaregiverRecord.availabilityStatus ?? 'available'}
                  disabled={!emailVerified}
                  onChange={(e) =>
                    updateCaregiverAvailability(
                      myCaregiverRecord.id,
                      e.target.value as CaregiverAvailabilityStatus,
                    )
                  }
                  options={[
                    { value: 'available', label: 'Available' },
                    { value: 'busy', label: 'Busy' },
                    { value: 'away', label: 'Away' },
                  ]}
                />
              </div>
            )}

            {careRelayTeam.length > 0 && (
              <div className="space-y-2">
                {careRelayTeam.map((cg) => (
                  <div
                    key={cg.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#10373A] truncate">
                        {cg.name}
                      </p>
                      <p className="text-xs text-[#4A397C]">
                        {formatCaregiverTierLabel(cg.caregiverTier)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-bold shrink-0',
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
            )}

            {activeRelay && (
              <div className="space-y-1.5 border-t border-[#DDD4F2] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#4A397C]">
                  <span>
                    Latest Note: {activeRelay.fromCaregiver} → {activeRelay.toCaregiver}
                  </span>
                  <span>{activeRelay.shiftWindow}</span>
                </div>
                <p className="text-sm leading-relaxed text-[#10373A]">
                  {activeRelay.summary}
                </p>
              </div>
            )}

            <p className="text-xs text-[#4A397C]">
              Automatic offline escalation across signed-out devices: Not Implemented.
            </p>
          </Card>
        </div>

        {/* Right Column: Alerts + Historical Adherence + Appointments */}
        <div className="lg:col-span-5 space-y-6">
          <Card tone="white" className="p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Clinical Alerts ({activeAlerts.length})
              </h3>
              <Button
                size="sm"
                variant="secondary"
                disabled={!emailVerified || runningCheck}
                onClick={async () => {
                  setRunningCheck(true);
                  try {
                    const res = await notifyUnconfirmedDoses();
                    setSchedulerFeedback(res.summary);
                  } finally {
                    setRunningCheck(false);
                  }
                }}
              >
                <Clock className="h-3.5 w-3.5" />
                {runningCheck ? 'Checking...' : 'Notify Unconfirmed Doses'}
              </Button>
            </div>
            {schedulerFeedback && (
              <p className="rounded-lg bg-[#F1F8F5] border border-[#CBE4D8] px-3 py-2 text-xs text-[#10373A]">
                {schedulerFeedback}
              </p>
            )}
            {activeAlerts.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No unresolved care alerts right now.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {activeAlerts.map((alert) => {
                  const emailDelivery = notificationDeliveries.find(
                    (d) => d.alertId === alert.id && d.channel === 'email',
                  );
                  return (
                    <div
                      key={alert.id}
                      className="py-4 first:pt-1 last:pb-0 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-bold text-[#9E5A00]">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{alert.title}</span>
                        </div>
                        <span className="text-xs text-[#4B7478]">{alert.createdAt}</span>
                      </div>
                      <p className="text-sm text-[#2C5E63]">{alert.detail}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <span className="text-[#116B4B]">
                          In-App Firestore: {alert.deliveryStatus === 'blocked' ? 'Blocked' : 'Delivered'}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD8D4]">
                          ·
                        </span>
                        <span
                          className={
                            emailDelivery?.deliveryStatus === 'delivered'
                              ? 'text-[#116B4B]'
                              : 'text-[#4B7478]'
                          }
                        >
                          {emailDelivery
                            ? `Resend Email: ${emailDelivery.deliveryStatus === 'delivered' ? 'Delivered' : emailDelivery.statusDetail}`
                            : alert.deliveryNote || 'See Notification Ledger for channel status'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Acknowledge Alert
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Historical Adherence Summary */}
          <Card tone="white" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                7-Day Adherence Summary
              </h3>
              <Link
                to="/history"
                className="text-sm font-semibold text-[#1A7A68] hover:underline"
              >
                Full history
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-2 items-end h-28 pt-2">
              {weeklySeries.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end h-full gap-1"
                >
                  <span className="font-mono text-[10px] font-semibold text-[#2C5E63] tabular-nums">
                    {day.percentage}%
                  </span>
                  <div className="w-full flex-1 flex items-end rounded-lg bg-[#F1F8F5] p-0.5">
                    <div
                      className={cn(
                        'w-full rounded-md',
                        day.percentage === 100 ? 'bg-[#1A7A68]' : 'bg-[#7EC1A8]',
                      )}
                      style={{ height: `${Math.max(day.percentage, 10)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[#4B7478]">{day.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card tone="white" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Upcoming Appointments
              </h3>
              <Link
                to="/appointments"
                className="text-sm font-semibold text-[#1A7A68] hover:underline"
              >
                Manage
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
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#5D4A96] tabular-nums">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {appt.date} · {formatTime12Hour(appt.time)}
                      </span>
                    </div>
                    <p className="mt-1 font-display text-base font-bold text-[#10373A]">
                      {appt.title}
                    </p>
                    <p className="text-sm text-[#4B7478]">
                      {appt.doctorName} · Assigned: {appt.assignedCaregiver}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Caregiver Safe Dose Correction Modal */}
      <Modal
        open={Boolean(correctingInst)}
        onClose={() => setCorrectingInst(null)}
        title="Caregiver Dose Correction"
        description={
          correctingInst
            ? `${correctingInst.medication.name} (${formatTime12Hour(correctingInst.scheduledTime)})`
            : undefined
        }
      >
        <form onSubmit={handleCorrectionSubmit} className="space-y-4">
          <div className="rounded-xl border border-[#DDD4F2] bg-[#F5F2FB] p-3.5 flex items-start gap-2.5 text-xs text-[#4A397C]">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{DOUBLE_DOSE_SAFETY_GUIDANCE}</span>
          </div>

          <Select
            label="Corrected Dose Status"
            value={correctionStatus}
            onChange={(e) => setCorrectionStatus(e.target.value as DoseStatus)}
            options={[
              { value: 'corrected', label: 'Corrected (Verified Taken)' },
              { value: 'taken', label: 'Taken' },
              { value: 'skipped', label: 'Skipped (Clinical Hold)' },
              { value: 'missed', label: 'Missed' },
            ]}
          />

          <Input
            label="Reason for Correction"
            placeholder="e.g., Caregiver verified blister pack was emptied at 8:15 AM"
            value={correctionReason}
            onChange={(e) => {
              setCorrectionReason(e.target.value);
              setCorrectionError(null);
            }}
            error={correctionError ?? undefined}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setCorrectingInst(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingCorrection}>
              {savingCorrection ? 'Saving...' : 'Save Correction'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
