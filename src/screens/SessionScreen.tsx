import InkwellPageShell from '../components/InkwellPageShell';
import ForkConfirmModal from '../components/ForkConfirmModal';
import { formatStoryHeader } from '../lib/resumeLabel';
import type { DirectorOnline } from '../lib/hooks';

type SessionScreenProps = {
  sessionId: bigint;
  genre?: string;
  setting?: string;
  currentSceneNum?: number;
  totalScenes?: number;
  scenes: {
    sceneNum: number;
    title: string;
    status: string;
    versionCount?: number;
  }[];
  onOpenScene?: (sceneNum: number) => void;
  onBack?: () => void;
  onGoHome?: () => void;
  onRequestFork?: (sceneNum: number) => void;
  canForkAtScene?: (sceneNum: number) => boolean;
  forkPending?: boolean;
  forkConfirmPending?: boolean;
  forkConfirm?: { sceneNum: number; generationId?: bigint; branchLabel?: string } | null;
  onConfirmFork?: () => void;
  onCancelFork?: () => void;
  isGenerating?: boolean;
  directorsOnline?: DirectorOnline[];
  sessionRole?: 'owner' | 'co-director' | null;
  error?: string | null;
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
  onRequestFork,
  canForkAtScene,
  forkPending = false,
  forkConfirmPending = false,
  forkConfirm = null,
  onConfirmFork,
  onCancelFork,
  isGenerating = false,
  directorsOnline = [],
  sessionRole = null,
  error = null,
}: SessionScreenProps) {
  const storyHeader = formatStoryHeader(genre, setting);

  return (
    <InkwellPageShell
      onLogoClick={onGoHome}
      showConnection
      directorsOnline={directorsOnline}
      sessionRole={sessionRole}
      error={error}
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
            const canFork =
              !isGenerating &&
              !forkPending &&
              canForkAtScene?.(s.sceneNum) === true &&
              onRequestFork != null;
            return (
              <li key={s.sceneNum} className="min-h-0">
                <div
                  className={`flex h-full min-h-[4.5rem] w-full flex-col border p-3 transition-colors ${
                    isCurrent
                      ? 'border-accent bg-accent/5'
                      : 'border-ink bg-paper'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenScene?.(s.sceneNum)}
                    className="flex flex-1 flex-col text-left hover:text-accent"
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
                      {(s.versionCount ?? 0) > 1 &&
                        ` · ${s.versionCount} versions`}
                    </p>
                  </button>
                  {canFork && (
                    <button
                      type="button"
                      onClick={() => onRequestFork(s.sceneNum)}
                      className="mt-2 border border-ink/40 bg-paper px-2 py-1 font-label text-[9px] uppercase tracking-widest text-ink/70 hover:border-accent hover:text-accent"
                      title="Restore swaps the current page; Fork starts a new timeline."
                    >
                      Fork from here
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <ForkConfirmModal
        open={forkConfirm != null}
        sceneNum={forkConfirm?.sceneNum ?? 1}
        branchLabel={forkConfirm?.branchLabel}
        withGeneration={forkConfirm?.generationId != null}
        pending={forkConfirmPending}
        onConfirm={() => onConfirmFork?.()}
        onCancel={() => onCancelFork?.()}
      />
    </InkwellPageShell>
  );
}
