export interface SanitizedEmergencyMedication {
  name: string;
  dosage: string;
  instructions: string;
}

export interface PublicEmergencyResponsePayload {
  readOnly: true;
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
  includeMedications: boolean;
  activeMedications: SanitizedEmergencyMedication[];
}

export function extractActiveEmergencyMedications(
  medsRaw: Array<Record<string, unknown>>,
  includeMedications: boolean,
): SanitizedEmergencyMedication[] {
  if (!includeMedications) return [];
  return medsRaw
    .filter((m) => Boolean(m.active ?? true) && !Boolean(m.discontinued ?? false))
    .slice(0, 30)
    .map((m) => ({
      name: String(m.name || '').slice(0, 120),
      dosage: String(m.dosage || '').slice(0, 60),
      instructions: String(m.instructions || '').slice(0, 200),
    }));
}

export function buildPublicEmergencyResponse(
  snapshot: Record<string, unknown>,
): PublicEmergencyResponsePayload {
  const includeMedications = Boolean(snapshot.includeMedications ?? false);
  const rawMeds =
    includeMedications && Array.isArray(snapshot.activeMedications)
      ? (snapshot.activeMedications as Array<Record<string, unknown>>)
      : [];

  return {
    readOnly: true,
    label: String(snapshot.label || 'Emergency Responders').slice(0, 100),
    expiresAt: String(snapshot.expiresAt || ''),
    patientFullName: String(snapshot.patientFullName || 'Patient').slice(0, 120),
    bloodType: String(snapshot.bloodType || 'Not specified').slice(0, 20),
    allergies: Array.isArray(snapshot.allergies)
      ? snapshot.allergies.map(String).slice(0, 30)
      : [],
    conditions: Array.isArray(snapshot.conditions)
      ? snapshot.conditions.map(String).slice(0, 30)
      : [],
    primaryPhysician: String(snapshot.primaryPhysician || '').slice(0, 120),
    physicianPhone: String(snapshot.physicianPhone || '').slice(0, 32),
    emergencyContactName: String(snapshot.emergencyContactName || '').slice(0, 120),
    emergencyContactRelation: String(snapshot.emergencyContactRelation || '').slice(0, 80),
    emergencyContactPhone: String(snapshot.emergencyContactPhone || '').slice(0, 32),
    advanceDirectiveNote: String(snapshot.advanceDirectiveNote || '').slice(0, 500),
    includeMedications,
    activeMedications: rawMeds.slice(0, 30).map((m) => ({
      name: String(m.name || '').slice(0, 120),
      dosage: String(m.dosage || '').slice(0, 60),
      instructions: String(m.instructions || '').slice(0, 200),
    })),
  };
}
