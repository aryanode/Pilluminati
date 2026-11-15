import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
  X,
} from 'lucide-react';
import type { ScheduledDoseInstance } from '../types/pilluminati';
import {
  formatFoodInstructionLabel,
  formatTime12Hour,
} from '../utils/adherence';
import {
  getSpeechRecognitionConstructor,
  isDoseActionableForVoice,
  mapSpeechRecognitionError,
  matchVoicePhraseToDose,
  type SpeechRecognitionInstance,
  type VoiceMatchResult,
} from '../utils/voiceLogging';
import { Button, Card } from './ui/Primitives';

interface GrandmasVoicePanelProps {
  scheduledDosesToday: ScheduledDoseInstance[];
  emailVerified: boolean;
  onConfirmDose: (dose: ScheduledDoseInstance) => Promise<void>;
  onJumpToOneTap: () => void;
}

export function GrandmasVoicePanel({
  scheduledDosesToday,
  emailVerified,
  onConfirmDose,
  onJumpToOneTap,
}: GrandmasVoicePanelProps) {
  const speechSupported = useMemo(() => getSpeechRecognitionConstructor() !== null, []);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const latestDosesRef = useRef<ScheduledDoseInstance[]>(scheduledDosesToday);
  latestDosesRef.current = scheduledDosesToday;

  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [matchResult, setMatchResult] = useState<VoiceMatchResult | null>(null);
  const [pendingConfirmationDose, setPendingConfirmationDose] =
    useState<ScheduledDoseInstance | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);

  const actionableDoses = useMemo(
    () => scheduledDosesToday.filter(isDoseActionableForVoice),
    [scheduledDosesToday],
  );
  const nextActionableDose = actionableDoses[0] ?? null;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const resetVoiceState = () => {
    setInterimText('');
    setFinalTranscript('');
    setMatchResult(null);
    setPendingConfirmationDose(null);
    setSpeechError(null);
    setConfirmedMessage(null);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    setListening(false);
  };

  const startListening = () => {
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setSpeechError(
        'Voice input is not supported in this browser. Please use one-tap confirmation below.',
      );
      return;
    }

    resetVoiceState();

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        let collectedInterim = '';
        let collectedFinal = '';

        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? '';
          if (result.isFinal) {
            collectedFinal += `${text} `;
          } else {
            collectedInterim += `${text} `;
          }
        }

        if (collectedInterim.trim()) {
          setInterimText(collectedInterim.trim());
        }

        const trimmedFinal = collectedFinal.trim();
        if (trimmedFinal) {
          setInterimText('');
          setFinalTranscript(trimmedFinal);
          const evaluated = matchVoicePhraseToDose(
            trimmedFinal,
            latestDosesRef.current,
          );
          setMatchResult(evaluated);
          if (evaluated.status === 'matched') {
            setPendingConfirmationDose(evaluated.dose);
          } else {
            setPendingConfirmationDose(null);
          }
        }
      };

      recognition.onerror = (event) => {
        setListening(false);
        setSpeechError(mapSpeechRecognitionError(event.error));
      };

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setSpeechError(
        'Voice input could not start on this device. Please use one-tap confirmation below.',
      );
    }
  };

  const handleConfirmPendingDose = async () => {
    if (!pendingConfirmationDose || confirming || !emailVerified) return;
    setConfirming(true);
    try {
      const target = pendingConfirmationDose;
      await onConfirmDose(target);
      setPendingConfirmationDose(null);
      setMatchResult(null);
      setConfirmedMessage(
        `Confirmed: ${target.medication.name} (${target.medication.dosage} · ${formatTime12Hour(target.scheduledTime)}) marked as taken.`,
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card
      tone="white"
      className="p-6 sm:p-7 space-y-5 border-[#CBE4D8]"
      data-testid="grandmas-voice-panel"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1A7A68]">
            <Volume2 className="h-4.5 w-4.5 shrink-0" />
            <span>Grandma’s Voice · Guided Dose Check-In</span>
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-bold text-[#10373A]">
            Confirm by Voice or One Tap
          </h3>
          <p className="text-base text-[#2C5E63] leading-relaxed">
            {speechSupported
              ? 'Say a simple phrase like “I took my morning medicine” or “I have taken my medicine.” Pilluminati always asks you to confirm before saving.'
              : 'Voice recognition is not supported in this browser. You can confirm any dose safely with one tap below.'}
          </p>
        </div>

        {speechSupported ? (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              size="lg"
              variant={listening ? 'danger' : 'primary'}
              disabled={!emailVerified || actionableDoses.length === 0}
              onClick={listening ? stopListening : startListening}
              data-testid="voice-mic-toggle-btn"
              className="min-w-[220px]"
            >
              {listening ? (
                <>
                  <MicOff className="h-5 w-5" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5" />
                  {actionableDoses.length === 0
                    ? 'All Doses Handled'
                    : 'Speak to Log Dose'}
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              size="lg"
              variant="secondary"
              onClick={onJumpToOneTap}
              data-testid="voice-fallback-onetap-btn"
            >
              <ArrowDown className="h-5 w-5" />
              Use One-Tap Confirmation
            </Button>
          </div>
        )}
      </div>

      {/* Clear Unsupported Browser Fallback Banner */}
      {!speechSupported && (
        <div
          className="rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          data-testid="voice-unsupported-fallback"
        >
          <div className="space-y-1">
            <p className="text-base font-semibold text-[#10373A]">
              Voice input unavailable in this browser
            </p>
            <p className="text-sm text-[#4B7478] leading-relaxed">
              {nextActionableDose
                ? `Next dose ready for one-tap confirmation: ${nextActionableDose.medication.name} (${nextActionableDose.medication.dosage}) at ${formatTime12Hour(nextActionableDose.scheduledTime)}.`
                : 'All scheduled doses for today are handled—scroll down to review or adjust any status in one tap.'}
            </p>
          </div>
          {nextActionableDose && (
            <Button
              size="lg"
              disabled={!emailVerified || confirming}
              onClick={() => setPendingConfirmationDose(nextActionableDose)}
              className="shrink-0"
              data-testid="voice-fallback-quick-confirm-btn"
            >
              <Check className="h-5 w-5" />
              One-Tap: {nextActionableDose.medication.name}
            </Button>
          )}
        </div>
      )}

      {/* Active Listening Status */}
      {listening && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-4 sm:p-5 space-y-1.5"
        >
          <p className="text-base font-bold text-[#116B4B]">
            Listening now… Speak clearly when ready.
          </p>
          <p className="text-sm text-[#2C5E63]">
            {interimText
              ? `Hearing: “${interimText}”`
              : 'Example phrases: “I took my morning medicine” · “I have taken my medicine”'}
          </p>
        </div>
      )}

      {/* Recognized Transcript Preview */}
      {finalTranscript && !listening && (
        <div className="rounded-xl border border-[#E2E6E4] bg-[#FAF9F6] px-4 py-3 text-base text-[#10373A]">
          <span className="font-semibold text-[#4B7478]">You said: </span>
          <span>“{finalTranscript}”</span>
        </div>
      )}

      {/* Speech Error / Microphone Blocked Fallback */}
      {speechError && (
        <div
          role="alert"
          className="rounded-xl border border-[#EED29F] bg-[#FFFBF2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <p className="text-sm sm:text-base text-[#6B4200] leading-relaxed">
            {speechError}
          </p>
          <Button
            size="md"
            variant="secondary"
            onClick={onJumpToOneTap}
            className="shrink-0"
          >
            <ArrowDown className="h-4 w-4" />
            Go to One-Tap List
          </Button>
        </div>
      )}

      {/* Mandatory Confirmation Step Before Writing Any Dose Log */}
      {pendingConfirmationDose && (
        <div
          role="region"
          aria-label="Confirm spoken medication dose"
          data-testid="voice-confirm-prompt"
          className="rounded-2xl border-2 border-[#1A7A68] bg-[#F1F8F5] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5"
        >
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#116B4B]">
              Please Confirm Before Saving
            </p>
            <h4 className="font-display text-xl sm:text-2xl font-bold text-[#10373A]">
              Mark {pendingConfirmationDose.medication.name} (
              {pendingConfirmationDose.medication.dosage}) as Taken?
            </h4>
            <p className="text-base text-[#2C5E63] tabular-nums">
              Scheduled for {formatTime12Hour(pendingConfirmationDose.scheduledTime)} ·{' '}
              {formatFoodInstructionLabel(
                pendingConfirmationDose.medication.foodInstruction,
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              size="lg"
              variant="secondary"
              disabled={confirming}
              onClick={() => setPendingConfirmationDose(null)}
            >
              <X className="h-5 w-5" />
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={!emailVerified || confirming}
              onClick={handleConfirmPendingDose}
              data-testid="voice-confirm-submit-btn"
            >
              <Check className="h-5 w-5" />
              {confirming ? 'Saving Dose...' : 'Yes, Confirm Dose'}
            </Button>
          </div>
        </div>
      )}

      {/* Ambiguous Match Clarification (Never guesses!) */}
      {matchResult?.status === 'ambiguous' && !pendingConfirmationDose && (
        <div
          className="rounded-2xl border border-[#DDD4F2] bg-[#F5F2FB] p-5 space-y-4"
          data-testid="voice-ambiguous-prompt"
        >
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#4A397C]">
              Which medication did you take?
            </p>
            <p className="text-base text-[#2C5E63] leading-relaxed">
              {matchResult.reason}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {matchResult.candidates.map((cand) => (
              <Button
                key={cand.doseKey}
                size="lg"
                variant="secondary"
                disabled={!emailVerified}
                onClick={() => setPendingConfirmationDose(cand)}
              >
                {cand.medication.name} · {cand.medication.dosage} (
                {formatTime12Hour(cand.scheduledTime)})
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Non-matching / Negative Intent / Already Handled Guidance */}
      {matchResult &&
        matchResult.status !== 'matched' &&
        matchResult.status !== 'ambiguous' &&
        !pendingConfirmationDose && (
          <div className="rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-base text-[#2C5E63] leading-relaxed">
              {matchResult.reason}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {speechSupported && (
                <Button size="md" variant="ghost" onClick={startListening}>
                  <RotateCcw className="h-4 w-4" />
                  Try Again
                </Button>
              )}
              <Button size="md" variant="secondary" onClick={onJumpToOneTap}>
                Use One-Tap List
              </Button>
            </div>
          </div>
        )}

      {/* Saved Confirmation Toast */}
      {confirmedMessage && (
        <div
          role="status"
          className="rounded-xl border border-[#CBE4D8] bg-[#E2F1EA] px-4 py-3.5 flex items-center gap-2.5 text-base font-semibold text-[#116B4B]"
          data-testid="voice-saved-banner"
        >
          <Check className="h-5 w-5 shrink-0" />
          <span>{confirmedMessage}</span>
        </div>
      )}
    </Card>
  );
}
