import type { ParsedVoiceNudge } from '../lib/voiceCommands';

type VoiceNudgeButtonProps = {
  disabled?: boolean;
  isListening?: boolean;
  supported?: boolean;
  compact?: boolean;
  statusMessage?: string | null;
  interimTranscript?: string;
  speechError?: string | null;
  lastCommand?: ParsedVoiceNudge | null;
  onToggle?: () => void;
};

export default function VoiceNudgeButton({
  disabled = false,
  isListening = false,
  supported = true,
  compact = false,
  statusMessage,
  interimTranscript,
  speechError,
  lastCommand,
  onToggle,
}: VoiceNudgeButtonProps) {
  if (!supported) return null;

  const title = isListening
    ? 'Stop listening'
    : 'Voice nudge — say a directive like “introduce a twist”';

  const buttonClass = compact
    ? `scene-header-btn ${isListening ? 'scene-header-btn--active' : ''}`
    : `border border-ink font-label text-[10px] uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 px-2 py-1 ${
        isListening
          ? 'animate-pulse bg-accent text-paper'
          : 'bg-paper hover:bg-surface'
      }`;

  const buttonLabel = compact
    ? isListening
      ? 'Stop'
      : 'Nudge'
    : isListening
      ? '● Listening'
      : '🎤 Voice';

  return (
    <div className={compact ? 'flex items-center gap-1' : 'flex flex-col gap-1'}>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={buttonClass}
        title={title}
        aria-label={title}
        aria-pressed={isListening}
      >
        {buttonLabel}
      </button>

      {!compact && (isListening || statusMessage || speechError) && (
        <p
          className={`font-label text-[9px] leading-snug ${
            speechError ? 'text-accent' : 'text-ink/55'
          }`}
        >
          {speechError ??
            (isListening
              ? interimTranscript
                ? `"${interimTranscript}"`
                : 'Say a nudge…'
              : statusMessage ??
                (lastCommand?.matchedPreset
                  ? `Applied: ${lastCommand.matchedPreset.label}`
                  : lastCommand
                    ? 'Queued for next scene'
                    : null))}
        </p>
      )}
    </div>
  );
}
