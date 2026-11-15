import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  ClipboardList,
  Copy,
  Phone,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import type {
  CareCircleMember,
  CaregiverAvailabilityStatus,
  CaregiverTier,
} from '../types/pilluminati';
import {
  findUnconfirmedDoseInstances,
  formatAvailabilityStatusLabel,
  formatCaregiverTierLabel,
  partitionCaregiversByTier,
} from '../utils/careRelay';
import { cn } from '../utils/cn';

const AVAILABILITY_TEXT_CLASS: Record<CaregiverAvailabilityStatus, string> = {
  available: 'text-[#116B4B]',
  busy: 'text-[#9E5A00]',
  away: 'text-[#4B7478]',
};

const AVAILABILITY_DOT_CLASS: Record<CaregiverAvailabilityStatus, string> = {
  available: 'bg-[#16A34A]',
  busy: 'bg-[#D97706]',
  away: 'bg-[#8FA8AA]',
};

export function CaregiversPage() {
  const {
    firebaseUser,
    members,
    updateCaregiverAvailability,
    updateCaregiverTier,
    invitations,
    inviteMember,
    revokeInvitation,
    revokeMember,
    handoffs,
    createHandoff,
    acknowledgeHandoff,
    scheduledDosesToday,
    notificationDeliveries,
    notifyUnconfirmedDoses,
    familyPermissions,
    updateFamilyPermissions,
    activeRole,
    isProfileOwner,
    activePatientProfile,
    activeProfile,
    emailVerified,
  } = useCare();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'caregiver' | 'family'>('caregiver');
  const [inviteRelation, setInviteRelation] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [toCaregiver, setToCaregiver] = useState('');
  const [shiftWindow, setShiftWindow] = useState('3:00 PM – 10:00 PM Today');
  const [summary, setSummary] = useState('');
  const [relayError, setRelayError] = useState('');

  const [notifying, setNotifying] = useState(false);
  const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);

  const { primary: primaryCaregivers, backup: backupCaregivers } = useMemo(
    () => partitionCaregiversByTier(members),
    [members],
  );
  const unconfirmedDoses = useMemo(
    () => findUnconfirmedDoseInstances(scheduledDosesToday),
    [scheduledDosesToday],
  );

  const handleCreateHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setRelayError('Please write a brief handoff note for the next caregiver.');
      return;
    }
    setRelayError('');
    await createHandoff({
      fromCaregiver: activeProfile.displayName,
      toCaregiver: toCaregiver.trim() || 'Next Caregiver',
      shiftWindow: shiftWindow.trim() || 'Next Shift',
      summary: summary.trim(),
      status: 'handed_off',
    });
    setSummary('');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setInviteError('Enter a valid email address for the invited member.');
      return;
    }
    setInviteError('');
    setInviting(true);
    try {
      await inviteMember({
        email: cleanEmail,
        role: inviteRole,
        relation:
          inviteRelation.trim() ||
          (inviteRole === 'caregiver' ? 'Primary Caregiver' : 'Family Member'),
      });
      setInviteEmail('');
      setInviteRelation('');
      setInviteOpen(false);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Unable to create invitation.',
      );
    } finally {
      setInviting(false);
    }
  };

  const handleNotifyUnconfirmed = async () => {
    setNotifying(true);
    try {
      const res = await notifyUnconfirmedDoses();
      const emailNote =
        res.notifications.emailChannel.status === 'configured'
          ? 'Resend email notification triggered for configured recipients.'
          : res.notifications.emailChannel.detail;
      setNotifyFeedback(`${res.summary} ${emailNote}`);
    } finally {
      setNotifying(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(code);
      window.setTimeout(() => setCopiedId((c) => (c === code ? null : c)), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const renderCaregiverRosterCard = (member: CareCircleMember) => {
    const status = member.availabilityStatus ?? 'available';
    const tier = member.caregiverTier ?? 'primary';
    const canEditAvailability =
      emailVerified &&
      (isProfileOwner ||
        (firebaseUser?.uid !== undefined && member.uid === firebaseUser.uid));

    return (
      <Card key={member.id} tone="white" className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={member.avatarUrl}
              alt={member.name}
              referrerPolicy="no-referrer"
              className="h-12 w-12 rounded-full object-cover border border-[#C6E3D5] shrink-0"
            />
            <div className="min-w-0">
              <p
                className={cn(
                  'text-xs font-bold',
                  tier === 'primary' ? 'text-[#116B4B]' : 'text-[#5D4A96]',
                )}
              >
                {formatCaregiverTierLabel(tier)}
              </p>
              <h3 className="mt-0.5 font-display text-lg font-bold text-[#10373A] truncate">
                {member.name}
              </h3>
              <p className="text-xs text-[#4B7478] truncate">{member.relation}</p>
            </div>
          </div>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-bold shrink-0',
              AVAILABILITY_TEXT_CLASS[status],
            )}
          >
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', AVAILABILITY_DOT_CLASS[status])}
            />
            {formatAvailabilityStatusLabel(status)}
          </span>
        </div>

        {(canEditAvailability || isProfileOwner) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#EBF0EE] pt-3">
            {canEditAvailability && (
              <Select
                label="Availability"
                value={status}
                onChange={(e) =>
                  updateCaregiverAvailability(
                    member.id,
                    e.target.value as CaregiverAvailabilityStatus,
                  )
                }
                options={[
                  { value: 'available', label: 'Available' },
                  { value: 'busy', label: 'Busy' },
                  { value: 'away', label: 'Away' },
                ]}
              />
            )}
            {isProfileOwner && (
              <Select
                label="Care Relay Role"
                value={tier}
                onChange={(e) =>
                  updateCaregiverTier(member.id, e.target.value as CaregiverTier)
                }
                options={[
                  { value: 'primary', label: 'Primary Caregiver' },
                  { value: 'backup', label: 'Backup Caregiver' },
                ]}
              />
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <AppShell
      title="Caregiver Coordination & Care Relay"
      subtitle="Track primary and backup caregiver availability, send unconfirmed dose alerts, and manage visibility."
      primaryAction={
        isProfileOwner ? (
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={!emailVerified}
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-8">
        {/* Care Relay Roster: Primary & Backup Caregivers + Availability */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[#10373A]">
                Care Relay Team · Primary & Backup Caregivers
              </h2>
              <p className="text-sm text-[#4B7478]">
                Live caregiver availability (Available, Busy, Away) persisted in Firestore.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-[#1A7A68]">
                Primary Caregivers ({primaryCaregivers.length})
              </h3>
              {primaryCaregivers.length === 0 ? (
                <Card tone="warm" className="p-5 text-sm text-[#4B7478]">
                  No primary caregiver connected yet.
                  {isProfileOwner && ' Invite a caregiver to assign a primary responder.'}
                </Card>
              ) : (
                <div className="space-y-3">
                  {primaryCaregivers.map(renderCaregiverRosterCard)}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-[#5D4A96]">
                Backup Caregivers ({backupCaregivers.length})
              </h3>
              {backupCaregivers.length === 0 ? (
                <Card tone="warm" className="p-5 text-sm text-[#4B7478]">
                  No backup caregiver assigned yet.
                  {isProfileOwner &&
                    ' Invite a second caregiver or reassign an existing caregiver to Backup.'}
                </Card>
              ) : (
                <div className="space-y-3">
                  {backupCaregivers.map(renderCaregiverRosterCard)}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Unconfirmed Dose Caregiver Notification + Automatic Escalation Notice */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <Card tone="white" className="lg:col-span-6 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-[#1A7A68]" />
                <h2 className="font-display text-xl font-bold text-[#10373A]">
                  Unconfirmed Dose Notifications
                </h2>
              </div>
              {activeRole !== 'family' && (
                <Button
                  size="sm"
                  disabled={!emailVerified || notifying}
                  onClick={handleNotifyUnconfirmed}
                >
                  <BellRing className="h-4 w-4" />
                  {notifying ? 'Checking & Notifying...' : 'Notify Caregivers'}
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-4 space-y-1.5 text-sm">
              <p className="font-semibold text-[#10373A]">
                {unconfirmedDoses.length === 0
                  ? 'No unconfirmed doses awaiting check-in right now.'
                  : `${unconfirmedDoses.length} unconfirmed dose${unconfirmedDoses.length === 1 ? '' : 's'} detected today.`}
              </p>
              <p className="text-xs text-[#2C5E63]">
                Triggering a check creates real in-app Firestore alerts and sends
                Resend email notifications when <code className="font-mono">RESEND_API_KEY</code> is configured.
              </p>
            </div>

            {notifyFeedback && (
              <p className="rounded-xl border border-[#CBE4D8] bg-white px-4 py-2.5 text-sm text-[#10373A]">
                {notifyFeedback}
              </p>
            )}

            <div className="rounded-xl border border-[#EED29F] bg-[#FFFBF2] p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-[#9E5A00] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-[#6B4200]">
                <p className="font-bold">
                  Automatic Offline Escalation: Not Implemented
                </p>
                <p className="leading-relaxed">
                  Automatic multi-step escalation across signed-out devices (timed
                  background workers or SMS/push gateways) is not implemented because
                  that external infrastructure is unavailable here. Active caregivers
                  are notified in-app and via Resend email during active checks.
                </p>
              </div>
            </div>
          </Card>

          <Card tone="white" className="lg:col-span-6 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-[#5D4A96]" />
              <h2 className="font-display text-xl font-bold text-[#10373A]">
                Notification Delivery Ledger
              </h2>
            </div>
            <p className="text-xs text-[#4B7478]">
              Server-verified delivery outcomes for in-app Firestore alerts and Resend
              email notifications.
            </p>

            {notificationDeliveries.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No alert deliveries recorded yet. Use Notify Caregivers above when a
                dose remains unconfirmed.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {notificationDeliveries.slice(0, 6).map((deliv) => (
                  <div
                    key={deliv.id}
                    className="py-3 first:pt-1 last:pb-0 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-xs font-bold',
                          deliv.deliveryStatus === 'delivered'
                            ? 'text-[#116B4B]'
                            : 'text-[#991B1B]',
                        )}
                      >
                        {deliv.channel} · {deliv.deliveryStatus.toUpperCase()}
                      </span>
                      <span className="text-xs text-[#4B7478]">{deliv.createdAt}</span>
                    </div>
                    <p className="text-sm text-[#2C5E63]">{deliv.statusDetail}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Connected Care Circle Directory */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-[#10373A]">
            Connected Care Circle ({members.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {members.map((member) => (
              <Card key={member.id} tone="white" className="p-5 space-y-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full object-cover border border-[#C6E3D5] shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold capitalize text-[#5D4A96]">
                      {member.role} · {member.relation}
                    </p>
                    <h3 className="font-display text-lg font-bold text-[#10373A] truncate">
                      {member.name}
                    </h3>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-[#4B7478] border-t border-[#EBF0EE] pt-3">
                  {member.phone && (
                    <p className="flex items-center gap-2 tabular-nums">
                      <Phone className="h-4 w-4 text-[#1A7A68]" />
                      <span>{member.phone}</span>
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate">
                      {member.role === 'caregiver'
                        ? `${formatCaregiverTierLabel(member.caregiverTier)} · ${formatAvailabilityStatusLabel(member.availabilityStatus)}`
                        : member.lastActive}
                    </p>
                    {isProfileOwner && member.role !== 'patient' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeMember(member)}
                        aria-label={`Revoke access for ${member.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-[#B42318]" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Issued Invitations (Owner Only) */}
        {isProfileOwner && invitations.length > 0 && (
          <Card tone="white" className="p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#10373A]">
              Profile Sharing Invitations ({invitations.length})
            </h2>
            <div className="divide-y divide-[#EBF0EE]">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-[#10373A] truncate">
                      {inv.targetEmail} ·{' '}
                      <span className="capitalize text-[#5D4A96]">{inv.targetRole}</span>
                    </p>
                    <p className="font-mono text-xs text-[#4B7478] break-all">
                      Code: {inv.id} · Status: {inv.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {inv.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => copyCode(inv.id)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedId === inv.id ? 'Copied' : 'Copy Code'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeInvitation(inv.id)}
                        >
                          <XCircle className="h-4 w-4 text-[#B42318]" />
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Care Relay Handoff + Family Permissions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <Card tone="white" className="lg:col-span-7 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#5D4A96]" />
              <h2 className="font-display text-xl font-bold text-[#10373A]">
                Care Relay Shift Notes
              </h2>
            </div>

            {activeRole !== 'family' && (
              <form
                onSubmit={handleCreateHandoff}
                className="rounded-xl bg-[#F5F2FB] border border-[#DDD4F2] p-4 space-y-3"
              >
                <p className="text-sm font-semibold text-[#4A397C]">
                  Share Care Note with Incoming Caregiver
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Handing Off To"
                    placeholder="e.g., Backup Caregiver"
                    value={toCaregiver}
                    onChange={(e) => setToCaregiver(e.target.value)}
                  />
                  <Input
                    label="Shift Window"
                    value={shiftWindow}
                    onChange={(e) => setShiftWindow(e.target.value)}
                  />
                </div>
                <Textarea
                  label="Handoff Summary"
                  placeholder="Share doses confirmed, meals, mood, or items to watch..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  error={relayError}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="lavender"
                    size="sm"
                    disabled={!emailVerified}
                  >
                    Post Care Relay Note
                  </Button>
                </div>
              </form>
            )}

            {handoffs.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No Care Relay notes logged yet for {activePatientProfile?.fullName}.
              </p>
            ) : (
              <div className="divide-y divide-[#EBF0EE]">
                {handoffs.map((h) => (
                  <div
                    key={h.id}
                    className="py-4 first:pt-1 last:pb-0 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#5D4A96]">
                        {h.fromCaregiver} → {h.toCaregiver} · {h.shiftWindow}
                      </p>
                      <span className="text-xs font-semibold capitalize text-[#1A7A68]">
                        {h.status.replace('_', ' ')} · {h.createdAt}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-[#10373A]">
                      {h.summary}
                    </p>
                    {activeRole !== 'family' && h.status !== 'acknowledged' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!emailVerified}
                        onClick={() => acknowledgeHandoff(h.id)}
                      >
                        <Check className="h-4 w-4" />
                        Acknowledge Receipt
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Family Visibility Permissions */}
          <Card tone="mint" className="lg:col-span-5 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#1A7A68]" />
              <h2 className="font-display text-xl font-bold text-[#10373A]">
                Family Visibility Permissions
              </h2>
            </div>
            <p className="text-sm text-[#2C5E63]">
              {isProfileOwner
                ? 'Control exactly which data collections invited Family members can query in Firestore.'
                : 'Managed by the patient profile owner to enforce Firestore family visibility boundaries.'}
            </p>

            <div className="divide-y divide-[#CBE4D8]">
              <Switch
                label="Daily Adherence Percentage"
                description="Show overall adherence ring and progress bar"
                checked={familyPermissions.showAdherencePercentage}
                onChange={(val) =>
                  isProfileOwner &&
                  updateFamilyPermissions({ showAdherencePercentage: val })
                }
              />
              <Switch
                label="Detailed Medication Names"
                description="Show individual prescription names and dosages"
                checked={familyPermissions.showDetailedMedications}
                onChange={(val) =>
                  isProfileOwner &&
                  updateFamilyPermissions({ showDetailedMedications: val })
                }
              />
              <Switch
                label="Upcoming Appointments"
                description="Show doctor visits, locations, and escorts"
                checked={familyPermissions.showAppointments}
                onChange={(val) =>
                  isProfileOwner &&
                  updateFamilyPermissions({ showAppointments: val })
                }
              />
              <Switch
                label="Caregiver Updates Feed"
                description="Share daily wellness notes and shift summaries"
                checked={familyPermissions.showCareUpdates}
                onChange={(val) =>
                  isProfileOwner &&
                  updateFamilyPermissions({ showCareUpdates: val })
                }
              />
              <Switch
                label="Emergency Health Passport"
                description="Allow family access to allergies & physician info"
                checked={familyPermissions.showEmergencyPassport}
                onChange={(val) =>
                  isProfileOwner &&
                  updateFamilyPermissions({ showEmergencyPassport: val })
                }
              />
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteError('');
        }}
        title="Invite to Care Circle"
        description={`Issue a 7-day email-bound invitation to join ${activePatientProfile?.fullName || 'this'} care profile.`}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {inviteError && (
            <ErrorBanner
              title="Invitation error"
              message={inviteError}
              onDismiss={() => setInviteError('')}
            />
          )}
          <Input
            label="Member Verified Email"
            type="email"
            placeholder="caregiver@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Authorized Role"
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as 'caregiver' | 'family')
              }
              options={[
                { value: 'caregiver', label: 'Caregiver' },
                { value: 'family', label: 'Family Member' },
              ]}
            />
            <Input
              label="Relationship"
              placeholder="e.g., Home Nurse / Daughter"
              value={inviteRelation}
              onChange={(e) => setInviteRelation(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Issuing Invite...' : 'Generate Care Invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
