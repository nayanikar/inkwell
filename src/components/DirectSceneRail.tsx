import { useState } from 'react';
import { getNudgePresets } from '../lib/nudgePresets';
import VoiceNudgeButton from './VoiceNudgeButton';
import type { useVoiceNudge } from '../hooks/useVoiceNudge';
import type { NudgeOutcome } from '../hooks/useInkwellSession';
import type { PendingNudgeRow } from '../lib/hooks';

type VoiceNudgeControl = ReturnType<typeof useVoiceNudge>;

type DirectSceneRailProps = {
  genre?: string;
  onNudge?: (type: string, content: string) => void;
  onSubmitNudge?: (type: string, content: string) => void;
  onNextScene?: () => void;
  disabled?: boolean;
  isLastScene?: boolean;
  isGenerating?: boolean;
  viewingHistory?: boolean;
  nudgeActorName?: string | null;
  nudgeActorIsSelf?: boolean;
  pendingNudge?: PendingNudgeRow | null;
  nudgeOutcome?: NudgeOutcome;
  nudgeStatusMessage?: string | null;
  coDirectHint?: boolean;
  voiceNudge: VoiceNudgeControl;
  onForkAtScene?: () => void;
  canForkAtScene?: boolean;
  forkDisabled?: boolean;
  hasForkablePastScenes?: boolean;
};

export default function DirectSceneRail({
  genre = 'noir',
  onNudge,
  onSubmitNudge,
  onNextScene,
  disabled = false,
  isLastScene = false,
  isGenerating = false,
  viewingHistory = false,
  nudgeActorName = null,
  nudgeActorIsSelf = false,
  pendingNudge = null,
  nudgeOutcome = 'idle',
  nudgeStatusMessage = null,
  coDirectHint = false,
  voiceNudge,
  onForkAtScene,
  canForkAtScene = false,
  forkDisabled = false,
  hasForkablePastScenes = false,
}: DirectSceneRailProps) {
  const presets = getNudgePresets(genre);
  const [nudgeText, setNudgeText] = useState('');
  const voice = voiceNudge;

  const submitCustomNudge = () => {
    const content = nudgeText.trim();
    if (content && !disabled) {
      onSubmitNudge?.('custom', content);
      setNudgeText('');
    }
  };

  const footerMessage = (() => {
    if (nudgeStatusMessage) return nudgeStatusMessage;
    if (voice.statusMessage && !isGenerating) return voice.statusMessage;
    if (isGenerating) {
      if (nudgeActorName) {
        return nudgeActorIsSelf
          ? 'You are nudging…'
          : `${nudgeActorName} is nudging…`;
      }
      return 'Generating…';
    }
    if (nudgeOutcome === 'submitted' || pendingNudge?.isSelf) {
      return 'Your nudge is queued for the next scene';
    }
    if (pendingNudge && !pendingNudge.isSelf) {
      return `${pendingNudge.submittedByName} has a nudge queued`;
    }
    if (nudgeOutcome === 'lost') {
      return 'Another director advanced first';
    }
    if (viewingHistory && canForkAtScene && onForkAtScene) {
      return 'Fork from here to continue the story';
    }
    if (viewingHistory) {
      return 'Past scene — open an earlier act to fork';
    }
    if (hasForkablePastScenes) {
      return 'Open a past act to fork the story';
    }
    if (coDirectHint) {
      return 'Co-directors can nudge too';
    }
    return 'Voice or presets apply · text queues';
  })();

  return (
    <aside className="flex w-48 shrink-0 flex-col md:w-56">
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <h3 className="mb-3 font-label text-[10px] uppercase tracking-widest text-ink/70">
          {viewingHistory ? 'Viewing past scene' : 'Direct the next scene'}
        </h3>
        {pendingNudge && !viewingHistory && (
          <p className="mb-3 border border-ink/25 bg-surface/50 px-2 py-1.5 font-label text-[10px] leading-snug text-ink/70">
            {pendingNudge.isSelf
              ? `Queued: [${pendingNudge.type}] ${pendingNudge.content.slice(0, 48)}${pendingNudge.content.length > 48 ? '…' : ''}`
              : `${pendingNudge.submittedByName} queued a nudge`}
          </p>
        )}

        {viewingHistory && canForkAtScene && onForkAtScene && (
          <button
            type="button"
            disabled={forkDisabled}
            onClick={onForkAtScene}
            className="mb-3 w-full border border-accent bg-accent/5 px-2 py-2 font-label text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fork from here
          </button>
        )}

        <VoiceNudgeButton
          disabled={disabled}
          isListening={voice.isListening}
          supported={voice.supported}
          interimTranscript={voice.interimTranscript}
          speechError={voice.speechError}
          statusMessage={voice.statusMessage}
          lastCommand={voice.lastCommand}
          onToggle={voice.toggleListening}
        />

        <div className="mt-3 flex flex-col gap-2">
          {presets.map(preset => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => onNudge?.(preset.type, preset.content)}
              className="border border-ink bg-paper px-3 py-2 text-left font-label text-[10px] uppercase tracking-wide transition-colors hover:bg-accent hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            submitCustomNudge();
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <input
            value={nudgeText}
            onChange={e => setNudgeText(e.target.value)}
            disabled={disabled || voice.isListening}
            placeholder={
              voice.isListening
                ? voice.interimTranscript || 'Listening…'
                : '…or write your own'
            }
            className="w-full border border-ink bg-paper px-2 py-1.5 font-dialogue text-base italic outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={disabled || !nudgeText.trim() || voice.isListening}
            className="self-start border border-ink bg-paper px-3 py-1 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            Queue
          </button>
        </form>
      </div>
      <div className="shrink-0 border-t border-ink px-4 py-4">
        <button
          type="button"
          onClick={onNextScene}
          disabled={disabled || isLastScene}
          className="w-full border border-ink bg-paper py-2.5 font-label text-xs uppercase tracking-widest transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLastScene ? 'Story complete' : 'Next scene →'}
        </button>
        <p
          className={`mt-2 text-center font-label text-[10px] uppercase tracking-wider ${
            isGenerating || nudgeStatusMessage || nudgeOutcome !== 'idle'
              ? 'text-accent'
              : 'text-ink/45'
          }`}
        >
          {isGenerating ? (
            <span className="animate-pulse">{footerMessage}</span>
          ) : (
            footerMessage
          )}
        </p>
      </div>
    </aside>
  );
}
