import { useCallback, useEffect, useState } from 'react';
import type { StoryAct } from '../lib/storyActs';
import type { PanelProps } from './Panel';
import type { SceneDirective } from '../lib/hooks';
import ActivityTrail from './ActivityTrail';

type StoryThreadProps = {
  acts: StoryAct[];
  currentSceneNum: number;
  onSelectAct?: (sceneNum: number) => void;
  trail?: {
    sceneNum: number;
    sceneTitle?: string;
    sceneSummary?: string | null;
    sceneStatus?: string;
    panels: PanelProps[];
    directives?: SceneDirective[];
    isGenerating: boolean;
  };
};

const TRAIL_STORAGE_KEY = 'inkwell/trail-collapsed';

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

export default function StoryThread({
  acts,
  currentSceneNum,
  onSelectAct,
  trail,
}: StoryThreadProps) {
  const [trailCollapsed, setTrailCollapsed] = useState(readTrailCollapsed);
  const trailExpanded = trail != null && !trailCollapsed;

  useEffect(() => {
    try {
      sessionStorage.setItem(TRAIL_STORAGE_KEY, trailCollapsed ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [trailCollapsed]);

  const toggleTrail = useCallback(() => {
    setTrailCollapsed(c => !c);
  }, []);

  return (
    <aside className="flex h-full min-h-0 w-44 shrink-0 flex-col overflow-hidden md:w-52">
      <div
        className={`inkwell-scroll min-h-0 overflow-y-auto px-4 py-4 ${
          trailExpanded ? 'shrink' : 'flex-1'
        }`}
      >
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

            return (
              <li key={act.sceneNum}>
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => onSelectAct(act.sceneNum)}
                    className={`w-full text-left font-label text-[10px] leading-snug ${rowClass}`}
                  >
                    {act.sceneNum}. {label}
                    <span className="ml-1 opacity-70">
                      ({STATUS_LABEL[act.status]})
                    </span>
                  </button>
                ) : (
                  <span
                    className={`font-label text-[10px] leading-snug ${rowClass}`}
                  >
                    {act.sceneNum}. {label}
                    <span className="ml-1 opacity-70">
                      ({STATUS_LABEL[act.status]})
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

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
