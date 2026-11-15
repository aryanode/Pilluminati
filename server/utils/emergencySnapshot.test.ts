import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicEmergencyResponse,
  extractActiveEmergencyMedications,
} from './emergencySnapshot.ts';

test('extractActiveEmergencyMedications includes only active non-discontinued medications', () => {
  const meds = [
    { name: 'Lisinopril', dosage: '10 mg', instructions: 'Take daily', active: true, discontinued: false },
    { name: 'Aspirin', dosage: '81 mg', instructions: 'Discontinued', active: true, discontinued: true },
    { name: 'Vitamin D', dosage: '1000 IU', instructions: 'Paused', active: false, discontinued: false },
  ];

  const activeOnly = extractActiveEmergencyMedications(meds, true);
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].name, 'Lisinopril');
  assert.equal(activeOnly[0].dosage, '10 mg');

  const withheld = extractActiveEmergencyMedications(meds, false);
  assert.deepEqual(withheld, []);
});

test('buildPublicEmergencyResponse omits profileId, ownerUid, id, and dateOfBirth while enforcing readOnly', () => {
  const response = buildPublicEmergencyResponse({
    id: 'emg_secret_token_123456789012',
    profileId: 'prof_predictable_12345',
    ownerUid: 'uid_owner_999',
    dateOfBirth: '1945-04-12',
    label: 'EMS Responders',
    expiresAt: '2026-11-16T12:00:00.000Z',
    patientFullName: 'Eleanor Vance',
    bloodType: 'O+',
    allergies: ['Penicillin'],
    conditions: ['Hypertension'],
    primaryPhysician: 'Dr. Priya Patel',
    physicianPhone: '555-0102',
    emergencyContactName: 'David Vance',
    emergencyContactRelation: 'Son',
    emergencyContactPhone: '555-0148',
    advanceDirectiveNote: 'Prefer Cedar Valley Hospital.',
    includeMedications: true,
    activeMedications: [{ name: 'Lisinopril', dosage: '10 mg', instructions: 'Morning' }],
  });

  assert.equal(response.readOnly, true);
  assert.equal(response.patientFullName, 'Eleanor Vance');
  assert.equal(response.activeMedications.length, 1);
  assert.equal('profileId' in response, false);
  assert.equal('ownerUid' in response, false);
  assert.equal('id' in response, false);
  assert.equal('dateOfBirth' in response, false);
});
