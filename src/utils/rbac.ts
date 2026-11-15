import type { UserRole } from '../types/pilluminati';

export interface ProfileAccessShape {
  ownerUid: string;
  caregiverUids: string[];
  familyUids: string[];
  authorizedUids: string[];
}

export function generateSecureId(prefix: string, randomBytesCount = 14): string {
  const bytes = new Uint8Array(randomBytesCount);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function resolveProfileRole(
  profile: ProfileAccessShape | null | undefined,
  uid: string | null | undefined,
): UserRole | null {
  if (!profile || !uid) return null;
  if (profile.ownerUid === uid) return 'patient';
  if (profile.caregiverUids.includes(uid)) return 'caregiver';
  if (profile.familyUids.includes(uid)) return 'family';
  return null;
}

export function canEditClinicalData(
  profile: ProfileAccessShape | null | undefined,
  uid: string | null | undefined,
): boolean {
  const role = resolveProfileRole(profile, uid);
  return role === 'patient' || role === 'caregiver';
}

export function canManageProfileSecurity(
  profile: ProfileAccessShape | null | undefined,
  uid: string | null | undefined,
): boolean {
  return Boolean(profile && uid && profile.ownerUid === uid);
}

export function buildAuthorizedLists(params: {
  ownerUid: string;
  caregiverUids: string[];
  familyUids: string[];
}): {
  caregiverUids: string[];
  familyUids: string[];
  clinicalUids: string[];
  authorizedUids: string[];
} {
  const caregiverSet = new Set(
    params.caregiverUids.filter((u) => u && u !== params.ownerUid),
  );
  const familySet = new Set(
    params.familyUids.filter(
      (u) => u && u !== params.ownerUid && !caregiverSet.has(u),
    ),
  );
  const caregiverUids = Array.from(caregiverSet);
  const familyUids = Array.from(familySet);
  const clinicalUids = Array.from(new Set([params.ownerUid, ...caregiverUids]));
  const authorizedUids = Array.from(
    new Set([params.ownerUid, ...caregiverUids, ...familyUids]),
  );

  return { caregiverUids, familyUids, clinicalUids, authorizedUids };
}

export function validateAuthCredentials(input: {
  mode: 'login' | 'register' | 'reset';
  email: string;
  password?: string;
  displayName?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = input.email.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (input.mode !== 'reset') {
    const pwd = input.password ?? '';
    if (pwd.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
  }

  if (input.mode === 'register') {
    const name = (input.displayName ?? '').trim();
    if (!name) {
      errors.displayName = 'Full name is required.';
    } else if (name.length > 120) {
      errors.displayName = 'Name must be 120 characters or fewer.';
    }
  }

  return errors;
}

export function validatePatientProfileInput(input: {
  fullName: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.fullName.trim()) {
    errors.fullName = 'Patient full name is required.';
  } else if (input.fullName.trim().length > 120) {
    errors.fullName = 'Patient name must be 120 characters or fewer.';
  }

  if (input.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    errors.dateOfBirth = 'Use YYYY-MM-DD format for date of birth.';
  }

  if (
    input.emergencyContactName &&
    input.emergencyContactName.trim().length > 120
  ) {
    errors.emergencyContactName = 'Contact name must be 120 characters or fewer.';
  }

  if (
    input.emergencyContactPhone &&
    input.emergencyContactPhone.trim().length > 32
  ) {
    errors.emergencyContactPhone = 'Phone number must be 32 characters or fewer.';
  }

  return errors;
}
