import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  FileHeart,
  Lock,
  Phone,
  Pill,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { Button, Card, ErrorBanner, Skeleton } from '../components/ui/Primitives';

interface EmergencySnapshot {
  readOnly?: boolean;
  label: string;
  expiresAt: string;
  patientFullName: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  primaryPhysician: string;
  physicianPhone: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  advanceDirectiveNote: string;
  includeMedications?: boolean;
  activeMedications: { name: string; dosage: string; instructions: string }[];
}

export function EmergencyTokenPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<EmergencySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/emergency/${encodeURIComponent(token || '')}`);
        const json = (await res.json()) as EmergencySnapshot & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || 'Unable to load emergency health passport.');
        }
        if (active) setData(json);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Emergency health passport link could not be verified.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [token]);

  const expiresFormatted = data?.expiresAt
    ? new Date(data.expiresAt).toLocaleString()
    : 'Limited time';

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#10373A]">
      <header className="no-print border-b border-[#DCE5E2] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-[#10373A]"
          >
            PILLUMINATI
          </Link>
          {data && (
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Responder View
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error || !data ? (
          <div className="space-y-6">
            <ErrorBanner
              title="Emergency Passport Link Unavailable"
              message={
                error ||
                'This emergency passport link could not be verified, has expired, or was revoked by the patient owner.'
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/passport">
                <Button>Sign In to View Authenticated Passport</Button>
              </Link>
              <Link to="/">
                <Button variant="secondary">Return to PILLUMINATI Home</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Clear Emergency Access Notice */}
            <div
              role="region"
              aria-label="Emergency Access Notice"
              className="rounded-2xl border border-[#EED29F] bg-[#FFFBF2] p-5 flex items-start gap-3.5 shadow-[0_2px_10px_rgba(16,55,58,0.04)]"
            >
              <AlertTriangle className="h-5 w-5 text-[#9E5A00] shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="font-display text-base font-bold text-[#6B4200]">
                    Emergency Access Notice · Read-Only Snapshot
                  </h2>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B4200]">
                    <Lock className="h-3.5 w-3.5" />
                    Read-Only
                  </span>
                </div>
                <p className="text-[#4A3208] leading-relaxed">
                  You are viewing a revocable, time-limited emergency health summary
                  issued for <strong>{data.label}</strong> (expires {expiresFormatted}).
                  Predictable profile IDs, date of birth, home address, and account
                  identifiers are intentionally omitted for privacy. Confirm clinical
                  details with the emergency contact or primary physician before treatment.
                </p>
              </div>
            </div>

            <Card tone="white" className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCE5E2] pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E2F1EA] text-[#10373A]">
                    <FileHeart className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1A7A68]">
                      Emergency Responder Access · {data.label}
                    </p>
                    <h1 className="font-display text-2xl font-bold text-[#10373A]">
                      {data.patientFullName}
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div>
                    <p className="text-xs text-[#4B7478]">Blood Type</p>
                    <p className="font-mono font-semibold text-[#B42318]">
                      {data.bloodType || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#4B7478]">Token Access</p>
                    <p className="font-semibold text-[#116B4B]">Read-Only</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#F5C2C0] bg-[#FEF6F5] p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#991B1B]">
                    <ShieldAlert className="h-4.5 w-4.5" />
                    <span>Known Allergies</span>
                  </div>
                  {data.allergies.length === 0 ? (
                    <p className="text-sm text-[#4B7478]">No known allergies recorded.</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1 text-base text-[#10373A]">
                      {data.allergies.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-5 space-y-2">
                  <p className="text-sm font-bold text-[#10373A]">
                    Relevant Medical Conditions
                  </p>
                  {data.conditions.length === 0 ? (
                    <p className="text-sm text-[#4B7478]">No conditions recorded.</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1 text-base text-[#10373A]">
                      {data.conditions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Active Medications & Dosages */}
              <div className="border-t border-[#EBF0EE] pt-6">
                <div className="flex items-center gap-2">
                  <Pill className="h-4.5 w-4.5 text-[#1A7A68]" />
                  <h2 className="font-display text-lg font-bold text-[#10373A]">
                    Active Medications & Dosages ({data.activeMedications.length})
                  </h2>
                </div>
                {data.includeMedications === false ? (
                  <p className="mt-2 text-sm text-[#4B7478]">
                    Medication list withheld by the patient owner for this responder token.
                  </p>
                ) : data.activeMedications.length === 0 ? (
                  <p className="mt-2 text-sm text-[#4B7478]">
                    No active medications recorded on this emergency snapshot.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.activeMedications.map((m, idx) => (
                      <div key={`${m.name}-${idx}`} className="border-b border-[#EBF0EE] pb-3">
                        <p className="font-display font-bold text-[#10373A]">
                          {m.name} — {m.dosage}
                        </p>
                        {m.instructions && (
                          <p className="text-sm text-[#4B7478]">{m.instructions}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Emergency Contacts, Physician, and Health Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-[#EBF0EE] pt-6">
                <div>
                  <p className="text-xs font-semibold text-[#4B7478]">
                    Emergency Contact ({data.emergencyContactRelation || 'Proxy'})
                  </p>
                  <p className="mt-1 font-display font-bold text-[#10373A]">
                    {data.emergencyContactName || 'Not listed'}
                  </p>
                  {data.emergencyContactPhone && (
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-[#2C5E63] tabular-nums">
                      <Phone className="h-3.5 w-3.5" />
                      {data.emergencyContactPhone}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#4B7478]">Primary Physician</p>
                  <p className="mt-1 font-display font-bold text-[#10373A]">
                    {data.primaryPhysician || 'Not listed'}
                  </p>
                  {data.physicianPhone && (
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-[#2C5E63] tabular-nums">
                      <Phone className="h-3.5 w-3.5" />
                      {data.physicianPhone}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#4B7478]">
                    Relevant Health Notes & Directive
                  </p>
                  <p className="mt-1 text-sm text-[#2C5E63]">
                    {data.advanceDirectiveNote || 'No additional health notes recorded.'}
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
