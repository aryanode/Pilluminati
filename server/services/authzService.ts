import { ApiError } from '../middleware/errorHandler.ts';
import { getFirestoreDoc } from './firestoreRest.ts';

export interface AuthoritativeProfile {
  id: string;
  ownerUid: string;
  authorizedUids: string[];
  caregiverUids: string[];
  familyUids: string[];
  fullName: string;
  dateOfBirth?: string;
  bloodType?: string;
  allergiesText?: string;
  conditionsText?: string;
  primaryPhysician?: string;
  physicianPhone?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  advanceDirectiveNote?: string;
  familyShowDetailedMeds: boolean;
  familyShowAdherencePct: boolean;
  familyShowAppointments: boolean;
  familyShowCareUpdates: boolean;
  familyShowPassport: boolean;
}

export type DerivedProfileRole = 'patient' | 'caregiver' | 'family';

export async function authorizeProfileAccess(params: {
  profileId: string;
  uid: string;
  idToken: string;
  minLevel: 'member' | 'clinical' | 'owner';
}): Promise<{ profile: AuthoritativeProfile; role: DerivedProfileRole }> {
  const profile = await getFirestoreDoc<AuthoritativeProfile>(
    'patientProfiles',
    params.profileId,
    params.idToken,
  );

  if (!profile) {
    throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Patient health profile not found.');
  }

  const authorized = Array.isArray(profile.authorizedUids)
    ? profile.authorizedUids
    : [];
  const caregivers = Array.isArray(profile.caregiverUids)
    ? profile.caregiverUids
    : [];
  const family = Array.isArray(profile.familyUids) ? profile.familyUids : [];

  let role: DerivedProfileRole | null = null;
  if (profile.ownerUid === params.uid) {
    role = 'patient';
  } else if (caregivers.includes(params.uid)) {
    role = 'caregiver';
  } else if (family.includes(params.uid)) {
    role = 'family';
  }

  if (!role || !authorized.includes(params.uid)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'You are not authorized to access this patient health profile.',
    );
  }

  if (params.minLevel === 'owner' && role !== 'patient') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Only the patient profile owner can perform this action.',
    );
  }

  if (params.minLevel === 'clinical' && role === 'family') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Family members have read-only scoped visibility and cannot modify clinical records.',
    );
  }

  return { profile, role };
}
