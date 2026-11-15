import type { DoseStatus, ScheduledDoseInstance, TimeSlot } from '../types/pilluminati';

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type VoiceMatchResult =
  | {
      status: 'matched';
      dose: ScheduledDoseInstance;
      normalizedTranscript: string;
      confidenceReason: string;
    }
  | {
      status: 'ambiguous';
      candidates: ScheduledDoseInstance[];
      normalizedTranscript: string;
      reason: string;
    }
  | {
      status: 'negative_intent' | 'no_intent' | 'no_match' | 'all_completed' | 'no_doses_today';
      normalizedTranscript: string;
      reason: string;
    };

const ACTIONABLE_STATUSES = new Set<DoseStatus>([
  'pending',
  'upcoming',
  'due',
  'unconfirmed',
]);

const NEGATIVE_OR_QUESTION_PATTERN =
  /\b(didn't|did not|haven't|have not|hasn't|has not|not yet|forgot|forget|missed|skip|skipped|skipping|won't|will not|don't|do not|should i|when is|what time|did i)\b/i;

const AFFIRMATIVE_INTAKE_PATTERN =
  /\b(took|taken|just had|already had|had my|finished|log|confirm|mark)\b/i;

const GENERIC_MED_NOUN_PATTERN =
  /\b(medicine|medicines|meds|med|medication|medications|pill|pills|tablet|tablets|capsule|capsules|dose|doses)\b/i;

const SLOT_KEYWORDS: { slot: TimeSlot; pattern: RegExp }[] = [
  { slot: 'morning', pattern: /\b(morning|breakfast|early)\b/i },
  { slot: 'midday', pattern: /\b(midday|mid day|noon|lunch|afternoon)\b/i },
  { slot: 'evening', pattern: /\b(evening|dinner|supper)\b/i },
  { slot: 'bedtime', pattern: /\b(bedtime|bed time|night|sleep|before bed)\b/i },
];

export function getSpeechRecognitionConstructor(
  win?: unknown,
): SpeechRecognitionConstructor | null {
  const target =
    (win as Record<string, unknown> | undefined) ??
    (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined);
  if (!target) return null;

  const ctor = target.SpeechRecognition ?? target.webkitSpeechRecognition;
  if (typeof ctor === 'function') {
    return ctor as SpeechRecognitionConstructor;
  }
  return null;
}

export function isSpeechRecognitionSupported(win?: unknown): boolean {
  return getSpeechRecognitionConstructor(win) !== null;
}

export function mapSpeechRecognitionError(errorCode: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. You can allow microphone permission in your browser settings or use one-tap confirmation below.';
    case 'no-speech':
      return 'No speech was detected. Tap the microphone again and speak clearly, or use one-tap confirmation below.';
    case 'audio-capture':
      return 'No microphone was detected on this device. Please use one-tap confirmation below.';
    case 'network':
      return 'Speech recognition could not connect right now. Use one-tap confirmation below—your progress saves immediately.';
    case 'aborted':
      return 'Listening stopped before a phrase finished.';
    default:
      return 'Voice input encountered an issue. Please use one-tap confirmation below.';
  }
}

export function normalizeVoiceTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s:']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSpokenSlot(normalized: string): TimeSlot | null {
  const matches = SLOT_KEYWORDS.filter((entry) => entry.pattern.test(normalized));
  if (matches.length === 1) {
    return matches[0].slot;
  }
  return null;
}

function extractSpokenHour24(normalized: string): number | null {
  const amPmMatch = normalized.match(
    /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i,
  );
  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const meridiem = amPmMatch[3].toLowerCase();
    if (meridiem === 'am') {
      if (hour === 12) hour = 0;
    } else if (meridiem === 'pm') {
      if (hour < 12) hour += 12;
    }
    return hour;
  }

  const twentyFourMatch = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourMatch) {
    return Number(twentyFourMatch[1]);
  }
  return null;
}

function doesPhraseMentionMedication(
  normalizedTranscript: string,
  medicationName: string,
): boolean {
  const normalizedMed = normalizeVoiceTranscript(medicationName);
  if (!normalizedMed) return false;

  if (normalizedTranscript.includes(normalizedMed)) {
    return true;
  }

  // Match meaningful primary medication tokens (4+ chars, non-generic units)
  const stopWords = new Set(['tablet', 'tablets', 'capsule', 'capsules', 'daily', 'extra', 'strength']);
  const tokens = normalizedMed
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token));

  return tokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedTranscript);
  });
}

function getDoseHour24(scheduledTime: string): number | null {
  const [hStr] = scheduledTime.split(':');
  const h = Number(hStr);
  return Number.isFinite(h) ? h : null;
}

export function isDoseActionableForVoice(inst: ScheduledDoseInstance): boolean {
  return ACTIONABLE_STATUSES.has(inst.status);
}

/**
 * Deterministically matches a spoken transcript to today's actionable doses
 * ONLY when the match is unambiguous. Never guesses among multiple candidates,
 * and never logs automatically (caller must present a confirmation prompt).
 */
export function matchVoicePhraseToDose(
  transcript: string,
  scheduledDoses: ScheduledDoseInstance[],
): VoiceMatchResult {
  const normalized = normalizeVoiceTranscript(transcript);

  if (!normalized) {
    return {
      status: 'no_intent',
      normalizedTranscript: normalized,
      reason:
        'Try saying “I took my morning medicine” or “I have taken my medicine”.',
    };
  }

  if (NEGATIVE_OR_QUESTION_PATTERN.test(normalized)) {
    return {
      status: 'negative_intent',
      normalizedTranscript: normalized,
      reason:
        'That sounded like a question or unconfirmed note rather than a completed dose. Use the one-tap controls below to confirm or skip.',
    };
  }

  const hasIntakeVerb = AFFIRMATIVE_INTAKE_PATTERN.test(normalized);
  if (!hasIntakeVerb) {
    return {
      status: 'no_intent',
      normalizedTranscript: normalized,
      reason:
        'Try saying “I took my morning medicine” or “I have taken my medicine”.',
    };
  }

  if (scheduledDoses.length === 0) {
    return {
      status: 'no_doses_today',
      normalizedTranscript: normalized,
      reason: 'No active medications are scheduled for today.',
    };
  }

  const actionable = scheduledDoses.filter(isDoseActionableForVoice);
  if (actionable.length === 0) {
    return {
      status: 'all_completed',
      normalizedTranscript: normalized,
      reason: 'All scheduled doses for today are already handled.',
    };
  }

  const spokenSlot = extractSpokenSlot(normalized);
  const spokenHour = extractSpokenHour24(normalized);

  // 1. Direct medication name match among actionable doses
  const nameMatches = actionable.filter((inst) =>
    doesPhraseMentionMedication(normalized, inst.medication.name),
  );

  if (nameMatches.length === 1) {
    return {
      status: 'matched',
      dose: nameMatches[0],
      normalizedTranscript: normalized,
      confidenceReason: `Matched "${nameMatches[0].medication.name}" cleanly.`,
    };
  }

  if (nameMatches.length > 1) {
    let narrowed = nameMatches;
    if (spokenSlot) {
      const bySlot = narrowed.filter((inst) => inst.timeSlot === spokenSlot);
      if (bySlot.length > 0) narrowed = bySlot;
    }
    if (spokenHour !== null && narrowed.length > 1) {
      const byHour = narrowed.filter(
        (inst) => getDoseHour24(inst.scheduledTime) === spokenHour,
      );
      if (byHour.length > 0) narrowed = byHour;
    }
    if (narrowed.length === 1) {
      return {
        status: 'matched',
        dose: narrowed[0],
        normalizedTranscript: normalized,
        confidenceReason: `Matched "${narrowed[0].medication.name}" by medication name and schedule time.`,
      };
    }
    return {
      status: 'ambiguous',
      candidates: narrowed,
      normalizedTranscript: normalized,
      reason: `You have ${narrowed.length} scheduled doses of ${narrowed[0].medication.name} remaining today. Tap the specific time below before confirming.`,
    };
  }

  // 2. Time slot match (e.g. "I took my morning medicine")
  if (spokenSlot) {
    let slotMatches = actionable.filter((inst) => inst.timeSlot === spokenSlot);
    if (spokenHour !== null && slotMatches.length > 1) {
      const byHour = slotMatches.filter(
        (inst) => getDoseHour24(inst.scheduledTime) === spokenHour,
      );
      if (byHour.length > 0) slotMatches = byHour;
    }

    if (slotMatches.length === 1) {
      return {
        status: 'matched',
        dose: slotMatches[0],
        normalizedTranscript: normalized,
        confidenceReason: `Only one ${spokenSlot} dose remained pending.`,
      };
    }

    if (slotMatches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: slotMatches,
        normalizedTranscript: normalized,
        reason: `You have ${slotMatches.length} ${spokenSlot} doses remaining today. Tap the exact medication below to confirm.`,
      };
    }

    return {
      status: 'no_match',
      normalizedTranscript: normalized,
      reason: `No remaining ${spokenSlot} doses need confirmation right now.`,
    };
  }

  // 3. Explicit spoken hour match without slot keyword (e.g. "I took my 8 AM pill")
  if (spokenHour !== null) {
    const hourMatches = actionable.filter(
      (inst) => getDoseHour24(inst.scheduledTime) === spokenHour,
    );
    if (hourMatches.length === 1) {
      return {
        status: 'matched',
        dose: hourMatches[0],
        normalizedTranscript: normalized,
        confidenceReason: `Matched the single remaining dose scheduled in that hour.`,
      };
    }
    if (hourMatches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: hourMatches,
        normalizedTranscript: normalized,
        reason: `Multiple doses are scheduled around that time. Please tap which one you took.`,
      };
    }
    return {
      status: 'no_match',
      normalizedTranscript: normalized,
      reason: `No remaining dose matched that scheduled time.`,
    };
  }

  // 4. Generic intake phrase ("I have taken my medicine.")
  if (GENERIC_MED_NOUN_PATTERN.test(normalized)) {
    if (actionable.length === 1) {
      return {
        status: 'matched',
        dose: actionable[0],
        normalizedTranscript: normalized,
        confidenceReason: `Only one dose remains unconfirmed today.`,
      };
    }
    return {
      status: 'ambiguous',
      candidates: actionable,
      normalizedTranscript: normalized,
      reason: `You have ${actionable.length} remaining doses today. Tap the exact medicine below or name it aloud (for example, “I took my ${actionable[0].medication.name}”).`,
    };
  }

  return {
    status: 'no_match',
    normalizedTranscript: normalized,
    reason:
      'Could not unambiguously match a medication. Try naming the medicine or time of day, or tap Confirm below.',
  };
}
