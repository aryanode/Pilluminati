import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Edit3,
  ExternalLink,
  FileHeart,
  Link2,
  Lock,
  Phone,
  Printer,
  QrCode,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';

export function PassportPage() {
  const {
    passport,
    updatePassport,
    medications,
    activeRole,
    isProfileOwner,
    familyPermissions,
    emergencyTokens,
    latestQrByToken,
    createEmergencyToken,
    revokeEmergencyToken,
    emailVerified,
  } = useCare();

  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [fullName, setFullName] = useState(passport.patientFullName);
  const [dob, setDob] = useState(passport.dateOfBirth);
  const [bloodType, setBloodType] = useState(passport.bloodType);
  const [allergiesText, setAllergiesText] = useState(passport.allergies.join(', '));
  const [conditionsText, setConditionsText] = useState(passport.conditions.join(', '));
  const [physician, setPhysician] = useState(passport.primaryPhysician);
  const [physicianPhone, setPhysicianPhone] = useState(passport.physicianPhone);
  const [pharmacyName, setPharmacyName] = useState(passport.pharmacyName);
  const [pharmacyPhone, setPharmacyPhone] = useState(passport.pharmacyPhone);
  const [emergencyName, setEmergencyName] = useState(passport.emergencyContactName);
  const [emergencyPhone, setEmergencyPhone] = useState(passport.emergencyContactPhone);
  const [directive, setDirective] = useState(passport.advanceDirectiveNote);

  const [tokenLabel, setTokenLabel] = useState('EMS / First Responders');
  const [tokenHours, setTokenHours] = useState('24');
  const [includeMeds, setIncludeMeds] = useState(true);
  const [creatingToken, setCreatingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const isRestrictedFamily =
    activeRole === 'family' && !familyPermissions.showEmergencyPassport;
  const canEdit = activeRole !== 'family';
  const activeMeds = medications.filter((m) => m.active && !m.discontinued);

  useEffect(() => {
    let cancelled = false;
    const activeTokens = emergencyTokens.filter(
      (t) => !t.revoked && !latestQrByToken[t.id] && !qrMap[t.id],
    );
    if (activeTokens.length === 0) return;

    Promise.all(
      activeTokens.map(async (tok) => {
        const url = `${window.location.origin}/emergency/${tok.id}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 180,
          margin: 1,
          color: { dark: '#10373A', light: '#FFFFFF' },
        });
        return [tok.id, dataUrl] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setQrMap((prev) => {
          const next = { ...prev };
          for (const [id, dataUrl] of entries) {
            next[id] = dataUrl;
          }
          return next;
        });
      })
      .catch(() => {
        // Ignore QR canvas fallback
      });

    return () => {
      cancelled = true;
    };
  }, [emergencyTokens, latestQrByToken, qrMap]);

  const openEditModal = () => {
    setFullName(passport.patientFullName);
    setDob(passport.dateOfBirth);
    setBloodType(passport.bloodType === 'Not specified' ? '' : passport.bloodType);
    setAllergiesText(passport.allergies.join(', '));
    setConditionsText(passport.conditions.join(', '));
    setPhysician(passport.primaryPhysician);
    setPhysicianPhone(passport.physicianPhone);
    setPharmacyName(passport.pharmacyName);
    setPharmacyPhone(passport.pharmacyPhone);
    setEmergencyName(passport.emergencyContactName);
    setEmergencyPhone(passport.emergencyContactPhone);
    setDirective(passport.advanceDirectiveNote);
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    await updatePassport({
      ...passport,
      patientFullName: fullName.trim(),
      dateOfBirth: dob.trim(),
      bloodType: bloodType.trim(),
      allergies: allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      conditions: conditionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      primaryPhysician: physician.trim(),
      physicianPhone: physicianPhone.trim(),
      pharmacyName: pharmacyName.trim(),
      pharmacyPhone: pharmacyPhone.trim(),
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim(),
      advanceDirectiveNote: directive.trim(),
    });
    setEditOpen(false);
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingToken(true);
    try {
      await createEmergencyToken({
        label: tokenLabel.trim() || 'Emergency Responders',
        includeMedications: includeMeds,
        validHours: Number(tokenHours) || 24,
      });
    } finally {
      setCreatingToken(false);
    }
  };

  const copyTokenUrl = async (tokenId: string) => {
    const url = `${window.location.origin}/emergency/${tokenId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(tokenId);
      window.setTimeout(() => setCopiedToken((t) => (t === tokenId ? null : t)), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <AppShell
      title="Emergency Health Passport"
      subtitle="Essential medical profile, allergies, active prescriptions, and revocable responder links."
      primaryAction={
        !isRestrictedFamily ? (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!emailVerified}
                onClick={openEditModal}
              >
                <Edit3 className="h-4 w-4" />
                Edit Details
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Summary
            </Button>
          </div>
        ) : undefined
      }
    >
      {isRestrictedFamily ? (
        <Card tone="lavender" className="p-8 flex items-start gap-4">
          <Lock className="h-6 w-6 text-[#5D4A96] shrink-0" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Emergency Health Passport Restricted
            </h2>
            <p className="mt-2 text-base text-[#2C5E63]">
              Current patient privacy preferences restrict Health Passport access
              in Family view.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card tone="white" className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCE5E2] pb-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E2F1EA] text-[#10373A]">
                  <FileHeart className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1A7A68]">
                    Verified Patient Passport · Updated {passport.updatedAt}
                  </p>
                  <h2 className="font-display text-2xl font-bold text-[#10373A]">
                    {passport.patientFullName}
                  </h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-[#4B7478]">Date of Birth</p>
                  <p className="font-mono font-semibold text-[#10373A] tabular-nums">
                    {passport.dateOfBirth || 'Not recorded'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#4B7478]">Blood Type</p>
                  <p className="font-mono font-semibold text-[#B42318]">
                    {passport.bloodType}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#F5C2C0] bg-[#FEF6F5] p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#991B1B]">
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <span>Known Allergies</span>
                </div>
                {passport.allergies.length === 0 ? (
                  <p className="text-sm text-[#4B7478]">No allergies recorded yet.</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-1 text-base text-[#10373A]">
                    {passport.allergies.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-5 space-y-2">
                <p className="text-sm font-bold text-[#10373A]">Medical Conditions</p>
                {passport.conditions.length === 0 ? (
                  <p className="text-sm text-[#4B7478]">No conditions recorded yet.</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-1 text-base text-[#10373A]">
                    {passport.conditions.map((cond) => (
                      <li key={cond}>{cond}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-[#EBF0EE] pt-6">
              <h3 className="font-display text-lg font-bold text-[#10373A]">
                Current Active Medications ({activeMeds.length})
              </h3>
              {activeMeds.length === 0 ? (
                <p className="mt-2 text-sm text-[#4B7478]">
                  No active medications listed on this health profile yet.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {activeMeds.map((med) => (
                    <div key={med.id} className="border-b border-[#EBF0EE] pb-3">
                      <p className="font-display text-base font-bold text-[#10373A]">
                        {med.name} — {med.dosage}
                      </p>
                      <p className="text-sm text-[#4B7478]">
                        {med.instructions} · Prescriber: {med.prescriber}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-[#EBF0EE] pt-6">
              <div>
                <p className="text-xs font-semibold text-[#4B7478]">Primary Physician</p>
                <p className="mt-1 font-display text-base font-bold text-[#10373A]">
                  {passport.primaryPhysician || 'Not listed'}
                </p>
                {passport.physicianPhone && (
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-[#2C5E63] tabular-nums">
                    <Phone className="h-3.5 w-3.5" />
                    {passport.physicianPhone}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#4B7478]">
                  Emergency Contact / Proxy
                </p>
                <p className="mt-1 font-display text-base font-bold text-[#10373A]">
                  {passport.emergencyContactName || 'Not listed'}
                </p>
                {passport.emergencyContactPhone && (
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-[#2C5E63] tabular-nums">
                    <Phone className="h-3.5 w-3.5" />
                    {passport.emergencyContactPhone}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#4B7478]">
                  Pharmacy & Advance Directive
                </p>
                <p className="mt-1 text-sm font-semibold text-[#10373A]">
                  {passport.pharmacyName || 'No pharmacy set'}{' '}
                  {passport.pharmacyPhone ? `(${passport.pharmacyPhone})` : ''}
                </p>
                <p className="mt-1 text-sm text-[#4B7478]">
                  {passport.advanceDirectiveNote || 'No directive note recorded.'}
                </p>
              </div>
            </div>
          </Card>

          {/* Controlled Emergency Access Tokens (Owner Only) */}
          {isProfileOwner ? (
            <Card tone="mint" className="no-print p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-display text-xl font-bold text-[#10373A]">
                      Emergency Responder QR & Access Tokens
                    </h3>
                    <span className="text-xs font-bold text-[#116B4B]">
                      Active · Token-Gated
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#2C5E63]">
                    Issue unguessable 24+ character responder links and scannable
                    QR codes backed by revocable{' '}
                    <code className="font-mono text-xs">/emergency/:token</code>{' '}
                    snapshots. Predictable profile IDs and date of birth are omitted;
                    links expire automatically or on instant revocation.
                  </p>
                </div>
                <QrCode className="h-5 w-5 text-[#1A7A68] shrink-0" />
              </div>

              <form
                onSubmit={handleCreateToken}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end rounded-xl bg-white border border-[#CBE4D8] p-4"
              >
                <div className="md:col-span-5">
                  <Input
                    label="Recipient Label"
                    value={tokenLabel}
                    onChange={(e) => setTokenLabel(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <Select
                    label="Expires In"
                    value={tokenHours}
                    onChange={(e) => setTokenHours(e.target.value)}
                    options={[
                      { value: '4', label: '4 hours' },
                      { value: '24', label: '24 hours' },
                      { value: '168', label: '7 days' },
                    ]}
                  />
                </div>
                <div className="md:col-span-4 flex flex-col gap-2">
                  <Switch
                    label="Include active meds"
                    checked={includeMeds}
                    onChange={setIncludeMeds}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!emailVerified || creatingToken}
                  >
                    <Link2 className="h-4 w-4" />
                    {creatingToken ? 'Issuing QR & Link...' : 'Generate Emergency QR & Link'}
                  </Button>
                </div>
              </form>

              {emergencyTokens.length > 0 && (
                <div className="divide-y divide-[#CBE4D8]">
                  {emergencyTokens.map((tok) => {
                    const qrSrc = latestQrByToken[tok.id] || qrMap[tok.id];
                    const isExpired = Date.parse(tok.expiresAtIso) <= Date.now();
                    const isActiveToken = !tok.revoked && !isExpired;
                    return (
                      <div
                        key={tok.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {isActiveToken && qrSrc && (
                            <img
                              src={qrSrc}
                              alt={`Emergency QR code for ${tok.label}`}
                              className="h-24 w-24 rounded-lg border border-[#CBE4D8] bg-white p-1 shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold text-[#10373A]">
                              {tok.label} ·{' '}
                              <span
                                className={
                                  tok.revoked
                                    ? 'text-[#B42318]'
                                    : isExpired
                                      ? 'text-[#9E5A00]'
                                      : 'text-[#116B4B]'
                                }
                              >
                                {tok.revoked
                                  ? 'Revoked'
                                  : isExpired
                                    ? 'Expired'
                                    : 'Active'}
                              </span>
                            </p>
                            <p className="font-mono text-xs text-[#4B7478] truncate">
                              /emergency/{tok.id} · Expires{' '}
                              {new Date(tok.expiresAtIso).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {isActiveToken && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <a
                              href={`/emergency/${tok.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button size="sm" variant="secondary" type="button">
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open View
                              </Button>
                            </a>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => copyTokenUrl(tok.id)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {copiedToken === tok.id ? 'Copied Link' : 'Copy Link'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => revokeEmergencyToken(tok.id)}
                            >
                              <XCircle className="h-4 w-4 text-[#B42318]" />
                              Revoke
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : activeRole === 'caregiver' ? (
            <Card tone="mint" className="no-print p-5 flex items-start gap-3">
              <QrCode className="h-5 w-5 text-[#1A7A68] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-base font-bold text-[#10373A]">
                  Emergency QR & Token Issuance
                </p>
                <p className="mt-1 text-sm text-[#2C5E63]">
                  Only the patient profile owner can issue or revoke public{' '}
                  <code className="font-mono text-xs">/emergency/:token</code> QR
                  links. You can still update allergies, physician contacts, and health
                  notes above.
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Update Emergency Health Passport"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {isProfileOwner && (
            <>
              <Input
                label="Patient Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Date of Birth"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
                <Input
                  label="Blood Type"
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                />
              </div>
            </>
          )}
          <Textarea
            label="Allergies (comma-separated)"
            value={allergiesText}
            onChange={(e) => setAllergiesText(e.target.value)}
          />
          <Textarea
            label="Conditions (comma-separated)"
            value={conditionsText}
            onChange={(e) => setConditionsText(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Primary Physician"
              value={physician}
              onChange={(e) => setPhysician(e.target.value)}
            />
            <Input
              label="Physician Phone"
              value={physicianPhone}
              onChange={(e) => setPhysicianPhone(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Pharmacy Name"
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
            />
            <Input
              label="Pharmacy Phone"
              value={pharmacyPhone}
              onChange={(e) => setPharmacyPhone(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Emergency Contact Name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
            />
            <Input
              label="Emergency Contact Phone"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
            />
          </div>
          <Textarea
            label="Advance Directive Note"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Passport</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
