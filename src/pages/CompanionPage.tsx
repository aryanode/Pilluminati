import React, { useEffect, useState } from 'react';
import { Send, ShieldAlert, Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { PilluMascot } from '../components/PilluMascot';
import { Button, Card, ErrorBanner, Skeleton } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import {
  apiCompanionChat,
  apiGenerateCareSummary,
  apiGetAiStatus,
} from '../services/backendApi';
import type { CompanionMessage, PilluMoodState } from '../types/pilluminati';
import { cn } from '../utils/cn';

const QUICK_PROMPTS = [
  'What are today’s remaining medications?',
  'Prepare a short visit summary for my upcoming appointment',
  'How can our family coordinate evening doses better?',
];

export function CompanionPage() {
  const {
    activePatientProfile,
    companionMessages,
    settings,
    emailVerified,
    firebaseUser,
  } = useCare();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [transientMessages, setTransientMessages] = useState<CompanionMessage[]>(
    [],
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiBlockedReason, setAiBlockedReason] = useState<string | null>(null);
  const [pilluState, setPilluState] = useState<PilluMoodState>('idle');

  useEffect(() => {
    let active = true;
    if (!firebaseUser) return;
    apiGetAiStatus()
      .then((status) => {
        if (!active) return;
        if (!status.configured) {
          setAiBlockedReason(
            status.reason ||
              'GEMINI_API_KEY is not configured in server environment Secrets.',
          );
        } else {
          setAiBlockedReason(null);
        }
      })
      .catch(() => {
        // Real errors surface clearly on message or summary submission.
      });
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const visibleMessages = emailVerified
    ? companionMessages
    : [...companionMessages, ...transientMessages];

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading || !activePatientProfile) return;

    setErrorMsg(null);
    const historyPayload = visibleMessages.slice(-6).map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('model' as const),
      text: m.text,
    }));

    setInput('');
    setLoading(true);
    setPilluState('listening');

    try {
      const data = await apiCompanionChat({
        profileId: activePatientProfile.id,
        message: trimmed,
        history: historyPayload,
      });

      if (!emailVerified) {
        const nowLabel = new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        setTransientMessages((prev) => [
          ...prev,
          {
            id: `local-u-${Date.now()}`,
            sender: 'user',
            text: trimmed,
            timestamp: nowLabel,
          },
          {
            id: `local-p-${Date.now() + 1}`,
            sender: 'pillu',
            text: data.reply,
            timestamp: nowLabel,
          },
        ]);
      }

      setPilluState('happy');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach Pillu AI companion.';
      setErrorMsg(msg);
      setPilluState('concerned');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!activePatientProfile || summaryLoading) return;
    setErrorMsg(null);
    setSummaryLoading(true);
    setPilluState('listening');
    try {
      const data = await apiGenerateCareSummary(activePatientProfile.id);
      setSummaryText(data.summary);
      setPilluState('happy');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to generate care circle summary.',
      );
      setPilluState('concerned');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <AppShell
      title="Pillu AI Companion"
      subtitle="Server-verified Gemini care guidance grounded in live Firestore permissions and persisted per conversation."
      primaryAction={
        <Button
          size="sm"
          variant="secondary"
          disabled={summaryLoading || !activePatientProfile || Boolean(aiBlockedReason)}
          onClick={handleGenerateSummary}
        >
          <Sparkles className="h-4 w-4" />
          {summaryLoading ? 'Summarizing...' : 'Generate Daily Care Summary'}
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 space-y-5">
          <Card tone="mint" className="p-6">
            <PilluMascot
              state={pilluState}
              size="md"
              animationConfig={{ reducedMotion: settings.reducedMotion }}
              showStateControls
              onStateChange={setPilluState}
            />
          </Card>

          <Card tone="white" className="p-5 space-y-3">
            <p className="text-xs font-semibold text-[#4B7478]">Quick Questions</p>
            <div className="flex flex-col gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={loading || Boolean(aiBlockedReason)}
                  className="w-full rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] px-4 py-3 text-left text-sm font-medium text-[#10373A] hover:bg-[#EBF6F1] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#4B7478] pt-2 border-t border-[#EBF0EE]">
              Context is loaded server-side directly from Firestore using your
              verified role. Pillu does not diagnose, prescribe, change dosages,
              or override your doctor.
            </p>
          </Card>

          {summaryText && (
            <Card tone="lavender" className="p-5 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[#5D4A96]">
                Live Care Circle Summary
              </p>
              <p className="text-sm leading-relaxed text-[#10373A] whitespace-pre-line">
                {summaryText}
              </p>
            </Card>
          )}
        </div>

        <Card tone="white" className="lg:col-span-8 flex flex-col min-h-[540px]">
          <div
            className="border-b border-[#DCE5E2] bg-[#FAF9F6] px-6 py-3.5 rounded-t-2xl flex items-start gap-3"
            data-testid="companion-medical-disclaimer"
          >
            <ShieldAlert className="h-5 w-5 text-[#5D4A96] shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm leading-relaxed text-[#2C5E63]">
              <strong className="text-[#10373A]">Medical Disclaimer:</strong>{' '}
              Pillu provides general medication-management and wellness support only.
              It never diagnoses conditions, prescribes treatments, changes medication
              dosages, or overrides your doctor or pharmacist.
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {aiBlockedReason && (
              <ErrorBanner
                title="Gemini AI Configuration Blocked"
                message={aiBlockedReason}
              />
            )}

            {errorMsg && (
              <ErrorBanner
                title="AI Companion Notice"
                message={errorMsg}
                onDismiss={() => setErrorMsg(null)}
              />
            )}

            {visibleMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col max-w-[85%] rounded-2xl px-5 py-3.5',
                  msg.sender === 'user'
                    ? 'ml-auto bg-[#10373A] text-white'
                    : 'mr-auto bg-[#F1F8F5] text-[#10373A] border border-[#CBE4D8]',
                )}
              >
                <p className="text-xs font-semibold opacity-75 mb-1">
                  {msg.sender === 'user' ? 'You' : 'Pillu'} · {msg.timestamp}
                </p>
                <p className="text-base leading-relaxed whitespace-pre-line">
                  {msg.text}
                </p>
              </div>
            ))}

            {loading && (
              <div className="mr-auto max-w-[75%] space-y-2 rounded-2xl bg-[#F1F8F5] p-4 border border-[#CBE4D8]">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-[#DCE5E2] bg-[#FAF9F6] p-4 flex items-center gap-3 rounded-b-2xl"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Pillu about medications, appointments, or care notes..."
              aria-label="Message for Pillu"
              className="min-h-[48px] flex-1 rounded-xl border border-[#C9D8D4] bg-white px-4 text-base text-[#10373A] placeholder:text-[#6B8A8D]"
            />
            <Button type="submit" size="md" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
