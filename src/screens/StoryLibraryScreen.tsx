import { useMemo } from 'react';
import InkwellPageShell from '../components/InkwellPageShell';
import InkwellLogo from '../components/InkwellLogo';
import StoryBranchSwitcher from '../components/StoryBranchSwitcher';
import type { SavedSession } from '../lib/savedSession';
import { useAllStoryBranches } from '../lib/hooks';
import {
  formatStoryCreatedAt,
  roleLabel,
  storyLibraryHeader,
  storyProgressLabel,
  storyResumeLabel,
  storyStatusLabel,
  type StoryLibraryCard,
} from '../lib/storyLibrary';

type StoryLibraryScreenProps = {
  stories: StoryLibraryCard[];
  savedSession?: SavedSession | null;
  connected?: boolean;
  onGoHome?: () => void;
  onResumeStory?: (sessionId: bigint) => void;
  onBrowseScenes?: (sessionId: bigint) => void;
  onSwitchBranch?: (sessionId: bigint) => void;
  activeSessionId?: bigint | null;
  error?: string | null;
};

function effectiveRootId(story: StoryLibraryCard): bigint {
  return story.rootSessionId !== 0n ? story.rootSessionId : story.sessionId;
}

type StoryGroup = {
  rootId: bigint;
  primary: StoryLibraryCard;
  branchCount: number;
};

function StoryCard({
  story,
  isLastPlayed,
  onResume,
  onBrowseScenes,
  branches,
  activeSessionId,
  onSwitchBranch,
}: {
  story: StoryLibraryCard;
  isLastPlayed: boolean;
  onResume?: () => void;
  onBrowseScenes?: () => void;
  branches: ReturnType<typeof useAllStoryBranches>;
  activeSessionId?: bigint | null;
  onSwitchBranch?: (sessionId: bigint) => void;
}) {
  const header = storyLibraryHeader(story);
  const cover = story.coverPageImageUrl?.trim();
  const status = storyStatusLabel(story);
  const rootBranches = branches.filter(
    b => b.rootSessionId === effectiveRootId(story)
  );

  return (
    <li className="flex min-h-0 flex-col border border-ink/30 bg-paper">
      <button
        type="button"
        onClick={onResume}
        className="group relative aspect-[3/4] w-full overflow-hidden border-b border-ink/20 bg-surface text-left"
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <InkwellLogo size="lg" muted className="justify-center" />
            <span className="font-label text-[9px] uppercase tracking-widest text-ink/30">
              No cover yet
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-ink/70 to-transparent p-2">
          <span
            className={`border px-1.5 py-0.5 font-label text-[9px] uppercase tracking-widest ${
              story.isGenerating
                ? 'animate-pulse border-accent bg-accent/90 text-paper'
                : story.isComplete
                  ? 'border-paper/40 bg-ink/60 text-paper/90'
                  : 'border-paper/40 bg-ink/60 text-paper'
            }`}
          >
            {status}
          </span>
          {isLastPlayed && (
            <span className="border border-paper/40 bg-paper/90 px-1.5 py-0.5 font-label text-[9px] uppercase tracking-widest text-ink">
              Last played
            </span>
          )}
        </div>
        {story.branchCount > 1 && (
          <span className="absolute bottom-2 left-2 border border-paper/40 bg-ink/70 px-1.5 py-0.5 font-label text-[9px] uppercase tracking-widest text-paper">
            {story.branchCount} forks
          </span>
        )}
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p
            className="truncate font-label text-[10px] uppercase tracking-widest text-ink/85"
            title={header}
          >
            {header}
          </p>
          <p className="mt-1 font-label text-[9px] text-ink/45">
            {storyProgressLabel(story)} · {story.scenesDone} scene
            {story.scenesDone === 1 ? '' : 's'} done
          </p>
          <p className="mt-1 font-label text-[9px] text-ink/40">
            Session #{story.sessionId.toString()} · {roleLabel(story.role)} ·{' '}
            {formatStoryCreatedAt(story.createdAt)}
            {story.isFork && story.forkSceneNum > 0
              ? ` · Fork @ scene ${story.forkSceneNum}`
              : ''}
          </p>
        </div>

        {rootBranches.length > 1 && onSwitchBranch && (
          <StoryBranchSwitcher
            branches={rootBranches}
            activeSessionId={activeSessionId ?? null}
            onSelectBranch={onSwitchBranch}
            compact
          />
        )}

        <div className="mt-auto flex gap-1.5">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 border border-ink bg-ink px-2 py-1.5 font-label text-[10px] uppercase tracking-widest text-paper transition-colors hover:bg-accent"
          >
            {storyResumeLabel(story)}
          </button>
          {onBrowseScenes && (
            <button
              type="button"
              onClick={onBrowseScenes}
              className="border border-ink/40 bg-paper px-2 py-1.5 font-label text-[10px] uppercase tracking-widest text-ink/70 hover:border-ink hover:text-ink"
            >
              Scenes
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function StoryLibraryScreen({
  stories,
  savedSession,
  connected = true,
  onGoHome,
  onResumeStory,
  onBrowseScenes,
  onSwitchBranch,
  activeSessionId = null,
  error = null,
}: StoryLibraryScreenProps) {
  const allBranches = useAllStoryBranches();

  const storyGroups = useMemo((): StoryGroup[] => {
    const byRoot = new Map<string, StoryLibraryCard[]>();
    for (const story of stories) {
      const rootKey = effectiveRootId(story).toString();
      const group = byRoot.get(rootKey) ?? [];
      group.push(story);
      byRoot.set(rootKey, group);
    }

    return [...byRoot.entries()].map(([rootKey, members]) => {
      const sorted = [...members].sort((a, b) => {
        if (a.isFork !== b.isFork) return a.isFork ? 1 : -1;
        return Number(b.createdAt - a.createdAt);
      });
      const primary = sorted.find(s => !s.isFork) ?? sorted[0];
      return {
        rootId: BigInt(rootKey),
        primary: {
          ...primary,
          branchCount: Math.max(primary.branchCount, members.length),
        },
        branchCount: members.length,
      };
    });
  }, [stories]);

  return (
    <InkwellPageShell
      onLogoClick={onGoHome}
      showConnection
      error={error}
      headerRight={`${storyGroups.length} stor${storyGroups.length === 1 ? 'y' : 'ies'}`}
      footerLeft="Inkwell · Your stories"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-6 py-4 md:px-10">
        <div className="mb-4 shrink-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-ink/50">
            Previous comics
          </p>
          <p className="mt-1 max-w-2xl font-label text-[10px] normal-case leading-relaxed tracking-normal text-ink/45">
            Every story in your SpacetimeDB — resume where you left off, switch
            forks, or browse completed scenes and past generations.
          </p>
          {!connected && (
            <p className="mt-2 font-label text-[10px] text-accent">
              Connecting to SpacetimeDB…
            </p>
          )}
        </div>

        {storyGroups.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <InkwellLogo size="md" muted className="justify-center" />
            <p className="mt-4 font-label text-xs uppercase tracking-widest text-ink/50">
              No stories yet
            </p>
            <p className="mt-2 max-w-md font-label text-[10px] normal-case leading-relaxed tracking-normal text-ink/40">
              Start a new story and it will show up here automatically.
            </p>
          </div>
        ) : (
          <ul className="inkwell-scroll grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto overscroll-contain pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {storyGroups.map(group => (
              <StoryCard
                key={group.rootId.toString()}
                story={group.primary}
                isLastPlayed={
                  savedSession?.sessionId === group.primary.sessionId.toString() ||
                  (savedSession?.rootSessionId != null &&
                    savedSession.rootSessionId === group.rootId.toString())
                }
                onResume={
                  onResumeStory
                    ? () => onResumeStory(group.primary.sessionId)
                    : undefined
                }
                onBrowseScenes={
                  onBrowseScenes
                    ? () => onBrowseScenes(group.primary.sessionId)
                    : undefined
                }
                branches={allBranches}
                activeSessionId={activeSessionId}
                onSwitchBranch={onSwitchBranch}
              />
            ))}
          </ul>
        )}
      </div>
    </InkwellPageShell>
  );
}
