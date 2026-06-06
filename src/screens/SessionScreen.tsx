import InkwellPageShell from '../components/InkwellPageShell';
import { formatStoryHeader } from '../lib/resumeLabel';

type SessionScreenProps = {
  sessionId: bigint;
  genre?: string;
  setting?: string;
  currentSceneNum?: number;
  totalScenes?: number;
  scenes: { sceneNum: number; title: string; status: string }[];
  onOpenScene?: (sceneNum: number) => void;
  onBack?: () => void;
  onGoHome?: () => void;
};

export default function SessionScreen({
  sessionId,
  genre,
  setting,
  currentSceneNum,
  totalScenes,
  scenes,
  onOpenScene,
  onBack,
  onGoHome,
}: SessionScreenProps) {
  const storyHeader = formatStoryHeader(genre, setting);

  return (
    <InkwellPageShell
      onLogoClick={onGoHome}
      headerRight={
        currentSceneNum != null && totalScenes != null
          ? `Scene ${currentSceneNum} / ${totalScenes}`
          : `${scenes.length} scenes`
      }
      footerLeft={`${storyHeader} · session #${sessionId.toString()}`}
      footerRight={
        onBack && (
          <button
            type="button"
            onClick={onBack}
            className="border border-ink bg-paper px-4 py-1.5 font-label text-[10px] uppercase tracking-widest hover:bg-surface"
          >
            ← Back to scene
          </button>
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-6 py-4 md:px-10">
        <p className="mb-4 shrink-0 font-label text-[10px] uppercase tracking-widest text-ink/50">
          All scenes
        </p>
        <ul className="inkwell-scroll grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {scenes.map(s => {
            const isCurrent = s.sceneNum === currentSceneNum;
            return (
              <li key={s.sceneNum} className="min-h-0">
                <button
                  type="button"
                  onClick={() => onOpenScene?.(s.sceneNum)}
                  className={`flex h-full min-h-[4.5rem] w-full flex-col border p-3 text-left transition-colors hover:border-accent ${
                    isCurrent
                      ? 'border-accent bg-accent/5'
                      : 'border-ink bg-paper'
                  }`}
                >
                  <span
                    className={`font-label text-[10px] uppercase tracking-widest ${
                      isCurrent ? 'text-accent' : 'text-ink/50'
                    }`}
                  >
                    Scene {s.sceneNum}
                  </span>
                  <p className="mt-1 line-clamp-2 flex-1 font-dialogue text-base leading-snug">
                    {s.title || 'Untitled'}
                  </p>
                  <p className="mt-1 font-label text-[10px] uppercase text-ink/40">
                    {s.status}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </InkwellPageShell>
  );
}
