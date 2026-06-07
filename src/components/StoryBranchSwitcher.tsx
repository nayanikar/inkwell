import type { StoryBranchRow } from '../lib/hooks';
import { formatStoryCreatedAt } from '../lib/storyLibrary';

type StoryBranchSwitcherProps = {
  branches: StoryBranchRow[];
  activeSessionId: bigint | null;
  onSelectBranch: (sessionId: bigint) => void;
  compact?: boolean;
};

function branchTitle(branch: StoryBranchRow): string {
  if (branch.isRoot) return 'Original timeline';
  if (branch.branchLabel.trim()) return branch.branchLabel.trim();
  return `Fork at Scene ${branch.forkSceneNum}`;
}

export default function StoryBranchSwitcher({
  branches,
  activeSessionId,
  onSelectBranch,
  compact = false,
}: StoryBranchSwitcherProps) {
  if (branches.length <= 1) return null;

  return (
    <section
      className={`border-b border-ink ${compact ? 'px-3 py-2' : 'mb-4 px-4 pb-3'}`}
    >
      <h3 className="mb-2 font-label text-[10px] uppercase tracking-widest text-ink/70">
        Forks ({branches.length})
      </h3>
      <ul className="space-y-1">
        {branches.map(branch => {
          const isActive = activeSessionId === branch.sessionId;
          return (
            <li key={branch.sessionId.toString()}>
              <button
                type="button"
                onClick={() => onSelectBranch(branch.sessionId)}
                className={`w-full border px-2 py-1.5 text-left transition-colors hover:border-accent ${
                  isActive
                    ? 'border-accent bg-accent/5'
                    : 'border-ink/30 bg-paper'
                }`}
              >
                <p className="font-label text-[10px] uppercase tracking-wide text-ink">
                  {branchTitle(branch)}
                  {isActive ? ' · active' : ''}
                </p>
                {!branch.isRoot && (
                  <p className="font-label text-[9px] text-ink/45">
                    Fork @ scene {branch.forkSceneNum} · scene{' '}
                    {branch.currentScene}/{branch.totalScenes} ·{' '}
                    {formatStoryCreatedAt(branch.forkedAt || branch.createdAt)}
                  </p>
                )}
                {branch.isRoot && !compact && (
                  <p className="font-label text-[9px] text-ink/45">
                    scene {branch.currentScene}/{branch.totalScenes}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
