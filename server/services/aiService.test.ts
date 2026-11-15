import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePrescriptionScanPayload } from './aiService.ts';

test('sanitizePrescriptionScanPayload preserves clearly printed prescription values', () => {
  const draft = sanitizePrescriptionScanPayload({
    medicineName: 'Lisinopril',
    dosageAmount: '10',
    dosageUnit: 'mg',
    frequency: 'once_daily',
    frequencyText: 'Take one tablet daily',
    suggestedTimes: ['08:00', '99:99', '08:00'],
    instructions: 'Take 1 tablet by mouth every morning.',
    foodInstruction: 'no_restriction',
    prescriber: 'Dr. Elena Rostova',
    uncertainFields: [],
    extractionNotes: 'Label text clearly legible.',
  });

  assert.equal(draft.medicineName, 'Lisinopril');
  assert.equal(draft.dosageAmount, '10');
  assert.equal(draft.dosageUnit, 'mg');
  assert.equal(draft.frequency, 'once_daily');
  assert.deepEqual(draft.suggestedTimes, ['08:00']);
  assert.equal(draft.instructions, 'Take 1 tablet by mouth every morning.');
  assert.equal(draft.foodInstruction, 'no_restriction');
  assert.equal(draft.prescriber, 'Dr. Elena Rostova');
  assert.deepEqual(draft.uncertainFields, []);
});

test('sanitizePrescriptionScanPayload never invents missing or uncertain dosage fields', () => {
  const draft = sanitizePrescriptionScanPayload({
    medicineName: 'Metformin',
    dosageAmount: 'uncertain',
    dosageUnit: 'unknown',
    frequency: 'invalid_freq',
    instructions: 'N/A',
    foodInstruction: 'maybe',
    prescriber: 'not specified',
    uncertainFields: ['dosageAmount'],
    extractionNotes: 'Dosage strength smudged on bottle.',
  });

  assert.equal(draft.medicineName, 'Metformin');
  assert.equal(draft.dosageAmount, '');
  assert.equal(draft.dosageUnit, '');
  assert.equal(draft.frequency, '');
  assert.equal(draft.instructions, '');
  assert.equal(draft.foodInstruction, '');
  assert.equal(draft.prescriber, '');
  assert.ok(draft.uncertainFields.includes('dosageAmount'));
  assert.ok(draft.uncertainFields.includes('dosageUnit'));
  assert.ok(draft.uncertainFields.includes('frequency'));
  assert.ok(draft.uncertainFields.includes('instructions'));
});
