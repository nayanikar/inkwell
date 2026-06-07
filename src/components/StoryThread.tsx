import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoryAct, GenerationRow } from '../lib/storyActs';
import type { CharacterData } from '../lib/types';
import type { ActivityEventRow, MemoryEntry, SceneDirective } from '../lib/hooks';
import type { PanelProps } from './Panel';
import ActivityTrail from './ActivityTrail';
import GenerationHistory from './GenerationHistory';
import StoryBranchSwitcher from './StoryBranchSwitcher';
import type { StoryBranchRow } from '../lib/hooks';

type StoryThreadProps = {
  acts: StoryAct[];
  currentSceneNum: number;
  onSelectAct?: (sceneNum: number) => void;
  characters?: CharacterData[];
  memories?: MemoryEntry[];
  generationCounts?: Map<number, number>;
  generations?: GenerationRow[];
  viewingGenerationId?: bigint | null;
  onSelectGeneration?: (generationId: bigint | null) => void;
  onRestoreGeneration?: (generationId: bigint) => void;
  canRestoreGeneration?: boolean;
  restoreGenerationDisabled?: boolean;
  branches?: StoryBranchRow[];
  activeSessionId?: bigint | null;
  onSwitchBranch?: (sessionId: bigint) => void;
  onForkGeneration?: (generationId: bigint) => void;
  canForkGeneration?: boolean;
  forkDisabled?: boolean;
  trail?: {
    sceneNum: number;
    sceneTitle?: string;
    sceneSummary?: string | null;
    sceneStatus?: string;
    narrationStatus?: string;
    pageImageUrl?: string;
    panels: PanelProps[];
    directives?: SceneDirective[];
    isGenerating: boolean;
    serverEvents?: ActivityEventRow[];
  };
};

const TRAIL_STORAGE_KEY = 'inkwell/trail-collapsed';
const CAST_STORAGE_KEY = 'inkwell/cast-collapsed';
const RECENT_MEMORY_COUNT = 5;
const MEMORY_TEXT_MAX = 52;

const STATUS_LABEL: Record<StoryAct['status'], string> = {
  done: 'done',
  generating: 'drawing…',
  upcoming: 'up next',
  pending: '—',
};

function readTrailCollapsed(): boolean {
  try {
    return sessionStorage.getItem(TRAIL_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readCastCollapsed(): boolean {
  try {
    return sessionStorage.getItem(CAST_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default function StoryThread({
  acts,
  currentSceneNum,
  onSelectAct,
  characters,
  memories,
  generationCounts,
  generations,
  viewingGenerationId = null,
  onSelectGeneration,
  onRestoreGeneration,
  canRestoreGeneration = false,
  restoreGenerationDisabled = false,
  branches,
  activeSessionId = null,
  onSwitchBranch,
  onForkGeneration,
  canForkGeneration = false,
  forkDisabled = false,
  trail,
}: StoryThreadProps) {
  const [trailCollapsed, setTrailCollapsed] = useState(readTrailCollapsed);
  const [castCollapsed, setCastCollapsed] = useState(readCastCollapsed);
  const trailExpanded = trail != null && !trailCollapsed;
  const showCast = characters != null || memories != null;
  const castCharacters = characters ?? [];
  const recentMemories = useMemo(
    () => (memories ?? []).slice(-RECENT_MEMORY_COUNT).reverse(),
    [memories]
  );
  const characterNames = useMemo(
    () => new Map(castCharacters.map(c => [c.charId, c.name])),
    [castCharacters]
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(TRAIL_STORAGE_KEY, trailCollapsed ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [trailCollapsed]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CAST_STORAGE_KEY, castCollapsed ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [castCollapsed]);

  const toggleTrail = useCallback(() => {
    setTrailCollapsed(c => !c);
  }, []);

  const toggleCast = useCallback(() => {
    setCastCollapsed(c => !c);
  }, []);

  return (
    <aside className="flex h-full min-h-0 w-44 shrink-0 flex-col overflow-hidden md:w-52">
      <div
        className={`inkwell-scroll min-h-0 overflow-y-auto px-4 py-4 ${
          trailExpanded ? 'shrink' : 'flex-1'
        }`}
      >
        {branches != null && onSwitchBranch && (
          <StoryBranchSwitcher
            branches={branches}
            activeSessionId={activeSessionId}
            onSelectBranch={onSwitchBranch}
            compact
          />
        )}
        {showCast && (
          <section className="mb-4 border-b border-ink pb-3">
            <button
              type="button"
              onClick={toggleCast}
              className="mb-2 w-full text-left font-label text-[10px] uppercase tracking-widest text-ink/70 hover:text-accent"
            >
              Cast {castCollapsed ? '▸' : '▾'}
            </button>
            {!castCollapsed && (
              <div className="space-y-3">
                {castCharacters.length > 0 ? (
                  <ul className="space-y-1.5">
                    {castCharacters.map(character => (
                      <li
                        key={String(character.charId)}
                        className="flex min-w-0 items-start justify-between gap-1"
                      >
                        <span className="min-w-0 truncate font-label text-[10px] leading-snug text-ink/80">
                          {character.name}
                        </span>
                        <span
                          className="shrink-0 border border-ink px-1 py-px font-label text-[9px] uppercase tracking-wide text-ink/60"
                          title={character.currentMood || 'Unknown mood'}
                        >
                          {character.currentMood.trim() || '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-label text-[10px] text-ink/40">No cast yet</p>
                )}
                {recentMemories.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 font-label text-[9px] uppercase tracking-widest text-ink/45">
                      Recent memories
                    </h4>
                    <ul className="space-y-1.5">
                      {recentMemories.map(memory => (
                        <li
                          key={String(memory.memoryId)}
                          className="border border-ink/40 px-1.5 py-1"
                        >
                          <p className="font-label text-[9px] uppercase tracking-wide text-ink/50">
                            S{memory.sceneNum}·P{memory.panelNum}
                            {characterNames.has(memory.charId) && (
                              <span className="normal-case tracking-normal text-ink/40">
                                {' '}
                                · {characterNames.get(memory.charId)}
                              </span>
                            )}
                          </p>
                          <p
                            className="mt-0.5 font-label text-[10px] leading-snug text-ink/65"
                            title={memory.eventText}
                          >
                            {truncateText(memory.eventText, MEMORY_TEXT_MAX)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        <h3 className="mb-3 font-label text-[10px] uppercase tracking-widest text-ink/70">
          Acts
        </h3>
        <ol className="space-y-2">
          {acts.map(act => {
            const isCurrent = act.sceneNum === currentSceneNum;
            const label = act.title || `Act ${act.sceneNum}`;
            const canOpen = act.status === 'done' && onSelectAct;

            const rowClass = isCurrent
              ? 'font-bold text-accent'
              : act.status === 'upcoming'
                ? 'text-ink/35'
                : act.status === 'done'
                  ? 'text-ink/60 hover:text-accent'
                  : 'text-ink/60';

            const versionCount = generationCounts?.get(act.sceneNum) ?? 0;

            return (
              <li key={act.sceneNum}>
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => onSelectAct(act.sceneNum)}
                    className={`w-full text-left font-label text-[10px] leading-snug ${rowClass}`}
                  >
                    {act.sceneNum}. {label}
                    {act.isForkPoint ? (
                      <span
                        className="ml-1 text-[9px] text-accent"
                        title="Fork point"
                      >
                        fork
                      </span>
                    ) : null}
                    <span className="ml-1 opacity-70">
                      ({STATUS_LABEL[act.status]})
                    </span>
                    {versionCount > 1 && (
                      <span className="ml-1 block text-[9px] text-ink/40">
                        {versionCount} versions
                      </span>
                    )}
                  </button>
                ) : (
                  <span
                    className={`font-label text-[10px] leading-snug ${rowClass}`}
                  >
                    {act.sceneNum}. {label}
                    {act.isForkPoint ? (
                      <span
                        className="ml-1 text-[9px] text-accent"
                        title="Fork point"
                      >
                        fork
                      </span>
                    ) : null}
                    <span className="ml-1 opacity-70">
                      ({STATUS_LABEL[act.status]})
                    </span>
                    {versionCount > 1 && (
                      <span className="ml-1 block text-[9px] text-ink/40">
                        {versionCount} versions
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {generations != null && onSelectGeneration && (
        <GenerationHistory
          generations={generations}
          selectedGenerationId={viewingGenerationId}
          onSelectGeneration={onSelectGeneration}
          onRestore={onRestoreGeneration}
          canRestore={canRestoreGeneration}
          restoreDisabled={restoreGenerationDisabled}
          onFork={onForkGeneration}
          canFork={canForkGeneration}
          forkDisabled={forkDisabled}
        />
      )}

      {trail && (
        <ActivityTrail
          {...trail}
          collapsed={trailCollapsed}
          onToggle={toggleTrail}
        />
      )}
    </aside>
  );
}
