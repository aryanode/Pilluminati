import React, { useState } from 'react';
import { MailCheck, UserPlus } from 'lucide-react';
import { Button, Card, ErrorBanner, Input, Textarea } from './ui/Primitives';
import { useCare } from '../context/CareContext';
import { validatePatientProfileInput } from '../utils/rbac';

export function EmailVerificationBanner() {
  const { emailVerified, firebaseUser, resendVerification, refreshVerification } = useCare();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!firebaseUser || emailVerified) return null;

  const handleResend = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await resendVerification();
      setStatusMsg(`Verification link sent to ${firebaseUser.email}.`);
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Unable to send verification email.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const ok = await refreshVerification();
      setStatusMsg(
        ok
          ? 'Email verified! Cloud writes are now enabled.'
          : 'Verification not detected yet. Check your inbox and click the link first.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#F5C2C0] bg-[#FEF6F5] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <MailCheck className="h-5 w-5 text-[#991B1B] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-[#7A1D16]">
            Verify your email to enable medical record writes
          </p>
          <p className="text-sm text-[#7A1D16]/90 mt-0.5">
            Firestore security rules require a verified email address before creating
            health profiles, logging doses, or redeeming invitations.
          </p>
          {statusMsg && (
            <p className="text-xs font-semibold text-[#10373A] mt-1.5">{statusMsg}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button size="sm" variant="secondary" onClick={handleResend} disabled={busy}>
          Resend Email
        </Button>
        <Button size="sm" onClick={handleRefresh} disabled={busy}>
          I’ve Verified — Refresh
        </Button>
      </div>
    </div>
  );
}

export function ProfileOnboardingCard() {
  const {
    userAccount,
    firebaseUser,
    emailVerified,
    createNewPatientProfile,
    incomingInvitations,
    acceptInvitationCode,
  } = useCare();

  const isPatientAccount = (userAccount?.accountRole || 'patient') === 'patient';
  const [showCreateForm, setShowCreateForm] = useState(isPatientAccount);

  const [fullName, setFullName] = useState(
    userAccount?.displayName || firebaseUser?.displayName || '',
  );
  const [dob, setDob] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [primaryPhysician, setPrimaryPhysician] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validatePatientProfileInput({
      fullName,
      dateOfBirth: dob || undefined,
      emergencyContactName,
      emergencyContactPhone,
    });
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createNewPatientProfile({
        fullName,
        dateOfBirth: dob,
        bloodType,
        allergiesText,
        conditionsText,
        emergencyContactName,
        emergencyContactRelation,
        emergencyContactPhone,
        primaryPhysician,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to create health profile.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInvite = async (code: string) => {
    setSubmitError(null);
    setInviteMessage(null);
    setSubmitting(true);
    try {
      const res = await acceptInvitationCode(code);
      if (res.pendingOwnerSync) {
        setInviteMessage(
          'Invitation accepted! Waiting for the profile owner to refresh/sync your access.',
        );
      } else {
        setInviteMessage('Care Circle invitation accepted. Loading shared profile...');
      }
      setInviteCode('');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not redeem invitation code.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {submitError && (
        <ErrorBanner
          title="Profile setup notice"
          message={submitError}
          onDismiss={() => setSubmitError(null)}
        />
      )}

      {inviteMessage && (
        <Card tone="mint" className="p-4 text-sm font-medium text-[#116B4B]">
          {inviteMessage}
        </Card>
      )}

      {/* Pending / Manual Invitation Acceptance */}
      <Card tone="lavender" className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5D4A96]">
              Join a Shared Care Circle
            </p>
            <h2 className="font-display text-xl font-bold text-[#10373A] mt-1">
              Accept a Caregiver or Family Invitation
            </h2>
            <p className="text-sm text-[#2C5E63] mt-1">
              Caregivers and family members can access only health profiles they are
              explicitly invited to join.
            </p>
          </div>
          <UserPlus className="h-6 w-6 text-[#5D4A96] shrink-0" />
        </div>

        {incomingInvitations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#4A397C]">
              Pending invitations for {firebaseUser?.email}
            </p>
            {incomingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white border border-[#DDD4F2] p-4"
              >
                <div>
                  <p className="font-display text-base font-bold text-[#10373A]">
                    {inv.patientName} — {inv.targetRole} access
                  </p>
                  <p className="text-xs text-[#4B7478]">
                    Relation: {inv.relation || 'Care Circle Member'} · Code:{' '}
                    <span className="font-mono">{inv.id}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!emailVerified || submitting}
                  onClick={() => handleAcceptInvite(inv.id)}
                >
                  Accept Invitation
                </Button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inviteCode.trim()) handleAcceptInvite(inviteCode.trim());
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="flex-1">
            <Input
              label="Invitation Code"
              placeholder="Paste invitation code (e.g., inv_...)"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>
          <div className="sm:self-end">
            <Button
              type="submit"
              variant="lavender"
              disabled={!emailVerified || submitting || !inviteCode.trim()}
            >
              Join Profile
            </Button>
          </div>
        </form>
      </Card>

      {/* Create Patient Health Profile */}
      {!showCreateForm ? (
        <Card tone="white" className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-[#10373A]">
              Managing care for yourself or a dependent?
            </h3>
            <p className="text-sm text-[#4B7478]">
              Create a dedicated patient health profile to start tracking medications and
              inviting caregivers.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setShowCreateForm(true)}>
            Create Patient Health Profile
          </Button>
        </Card>
      ) : (
        <Card tone="white" className="p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs font-semibold text-[#1A7A68]">
              New Patient Health Profile
            </p>
            <h2 className="font-display text-2xl font-bold text-[#10373A] mt-1">
              Set Up Health Profile & Emergency Contacts
            </h2>
            <p className="text-sm text-[#4B7478] mt-1">
              Stored securely in Cloud Firestore under owner-enforced access control.
            </p>
          </div>

          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Patient Full Name"
                  placeholder="e.g., Eleanor Marie Vance"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  error={formErrors.fullName}
                  required
                />
              </div>
              <Input
                label="Date of Birth"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                error={formErrors.dateOfBirth}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Blood Type"
                placeholder="e.g., O Positive (O+)"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
              />
              <Input
                label="Primary Physician"
                placeholder="e.g., Dr. Aris Thorne, MD"
                value={primaryPhysician}
                onChange={(e) => setPrimaryPhysician(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Textarea
                label="Known Allergies (comma-separated)"
                placeholder="e.g., Penicillin, Sulfa drugs"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
              />
              <Textarea
                label="Medical Conditions (comma-separated)"
                placeholder="e.g., Hypertension, Type 2 Diabetes"
                value={conditionsText}
                onChange={(e) => setConditionsText(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Emergency Contact Name"
                placeholder="e.g., David Vance"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                error={formErrors.emergencyContactName}
              />
              <Input
                label="Relationship"
                placeholder="e.g., Son / Healthcare Proxy"
                value={emergencyContactRelation}
                onChange={(e) => setEmergencyContactRelation(e.target.value)}
              />
              <Input
                label="Emergency Contact Phone"
                placeholder="e.g., (503) 555-0174"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                error={formErrors.emergencyContactPhone}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="lg"
                disabled={!emailVerified || submitting}
              >
                {submitting ? 'Creating Health Profile...' : 'Create Health Profile'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
