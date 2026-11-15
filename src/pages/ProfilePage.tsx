import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Card, ErrorBanner, Input } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import { cn } from '../utils/cn';

export function ProfilePage() {
  const {
    activeRole,
    activeProfile,
    updateActiveProfile,
    firebaseUser,
    emailVerified,
    authorizedProfiles,
    activePatientProfile,
    selectActiveProfile,
    acceptInvitationCode,
    signOutUser,
  } = useCare();

  const [displayName, setDisplayName] = useState(activeProfile.displayName);
  const [phone, setPhone] = useState(activeProfile.phone);
  const [address, setAddress] = useState(activeProfile.address);
  const [emergencyName, setEmergencyName] = useState(
    activeProfile.emergencyContactName,
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    activeProfile.emergencyContactPhone,
  );
  const [savedNotice, setSavedNotice] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    setDisplayName(activeProfile.displayName);
    setPhone(activeProfile.phone);
    setAddress(activeProfile.address);
    setEmergencyName(activeProfile.emergencyContactName);
    setEmergencyPhone(activeProfile.emergencyContactPhone);
  }, [activeProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    await updateActiveProfile({
      displayName: displayName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim(),
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleJoinInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setInviteErr(null);
    setInviteMsg(null);
    setJoining(true);
    try {
      const res = await acceptInvitationCode(inviteCode.trim());
      setInviteCode('');
      setInviteMsg(
        res.pendingOwnerSync
          ? 'Invitation marked accepted. Waiting for owner sync.'
          : 'Successfully joined the shared patient profile!',
      );
    } catch (err) {
      setInviteErr(
        err instanceof Error ? err.message : 'Unable to accept invitation code.',
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <AppShell
      title="Profile Management"
      subtitle="Update your account contact details, view authorized profiles, and redeem Care Circle invitations."
      allowWithoutProfile
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card tone="white" className="lg:col-span-7 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-[#EBF0EE]">
              <img
                src={activeProfile.avatarUrl}
                alt={activeProfile.displayName}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover border border-[#C6E3D5]"
              />
              <div>
                <p className="text-xs font-semibold capitalize text-[#5D4A96]">
                  {activeRole} Account
                </p>
                <h2 className="font-display text-xl font-bold text-[#10373A]">
                  {activeProfile.displayName}
                </h2>
                <p className="text-sm text-[#4B7478]">{activeProfile.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <Input
                label="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <Input
              label="Home or Office Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            {activePatientProfile && activeRole !== 'family' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Profile Emergency Contact Name"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                />
                <Input
                  label="Profile Emergency Contact Phone"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              {savedNotice ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#116B4B]">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved to Firestore
                </span>
              ) : (
                <span />
              )}
              <Button type="submit">Save Profile Changes</Button>
            </div>
          </form>
        </Card>

        <div className="lg:col-span-5 space-y-6">
          <Card tone="mint" className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#1A7A68]" />
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Firebase Session
              </h3>
            </div>
            <p className="text-sm text-[#2C5E63]">
              Signed in as{' '}
              <span className="font-semibold text-[#10373A]">
                {firebaseUser?.email}
              </span>{' '}
              ({emailVerified ? 'Verified' : 'Verification pending'}).
            </p>
            <Button variant="secondary" size="sm" onClick={signOutUser}>
              Sign Out
            </Button>
          </Card>

          <Card tone="white" className="p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#10373A]">
              Authorized Patient Profiles ({authorizedProfiles.length})
            </h3>
            {authorizedProfiles.length === 0 ? (
              <p className="text-sm text-[#4B7478]">
                No patient health profiles linked yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {authorizedProfiles.map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => selectActiveProfile(prof.id)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold cursor-pointer transition-colors',
                      activePatientProfile?.id === prof.id
                        ? 'border-[#10373A] bg-[#E2F1EA] text-[#10373A]'
                        : 'border-[#DCE5E2] bg-[#FAF9F6] text-[#2C5E63] hover:bg-[#F1F8F5]',
                    )}
                  >
                    <span>{prof.fullName}</span>
                    {activePatientProfile?.id === prof.id && <span>Active</span>}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={handleJoinInvite}
              className="border-t border-[#EBF0EE] pt-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10373A]">
                <UserPlus className="h-4 w-4 text-[#5D4A96]" />
                <span>Join Another Profile via Code</span>
              </div>
              {inviteErr && (
                <ErrorBanner
                  title="Invitation error"
                  message={inviteErr}
                  onDismiss={() => setInviteErr(null)}
                />
              )}
              {inviteMsg && (
                <p className="text-sm font-medium text-[#116B4B]">{inviteMsg}</p>
              )}
              <Input
                label="Invitation Code"
                placeholder="inv_..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Button
                type="submit"
                variant="lavender"
                size="sm"
                disabled={!emailVerified || joining || !inviteCode.trim()}
              >
                {joining ? 'Joining...' : 'Accept Invitation'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
