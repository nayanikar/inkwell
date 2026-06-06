import { useEffect, useState } from 'react';
import { getNudgePresets } from '../lib/nudgePresets';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

type DirectSceneRailProps = {
  genre?: string;
  onNudge?: (type: string, content: string) => void;
  onNextScene?: () => void;
  disabled?: boolean;
  isLastScene?: boolean;
  isGenerating?: boolean;
  viewingHistory?: boolean;
};

export default function DirectSceneRail({
  genre = 'noir',
  onNudge,
  onNextScene,
  disabled = false,
  isLastScene = false,
  isGenerating = false,
  viewingHistory = false,
}: DirectSceneRailProps) {
  const presets = getNudgePresets(genre);
  const [nudgeText, setNudgeText] = useState('');
  const [inputMode, setInputMode] = useState<'keyboard' | 'mic'>('keyboard');
  const { isListening, transcript, start, stop, supported, error, clearTranscript } =
    useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setNudgeText(transcript);
      clearTranscript();
      setInputMode('keyboard');
    }
  }, [transcript, clearTranscript]);

  const applyNudge = () => {
    const content = nudgeText.trim();
    if (content && !disabled) {
      onNudge?.('custom', content);
      setNudgeText('');
    }
  };

  return (
    <aside className="flex w-48 shrink-0 flex-col md:w-56">
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <h3 className="mb-3 font-label text-[10px] uppercase tracking-widest text-ink/70">
          {viewingHistory ? 'Viewing past scene' : 'Direct the next scene'}
        </h3>
        <div className="flex flex-col gap-2">
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
            applyNudge();
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <div className="flex gap-1">
            <input
              value={nudgeText}
              onChange={e => setNudgeText(e.target.value)}
              disabled={disabled || (inputMode === 'mic' && isListening)}
              placeholder={isListening ? 'Listening…' : '…or write your own'}
              className="min-w-0 flex-1 border border-ink bg-paper px-2 py-1.5 font-dialogue text-base italic outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
            />
            {supported && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (isListening) {
                    stop();
                    setInputMode('keyboard');
                  } else {
                    setInputMode('mic');
                    start();
                  }
                }}
                className={`shrink-0 border border-ink px-2 font-label text-[10px] uppercase ${
                  isListening
                    ? 'animate-pulse bg-accent text-paper'
                    : 'bg-paper hover:bg-surface'
                } disabled:cursor-not-allowed disabled:opacity-40`}
                title={isListening ? 'Stop listening' : 'Speak directive'}
                aria-label={isListening ? 'Stop listening' : 'Speak directive'}
              >
                {isListening ? '●' : '🎤'}
              </button>
            )}
          </div>
          {error && (
            <p className="font-label text-[10px] text-accent">{error}</p>
          )}
          <button
            type="submit"
            disabled={disabled || !nudgeText.trim()}
            className="self-start border border-ink bg-paper px-3 py-1 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
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
        <p className="mt-2 text-center font-label text-[10px] uppercase tracking-wider text-ink/45">
          {isGenerating ? (
            <span className="animate-pulse text-accent">Generating…</span>
          ) : viewingHistory ? (
            'Select the live scene in Acts to continue'
          ) : (
            'Nudge applies directive & advances'
          )}
        </p>
      </div>
    </aside>
  );
}
