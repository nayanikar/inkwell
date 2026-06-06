import InkwellPageShell from '../components/InkwellPageShell';
import ResumeStoryLink from '../components/ResumeStoryLink';
import type { SavedSession } from '../lib/savedSession';

type LandingScreenProps = {
  onStartNewStory?: () => void;
  onContinueStory?: () => void;
  savedSession?: SavedSession | null;
  connected?: boolean;
};

export default function LandingScreen({
  onStartNewStory,
  onContinueStory,
  savedSession,
  connected = true,
}: LandingScreenProps) {
  return (
    <InkwellPageShell
      headerRight={
        savedSession && onContinueStory ? (
          <ResumeStoryLink
            savedSession={savedSession}
            onContinue={onContinueStory}
            disabled={!connected}
          />
        ) : (
          'V0.1 Prototype'
        )
      }
      footerLeft="Inkwell · A directorial comic engine"
    >
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-ink/70">
          A comic, drawn live
        </p>
        <h1 className="mt-3 font-display text-6xl text-ink md:text-7xl lg:text-8xl">
          Inkwell.
        </h1>
        <p className="mt-6 max-w-xl font-label text-xs uppercase leading-relaxed tracking-widest text-ink/80 md:text-sm">
          Set up a story. Watch it become a comic, one
          <br />
          scene at a time — and nudge it where it should go
          <br />
          next.
        </p>

        <button
          type="button"
          onClick={onStartNewStory}
          disabled={!connected}
          className="mt-10 bg-ink px-8 py-3 font-label text-xs uppercase tracking-widest text-paper transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60"
        >
          {connected ? 'Start a new story →' : 'Connecting…'}
        </button>
      </div>
    </InkwellPageShell>
  );
}
