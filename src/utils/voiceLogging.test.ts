import assert from 'node:assert/strict';
import test from 'node:test';
import type { Medication, ScheduledDoseInstance, TimeSlot } from '../types/pilluminati.ts';
import {
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  mapSpeechRecognitionError,
  matchVoicePhraseToDose,
} from './voiceLogging.ts';

function makeDose(overrides: {
  id: string;
  name: string;
  dosage?: string;
  timeSlot?: TimeSlot;
  scheduledTime?: string;
  status?: ScheduledDoseInstance['status'];
}): ScheduledDoseInstance {
  const med: Medication = {
    id: overrides.id,
    name: overrides.name,
    dosage: overrides.dosage ?? '10 mg',
    timeSlot: overrides.timeSlot ?? 'morning',
    scheduledTime: overrides.scheduledTime ?? '08:00',
    instructions: 'Take with water',
    prescriber: 'Dr. Patel',
    pillAppearance: 'Small white tablet',
    supplyDays: 30,
    active: true,
  };
  return {
    doseKey: `${overrides.id}::2026-11-15::${med.scheduledTime}`,
    medication: med,
    scheduledDate: '2026-11-15',
    scheduledTime: med.scheduledTime,
    timeSlot: med.timeSlot,
    status: overrides.status ?? 'pending',
    log: null,
    minutesDelta: 0,
    isDueNow: true,
    isUnconfirmedWindow: false,
    isMissedWindow: false,
    formattedCountdown: 'Due now',
  };
}

test('Web Speech API support detection handles supported and unsupported environments', () => {
  assert.equal(isSpeechRecognitionSupported({}), false);
  assert.equal(getSpeechRecognitionConstructor({}), null);

  function FakeRecognition() {}
  assert.equal(
    isSpeechRecognitionSupported({ SpeechRecognition: FakeRecognition }),
    true,
  );
  assert.equal(
    isSpeechRecognitionSupported({ webkitSpeechRecognition: FakeRecognition }),
    true,
  );
});

test('matches "I took my morning medicine." unambiguously when 1 morning dose is pending', () => {
  const morning = makeDose({
    id: 'med-lisinopril',
    name: 'Lisinopril',
    timeSlot: 'morning',
    scheduledTime: '08:00',
  });
  const evening = makeDose({
    id: 'med-atorvastatin',
    name: 'Atorvastatin',
    timeSlot: 'evening',
    scheduledTime: '20:00',
  });

  const result = matchVoicePhraseToDose('I took my morning medicine.', [
    morning,
    evening,
  ]);
  assert.equal(result.status, 'matched');
  if (result.status === 'matched') {
    assert.equal(result.dose.doseKey, morning.doseKey);
  }
});

test('returns ambiguous when multiple morning doses remain for "I took my morning medicine."', () => {
  const m1 = makeDose({
    id: 'med-1',
    name: 'Lisinopril',
    timeSlot: 'morning',
    scheduledTime: '08:00',
  });
  const m2 = makeDose({
    id: 'med-2',
    name: 'Vitamin D3',
    timeSlot: 'morning',
    scheduledTime: '08:30',
  });

  const result = matchVoicePhraseToDose('I took my morning medicine.', [m1, m2]);
  assert.equal(result.status, 'ambiguous');
  if (result.status === 'ambiguous') {
    assert.equal(result.candidates.length, 2);
  }
});

test('matches "I have taken my medicine." unambiguously only when 1 actionable dose remains', () => {
  const takenMorning = makeDose({
    id: 'med-1',
    name: 'Lisinopril',
    timeSlot: 'morning',
    scheduledTime: '08:00',
    status: 'taken',
  });
  const pendingEvening = makeDose({
    id: 'med-2',
    name: 'Atorvastatin',
    timeSlot: 'evening',
    scheduledTime: '20:00',
    status: 'unconfirmed',
  });

  const unambiguous = matchVoicePhraseToDose('I have taken my medicine.', [
    takenMorning,
    pendingEvening,
  ]);
  assert.equal(unambiguous.status, 'matched');
  if (unambiguous.status === 'matched') {
    assert.equal(unambiguous.dose.doseKey, pendingEvening.doseKey);
  }

  const pendingMorning = { ...takenMorning, status: 'pending' as const };
  const ambiguous = matchVoicePhraseToDose('I have taken my medicine.', [
    pendingMorning,
    pendingEvening,
  ]);
  assert.equal(ambiguous.status, 'ambiguous');
  if (ambiguous.status === 'ambiguous') {
    assert.equal(ambiguous.candidates.length, 2);
  }
});

test('matches explicit medication name and narrows multi-dose schedules by slot or hour', () => {
  const metMorning = makeDose({
    id: 'med-met',
    name: 'Metformin',
    dosage: '500 mg',
    timeSlot: 'morning',
    scheduledTime: '08:00',
  });
  const metEvening = makeDose({
    id: 'med-met',
    name: 'Metformin',
    dosage: '500 mg',
    timeSlot: 'evening',
    scheduledTime: '20:00',
  });
  const lisinopril = makeDose({
    id: 'med-lis',
    name: 'Lisinopril',
    timeSlot: 'morning',
    scheduledTime: '08:00',
  });

  const byName = matchVoicePhraseToDose('I took my Lisinopril', [
    metMorning,
    metEvening,
    lisinopril,
  ]);
  assert.equal(byName.status, 'matched');
  if (byName.status === 'matched') {
    assert.equal(byName.dose.medication.name, 'Lisinopril');
  }

  const metWithoutSlot = matchVoicePhraseToDose('I took my Metformin', [
    metMorning,
    metEvening,
  ]);
  assert.equal(metWithoutSlot.status, 'ambiguous');

  const metWithSlot = matchVoicePhraseToDose('I took my evening Metformin', [
    metMorning,
    metEvening,
  ]);
  assert.equal(metWithSlot.status, 'matched');
  if (metWithSlot.status === 'matched') {
    assert.equal(metWithSlot.dose.timeSlot, 'evening');
  }

  const bySpokenTime = matchVoicePhraseToDose('I took my 8 pm medicine', [
    metMorning,
    metEvening,
  ]);
  assert.equal(bySpokenTime.status, 'matched');
  if (bySpokenTime.status === 'matched') {
    assert.equal(bySpokenTime.dose.scheduledTime, '20:00');
  }
});

test('rejects negative or questioning phrases safely without matching', () => {
  const morning = makeDose({
    id: 'med-1',
    name: 'Lisinopril',
    timeSlot: 'morning',
    scheduledTime: '08:00',
  });

  const neg1 = matchVoicePhraseToDose("I didn't take my morning medicine yet", [
    morning,
  ]);
  assert.equal(neg1.status, 'negative_intent');

  const neg2 = matchVoicePhraseToDose('Did I take my medicine?', [morning]);
  assert.equal(neg2.status, 'negative_intent');
});

test('returns all_completed when all doses today are already handled', () => {
  const taken = makeDose({
    id: 'med-1',
    name: 'Lisinopril',
    status: 'taken',
  });
  const result = matchVoicePhraseToDose('I have taken my medicine.', [taken]);
  assert.equal(result.status, 'all_completed');
});

test('maps speech recognition error codes to senior-friendly fallback messages', () => {
  assert.match(mapSpeechRecognitionError('not-allowed'), /one-tap confirmation/i);
  assert.match(mapSpeechRecognitionError('audio-capture'), /one-tap confirmation/i);
});
