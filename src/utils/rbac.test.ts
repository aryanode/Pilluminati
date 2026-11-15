import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizedLists,
  canEditClinicalData,
  canManageProfileSecurity,
  generateSecureId,
  resolveProfileRole,
  validateAuthCredentials,
  validatePatientProfileInput,
} from './rbac.ts';

test('resolveProfileRole determines access strictly from profile lists without self-escalation', () => {
  const profile = {
    ownerUid: 'uid-patient',
    caregiverUids: ['uid-caregiver'],
    familyUids: ['uid-family'],
    authorizedUids: ['uid-patient', 'uid-caregiver', 'uid-family'],
  };

  assert.equal(resolveProfileRole(profile, 'uid-patient'), 'patient');
  assert.equal(resolveProfileRole(profile, 'uid-caregiver'), 'caregiver');
  assert.equal(resolveProfileRole(profile, 'uid-family'), 'family');
  assert.equal(resolveProfileRole(profile, 'uid-stranger'), null);

  assert.equal(canEditClinicalData(profile, 'uid-patient'), true);
  assert.equal(canEditClinicalData(profile, 'uid-caregiver'), true);
  assert.equal(canEditClinicalData(profile, 'uid-family'), false);
  assert.equal(canManageProfileSecurity(profile, 'uid-patient'), true);
  assert.equal(canManageProfileSecurity(profile, 'uid-caregiver'), false);
});

test('buildAuthorizedLists deduplicates and separates caregiver vs family privileges', () => {
  const lists = buildAuthorizedLists({
    ownerUid: 'u1',
    caregiverUids: ['u2', 'u1'],
    familyUids: ['u3', 'u2', 'u1'],
  });
  assert.deepEqual(lists.caregiverUids, ['u2']);
  assert.deepEqual(lists.familyUids, ['u3']);
  assert.deepEqual(lists.clinicalUids, ['u1', 'u2']);
  assert.deepEqual(lists.authorizedUids, ['u1', 'u2', 'u3']);
});

test('generateSecureId produces unpredictable 16+ char alphanumeric/underscore IDs', () => {
  const a = generateSecureId('prof');
  const b = generateSecureId('prof');
  assert.notEqual(a, b);
  assert.ok(a.length >= 24);
  assert.match(a, /^[a-zA-Z0-9_-]+$/);
});

test('validateAuthCredentials and validatePatientProfileInput validate inputs cleanly', () => {
  const badReg = validateAuthCredentials({
    mode: 'register',
    email: 'invalid',
    password: 'short',
    displayName: '   ',
  });
  assert.ok(badReg.email);
  assert.ok(badReg.password);
  assert.ok(badReg.displayName);

  const okReg = validateAuthCredentials({
    mode: 'register',
    email: 'eleanor@example.com',
    password: 'StrongPassword123',
    displayName: 'Eleanor Vance',
  });
  assert.deepEqual(okReg, {});

  const badProfile = validatePatientProfileInput({
    fullName: '',
    dateOfBirth: '18-04-1950',
  });
  assert.ok(badProfile.fullName);
  assert.ok(badProfile.dateOfBirth);
});
