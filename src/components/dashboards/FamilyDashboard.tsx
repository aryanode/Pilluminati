import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, EyeOff, Lock, MessageCircleHeart, MessageSquareText, ShieldCheck } from 'lucide-react';
import { PilluMascot } from '../PilluMascot';
import { Button, Card } from '../ui/Primitives';
import { useCare } from '../../context/CareContext';
import {
  calculateDailyAdherence,
  expandScheduledDosesForDate,
  filterVisibleDataByPermission,
  formatDoseStatusLabel,
  formatTime12Hour,
  getNextUpcomingDose,
  getPilluContextualCopy,
  getPilluMoodForState,
  isTimeInQuietHours,
} from '../../utils/adherence';
import {
  formatAvailabilityStatusLabel,
  partitionCaregiversByTier,
} from '../../utils/careRelay';

export function FamilyDashboard() {
  const {
    medications,
    doseLogs,
    appointments,
    careUpdates,
    familyPermissions,
    members,
    patientFeelingUnwell,
    justConfirmedDoseId,
    settings,
    activePatientProfile,
    todayDate,
  } = useCare();

  const patient = members.find((m) => m.role === 'patient');
  const { primary: primaryCaregivers, backup: backupCaregivers } = useMemo(
    () => partitionCaregiversByTier(members),
    [members],
  );
  const primaryCaregiver = primaryCaregivers[0];
  const backupCaregiver = backupCaregivers[0];

  const stats = useMemo(
    () => calculateDailyAdherence(medications, doseLogs, todayDate),
    [medications, doseLogs, todayDate],
  );

  const scoped = useMemo(
    () =>
      filterVisibleDataByPermission(
        'family',
        familyPermissions,
        medications,
        appointments.filter((a) => a.status === 'upcoming'),
        careUpdates,
      ),
    [familyPermissions, medications, appointments, careUpdates],
  );

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextDose = useMemo(
    () =>
      scoped.canViewDetailedMedications
        ? getNextUpcomingDose(scoped.medications, doseLogs, todayDate, nowMinutes, now)
        : null,
    [scoped.canViewDetailedMedications, scoped.medications, doseLogs, todayDate, nowMinutes],
  );
  const patientFirstName = (
    activePatientProfile?.fullName ||
    patient?.name ||
    'your loved one'
  ).split(' ')[0];
  const pilluMood = scoped.canViewAdherence
    ? getPilluMoodForState(
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
      )
    : patientFeelingUnwell
      ? 'caring'
      : 'idle';

  const pilluCopy = scoped.canViewAdherence
    ? getPilluContextualCopy({
        mood: pilluMood,
        stats,
        nextDose: scoped.canViewDetailedMedications ? nextDose : null,
        patientFirstName,
        role: 'family',
      })
    : patientFeelingUnwell
      ? getPilluContextualCopy({
          mood: 'caring',
          stats,
          patientFirstName,
          role: 'family',
        })
      : {
          message: `Family updates for ${patientFirstName} stay calm and privacy-scoped.`,
          subMessage:
            'Detailed adherence metrics are currently hidden by patient privacy preferences.',
        };

  return (
    <div className="space-y-8">
      {/* Shared Patient Overview */}
      <Card tone="mint" className="p-6 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {patient && (
              <img
                src={patient.avatarUrl}
                alt={patient.name}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm shrink-0"
              />
            )}
            <div>
              <p className="text-xs font-semibold text-[#1A7A68]">
                Shared Patient Overview
              </p>
              <h2 className="font-display text-2xl font-bold text-[#10373A]">
                {activePatientProfile?.fullName || patient?.name || 'Patient Profile'}
              </h2>
              <p className="text-sm text-[#2C5E63]">
                Primary Caregiver:{' '}
                <span className="font-semibold">
                  {primaryCaregiver
                    ? `${primaryCaregiver.name} (${formatAvailabilityStatusLabel(primaryCaregiver.availabilityStatus)})`
                    : 'Care Team'}
                </span>
                {backupCaregiver && (
                  <>
                    {' · '}Backup:{' '}
                    <span className="font-semibold">
                      {backupCaregiver.name} ({formatAvailabilityStatusLabel(backupCaregiver.availabilityStatus)})
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link to="/caregivers">
              <Button variant="secondary" size="sm">
                <ShieldCheck className="h-4 w-4" />
                Visibility Settings
              </Button>
            </Link>
            {scoped.canViewPassport && (
              <Link to="/passport">
                <Button size="sm">Emergency Passport</Button>
              </Link>
            )}
          </div>
        </div>
      </Card>

      {/* Pillu Family Companion Strip */}
      <Card
        tone={patientFeelingUnwell ? 'warm' : 'white'}
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
        <Link to="/companion" className="shrink-0">
          <Button size="sm" variant="secondary">
            <MessageCircleHeart className="h-4 w-4" />
            Ask Pillu
          </Button>
        </Link>
      </Card>

      {/* Permission-Scoped Adherence & Detailed Medication Visibility */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card tone="white" className="lg:col-span-6 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-[#10373A]">
              Medication Adherence Visibility
            </h3>
            <span className="text-xs font-medium text-[#4B7478]">
              Permission-scoped
            </span>
          </div>

          {!scoped.canViewAdherence ? (
            <div className="rounded-xl border border-dashed border-[#CBD8D4] bg-[#FAF9F6] p-5 flex items-start gap-3">
              <EyeOff className="h-5 w-5 text-[#4B7478] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#10373A]">
                  Adherence summary is hidden by patient privacy preferences
                </p>
                <p className="mt-1 text-sm text-[#4B7478]">
                  You will still receive urgent caregiver outreach if assistance is needed.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-[#2C5E63]">
                  Today’s adherence progress
                </p>
                <span className="font-mono text-2xl font-bold text-[#1A7A68] tabular-nums">
                  {stats.percentage}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[#EBF6F1]">
                <div
                  className="h-full rounded-full bg-[#1A7A68]"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <p className="text-sm text-[#4B7478] tabular-nums">
                {stats.takenCount} of {stats.totalScheduled} scheduled doses confirmed today.
              </p>

              {scoped.canViewDetailedMedications ? (
                <div className="pt-2 border-t border-[#EBF0EE] space-y-2">
                  <p className="text-xs font-semibold text-[#4B7478]">
                    Shared Medication Schedule
                  </p>
                  {expandScheduledDosesForDate(
                    scoped.medications,
                    doseLogs,
                    todayDate,
                  ).map((inst) => (
                    <div
                      key={inst.doseKey}
                      className="flex items-center justify-between text-sm py-1.5"
                    >
                      <span className="font-medium text-[#10373A]">
                        {inst.medication.name} · {inst.medication.dosage}
                      </span>
                      <span className="font-mono text-xs text-[#4B7478] tabular-nums">
                        {formatTime12Hour(inst.scheduledTime)} ·{' '}
                        {formatDoseStatusLabel(inst.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-[#F5F2FB] border border-[#DDD4F2] p-4 flex items-center gap-3 text-sm text-[#4A397C]">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    Detailed medication names are private. Summary adherence remains visible.
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Appointment Information */}
        <Card tone="white" className="lg:col-span-6 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-[#10373A]">
              Appointment Information
            </h3>
            {scoped.canViewAppointments && (
              <Link
                to="/appointments"
                className="text-sm font-semibold text-[#1A7A68] hover:underline"
              >
                Full calendar
              </Link>
            )}
          </div>

          {!scoped.canViewAppointments ? (
            <div className="rounded-xl border border-dashed border-[#CBD8D4] bg-[#FAF9F6] p-5 flex items-start gap-3">
              <EyeOff className="h-5 w-5 text-[#4B7478] shrink-0 mt-0.5" />
              <p className="text-sm text-[#4B7478]">
                Appointment details are currently restricted for family view.
              </p>
            </div>
          ) : scoped.appointments.length === 0 ? (
            <p className="text-sm text-[#4B7478]">
              No upcoming appointments on the calendar.
            </p>
          ) : (
            <div className="divide-y divide-[#EBF0EE]">
              {scoped.appointments.map((appt) => (
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
                    {appt.doctorName} · {appt.location}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Care Updates Feed */}
      <Card tone="white" className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-[#1A7A68]" />
          <h3 className="font-display text-lg font-bold text-[#10373A]">
            Care Circle Updates
          </h3>
        </div>

        {!scoped.canViewCareUpdates ? (
          <div className="rounded-xl border border-dashed border-[#CBD8D4] bg-[#FAF9F6] p-5 flex items-center gap-3 text-sm text-[#4B7478]">
            <EyeOff className="h-5 w-5 shrink-0" />
            <span>Care updates feed is currently hidden by patient permissions.</span>
          </div>
        ) : (
          <div className="divide-y divide-[#EBF0EE]">
            {scoped.careUpdates.map((upd) => (
              <div
                key={upd.id}
                className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-semibold text-[#4B7478]">
                    {upd.authorName} · {upd.category}
                  </p>
                  <p className="mt-0.5 text-base text-[#10373A]">{upd.message}</p>
                </div>
                <span className="text-xs text-[#4B7478] shrink-0">
                  {upd.createdAt}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
