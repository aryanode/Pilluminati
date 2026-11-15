import type { PilluMascotProps, PilluMoodState } from '../types/pilluminati';
import { cn } from '../utils/cn';

type CanonicalPilluMood =
  | 'idle'
  | 'happy'
  | 'celebrating'
  | 'sleepy'
  | 'concerned'
  | 'encouraging'
  | 'caring'
  | 'listening';

export function normalizePilluMood(state: PilluMoodState): CanonicalPilluMood {
  if (state === 'sleeping') return 'sleepy';
  if (state === 'reminding') return 'encouraging';
  return state;
}

export const PILLU_STATE_META: Record<
  CanonicalPilluMood,
  {
    label: string;
    defaultMessage: string;
    auraFill: string;
    badgeColor: string;
  }
> = {
  idle: {
    label: 'Calm & Ready',
    defaultMessage:
      'Everything looks steady today. I am right here whenever you need a hand.',
    auraFill: '#D4EFE3',
    badgeColor: '#1A7A68',
  },
  happy: {
    label: 'Happy',
    defaultMessage:
      'Nicely done! Your dose is confirmed and your care circle is in sync.',
    auraFill: '#BEE9D6',
    badgeColor: '#1A7A68',
  },
  celebrating: {
    label: 'All Daily Meds Complete',
    defaultMessage:
      'Hooray! Every scheduled medication for today has been completed.',
    auraFill: '#B6E6D1',
    badgeColor: '#116B4B',
  },
  sleepy: {
    label: 'Quiet Hours',
    defaultMessage:
      'Resting peacefully during quiet hours until your next scheduled window.',
    auraFill: '#E6E0F5',
    badgeColor: '#5D4A96',
  },
  concerned: {
    label: 'Gentle Check-In',
    defaultMessage:
      'A scheduled dose is still unconfirmed. Did you happen to take it earlier?',
    auraFill: '#F6E7D4',
    badgeColor: '#8B5200',
  },
  encouraging: {
    label: 'Upcoming Dose',
    defaultMessage:
      'Your next medication window is coming up soon—tap confirm whenever you are ready.',
    auraFill: '#E4DCF6',
    badgeColor: '#5D4A96',
  },
  caring: {
    label: 'Warm Support',
    defaultMessage:
      'Take it easy today. Your care circle has been gently alerted so someone can check in.',
    auraFill: '#F7E1EA',
    badgeColor: '#8B3E61',
  },
  listening: {
    label: 'Listening',
    defaultMessage:
      'I am right here—ask me about today’s doses, appointments, or care notes.',
    auraFill: '#E4DCF6',
    badgeColor: '#5D4A96',
  },
};

const CONTROL_STATES: CanonicalPilluMood[] = [
  'idle',
  'happy',
  'celebrating',
  'sleepy',
  'concerned',
  'encouraging',
  'caring',
];

export function PilluMascot({
  state,
  size = 'md',
  message,
  subMessage,
  bounceOnHappy = false,
  onInteract,
  showStateControls = false,
  onStateChange,
  animationConfig,
  className,
}: PilluMascotProps) {
  const mood = normalizePilluMood(state);
  const meta = PILLU_STATE_META[mood];
  const displayMessage = message ?? meta.defaultMessage;
  const reduced = animationConfig?.reducedMotion ?? false;

  const dimensions = {
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-32',
  }[size];

  const animationClass = reduced
    ? 'pillu-reduced-motion'
    : mood === 'celebrating'
      ? 'pillu-anim-celebrate'
      : mood === 'happy' || bounceOnHappy
        ? 'pillu-anim-bounce'
        : mood === 'sleepy'
          ? 'pillu-anim-sleepy'
          : 'pillu-anim-float';

  const isJoyful = mood === 'happy' || mood === 'celebrating';
  const isSleepy = mood === 'sleepy';
  const isConcerned = mood === 'concerned';
  const isCaring = mood === 'caring';
  const isEncouraging = mood === 'encouraging';
  const isListening = mood === 'listening';

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      data-testid="pillu-mascot"
      data-pillu-state={state}
      data-pillu-mood={mood}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onInteract}
          aria-label={`Pillu care companion — currently ${meta.label}`}
          className={cn(
            'relative shrink-0 rounded-2xl p-1 transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-[#5D4A96]',
            onInteract ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default',
          )}
        >
          <svg
            viewBox="0 0 128 132"
            className={cn(dimensions, animationClass)}
            role="img"
            aria-hidden="true"
          >
            <defs>
              {/* Mint-to-lavender gentle creature gradient */}
              <linearGradient id="pilluBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#D7F1E5" />
                <stop offset="56%" stopColor="#DCF0EA" />
                <stop offset="100%" stopColor="#E6DDF7" />
              </linearGradient>
              <linearGradient id="pilluBellyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FCFDFC" />
                <stop offset="100%" stopColor="#F2F8F5" />
              </linearGradient>
              <linearGradient id="pilluLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8EDBBE" />
                <stop offset="100%" stopColor="#52B592" />
              </linearGradient>
            </defs>

            {/* Soft mood aura */}
            <circle cx="64" cy="70" r="54" fill={meta.auraFill} fillOpacity="0.58" />

            {/* Subtle ground shadow */}
            <ellipse
              cx="64"
              cy="118"
              rx={isJoyful ? '26' : '30'}
              ry="5"
              fill="#10373A"
              fillOpacity="0.1"
            />

            {/* Celebration sparkles */}
            {mood === 'celebrating' && (
              <g className={reduced ? undefined : 'pillu-sparkle'}>
                <path
                  d="M22 42 L24 36 L26 42 L32 44 L26 46 L24 52 L22 46 L16 44 Z"
                  fill="#5D4A96"
                  fillOpacity="0.72"
                />
                <path
                  d="M104 38 L105.8 33 L107.6 38 L112.5 39.8 L107.6 41.6 L105.8 46.5 L104 41.6 L99 39.8 Z"
                  fill="#1A7A68"
                  fillOpacity="0.82"
                />
                <circle cx="30" cy="24" r="3" fill="#F29DB3" />
                <circle cx="98" cy="24" r="2.8" fill="#7EC1A8" />
              </g>
            )}

            {/* Sleepy gentle Zzz */}
            {isSleepy && (
              <g fill="#5D4A96" fillOpacity="0.78" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700">
                <text x="92" y="38" fontSize="11">z</text>
                <text x="101" y="29" fontSize="14">z</text>
              </g>
            )}

            {/* Curled leaf tuft on top of head */}
            <g
              className={reduced ? undefined : 'pillu-leaf'}
              transform={
                isSleepy
                  ? 'translate(0, 3) rotate(-10 64 34)'
                  : isEncouraging
                    ? 'rotate(6 64 34)'
                    : undefined
              }
            >
              {/* Sprout stem */}
              <path
                d="M64 34 C64 25 65 18 71 15"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              {/* Curled mint leaf */}
              <path
                d="M65 23 C54 19 48 11 55 7 C62 4 71 11 67 21 Z"
                fill="url(#pilluLeafGrad)"
                stroke="#10373A"
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
              {/* Secondary smaller curled sprout tip */}
              <path
                d="M67 20 C73 12 83 11 84 17 C85 22 76 26 68 22 Z"
                fill="#A7E6CE"
                stroke="#10373A"
                strokeWidth="2.1"
                strokeLinejoin="round"
              />
            </g>

            {/* Tiny feet */}
            <g>
              <ellipse
                cx={isJoyful ? '48' : '49'}
                cy={mood === 'celebrating' ? '111' : '113'}
                rx="9.5"
                ry="6"
                transform={mood === 'celebrating' ? 'rotate(-14 48 111)' : undefined}
                fill="#DDD2F5"
                stroke="#10373A"
                strokeWidth="2.6"
              />
              <ellipse
                cx={isJoyful ? '80' : '79'}
                cy={mood === 'celebrating' ? '111' : '113'}
                rx="9.5"
                ry="6"
                transform={mood === 'celebrating' ? 'rotate(14 80 111)' : undefined}
                fill="#DDD2F5"
                stroke="#10373A"
                strokeWidth="2.6"
              />
            </g>

            {/* Left tiny arm (state-expressive) */}
            {mood === 'celebrating' || mood === 'happy' ? (
              <path
                d="M31 73 C18 65 17 51 25 48 C30 46 33 54 34 64"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : isEncouraging ? (
              <path
                d="M31 74 C21 67 20 56 26 53 C31 51 34 58 34 67"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : isCaring || isConcerned ? (
              <path
                d="M31 73 C25 79 29 89 39 87 C44 86 44 79 37 74"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M31 74 C22 79 22 90 29 91 C34 91 36 84 35 78"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            )}

            {/* Right tiny arm (state-expressive) */}
            {mood === 'celebrating' || mood === 'happy' ? (
              <path
                d="M97 73 C110 65 111 51 103 48 C98 46 95 54 94 64"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : isCaring || isConcerned ? (
              <path
                d="M97 73 C103 79 99 89 89 87 C84 86 84 79 91 74"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M97 74 C106 79 106 90 99 91 C94 91 92 84 93 78"
                fill="#D4EFE3"
                stroke="#10373A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            )}

            {/* Main mint & lavender creature body */}
            <path
              d="M64 32 C85 32 99 47 99 71 C99 96 86 111 64 111 C42 111 29 96 29 71 C29 47 43 32 64 32 Z"
              fill="url(#pilluBodyGrad)"
              stroke="#10373A"
              strokeWidth="2.8"
            />

            {/* Pale belly patch */}
            <ellipse
              cx="64"
              cy="87"
              rx="22"
              ry="18"
              fill="url(#pilluBellyGrad)"
              stroke="#C5DFD5"
              strokeWidth="1.5"
            />

            {/* Warm caring heart badge on pale belly when feeling unwell / caring */}
            {isCaring && (
              <path
                d="M64 94 C64 94 55 88 55 82.5 C55 79.4 57.5 77 60.4 77 C62.2 77 63.4 78 64 79.2 C64.6 78 65.8 77 67.6 77 C70.5 77 73 79.4 73 82.5 C73 88 64 94 64 94 Z"
                fill="#F28AA4"
                stroke="#10373A"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            )}

            {/* Rosy pink cheeks */}
            <ellipse
              cx="41.5"
              cy="64.5"
              rx="5.4"
              ry="3.4"
              fill="#F6A3B8"
              fillOpacity="0.82"
            />
            <ellipse
              cx="86.5"
              cy="64.5"
              rx="5.4"
              ry="3.4"
              fill="#F6A3B8"
              fillOpacity="0.82"
            />

            {/* Large dark teal eyes */}
            {isSleepy ? (
              <g>
                <path
                  d="M42 56 Q48 61 54 56"
                  fill="none"
                  stroke="#10373A"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                <path
                  d="M74 56 Q80 61 86 56"
                  fill="none"
                  stroke="#10373A"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
              </g>
            ) : mood === 'celebrating' ? (
              <g>
                {/* Joyful curved celebrating eyes with tiny sparkle dots */}
                <path
                  d="M41.5 58 Q48 49 54.5 58"
                  fill="none"
                  stroke="#10373A"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <path
                  d="M73.5 58 Q80 49 86.5 58"
                  fill="none"
                  stroke="#10373A"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <circle cx="48" cy="50" r="1.4" fill="#10373A" fillOpacity="0.4" />
                <circle cx="80" cy="50" r="1.4" fill="#10373A" fillOpacity="0.4" />
              </g>
            ) : (
              <g>
                {/* Large dark teal eyes */}
                <ellipse cx="48" cy="55.5" rx="6.2" ry="7.2" fill="#10373A" />
                <ellipse cx="80" cy="55.5" rx="6.2" ry="7.2" fill="#10373A" />
                {/* Crisp warm eye catchlights */}
                <circle cx="49.8" cy="53" r="2.2" fill="#FFFFFF" />
                <circle cx="81.8" cy="53" r="2.2" fill="#FFFFFF" />
                <circle cx="46.2" cy="58.2" r="1" fill="#FFFFFF" fillOpacity="0.85" />
                <circle cx="78.2" cy="58.2" r="1" fill="#FFFFFF" fillOpacity="0.85" />

                {/* Joyful lower-cheek lift in happy state */}
                {mood === 'happy' && (
                  <>
                    <path
                      d="M42.5 62.2 Q48 59.5 53.5 62.2"
                      fill="none"
                      stroke="#D7F1E5"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M74.5 62.2 Q80 59.5 85.5 62.2"
                      fill="none"
                      stroke="#D7F1E5"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Gentle sympathetic brow tilt in concerned / caring (soft upward inner-brows, never furrowed or angry) */}
                {(isConcerned || isCaring) && (
                  <>
                    <path
                      d="M42 46.5 Q47 44.5 52 43.5"
                      fill="none"
                      stroke="#10373A"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M76 43.5 Q81 44.5 86 46.5"
                      fill="none"
                      stroke="#10373A"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Curious perked brow on encouraging */}
                {isEncouraging && (
                  <path
                    d="M75 45.5 Q80 42.5 85.5 45"
                    fill="none"
                    stroke="#10373A"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </g>
            )}

            {/* Gentle Mouth Expression (always warm, never angry or sick) */}
            {isConcerned ? (
              <path
                d="M58 66.5 Q64 64.5 70 66.5"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            ) : isCaring ? (
              <path
                d="M57.5 65.5 Q64 68.5 70.5 65.5"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            ) : isListening ? (
              <ellipse cx="64" cy="65.5" rx="3.4" ry="2.8" fill="#5D4A96" />
            ) : isSleepy ? (
              <path
                d="M59 65 Q64 67.5 69 65"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            ) : isJoyful ? (
              <path
                d="M56 64.5 Q64 72 72 64.5"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M57 64.5 Q64 69.5 71 64.5"
                fill="none"
                stroke="#10373A"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold tracking-wide"
            style={{ color: meta.badgeColor }}
          >
            Pillu Companion · {meta.label}
          </p>
          <p className="mt-1 text-base font-medium leading-relaxed text-[#10373A]">
            {displayMessage}
          </p>
          {subMessage && (
            <p className="mt-1 text-sm text-[#4B7478]">{subMessage}</p>
          )}
        </div>
      </div>

      {showStateControls && onStateChange && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E2ECE8]">
          <span className="text-xs font-medium text-[#4B7478] mr-1">
            Pillu Mood:
          </span>
          {CONTROL_STATES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStateChange(s)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0',
                mood === s
                  ? 'bg-[#10373A] text-white'
                  : 'bg-[#F1F8F5] text-[#2C5E63] hover:bg-[#E2F1EA]',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
