import { useEffect, useState } from 'react';
import ComicPage from '../components/ComicPage';
import DirectSceneRail from '../components/DirectSceneRail';
import StoryThread from '../components/StoryThread';
import type { PanelProps } from '../components/Panel';
import type { StoryAct } from '../lib/storyActs';
import type { NarrationCharacter } from '../lib/narration';
import { formatStoryHeader } from '../lib/resumeLabel';
import { useSceneNarration } from '../hooks/useSceneNarration';
import { useSceneDirectives, useCurrentScene } from '../lib/hooks';
import {
  mockPanels,
  mockSceneTitle,
  mockSession,
} from '../mock/fixtures';

type SceneScreenProps = {
  sessionId: bigint;
  sceneNum: number;
  sessionCurrentScene?: number;
  title?: string;
  sceneSummary?: string | null;
  panels?: PanelProps[];
  genre?: string;
  setting?: string;
  totalScenes?: number;
  acts?: StoryAct[];
  characters?: NarrationCharacter[];
  onSelectAct?: (sceneNum: number) => void;
  onNudge?: (type: string, content: string) => void;
  onNextScene?: () => void;
  onOpenAllScenes?: () => void;
  onGoHome?: () => void;
  isGenerating?: boolean;
  useMockData?: boolean;
};

function SceneProgressDots({
  total,
  current,
  acts,
  isGenerating,
}: {
  total: number;
  current: number;
  acts: StoryAct[];
  isGenerating: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const act = acts.find(a => a.sceneNum === n);
        const isDone = act?.status === 'done';
        const isCurrent = n === current;
        const pulsing = isCurrent && isGenerating;

        return (
          <span
            key={n}
            className={`inline-block h-2 w-2 border border-ink ${
              isDone
                ? 'bg-ink'
                : isCurrent
                  ? pulsing
                    ? 'animate-pulse bg-accent'
                    : 'bg-accent'
                  : 'bg-paper'
            }`}
          />
        );
      })}
    </div>
  );
}

export default function SceneScreen({
  sessionId,
  sceneNum,
  sessionCurrentScene,
  title,
  sceneSummary,
  panels,
  genre,
  setting,
  totalScenes,
  acts,
  characters = [],
  onSelectAct,
  onNudge,
  onNextScene,
  onOpenAllScenes,
  onGoHome,
  isGenerating = false,
  useMockData = false,
}: SceneScreenProps) {
  const displayPanels = useMockData ? mockPanels : (panels ?? []);
  const displayTitle = useMockData
    ? mockSceneTitle
    : (title ?? `Scene ${sceneNum}`);
  const displaySummary = useMockData ? undefined : sceneSummary?.trim() || undefined;
  const displayGenre = genre ?? mockSession.genre;
  const displaySetting = setting ?? mockSession.setting;
  const displayTotal = totalScenes ?? mockSession.totalScenes;
  const displayActs =
    acts ??
    Array.from({ length: displayTotal }, (_, i) => ({
      sceneNum: i + 1,
      title: i + 1 === sceneNum ? displayTitle : '',
      status: (i + 1 === sceneNum
        ? isGenerating
          ? 'generating'
          : 'done'
        : i + 1 < sceneNum
          ? 'done'
          : 'upcoming') as StoryAct['status'],
    }));

  const anyGenerating =
    isGenerating || displayPanels.some(p => p.status === 'generating');
  const isLastScene = sceneNum >= displayTotal;
  const isViewingHistory =
    sessionCurrentScene != null && sceneNum < sessionCurrentScene;
  const railDisabled = anyGenerating || isLastScene || isViewingHistory;

  const sceneDirectives = useSceneDirectives(
    useMockData ? null : sessionId,
    sceneNum
  );
  const currentSceneRow = useCurrentScene(
    useMockData ? null : sessionId,
    sceneNum
  );
  const sceneReady =
    !anyGenerating &&
    displayPanels.length > 0 &&
    displayPanels.every(p => p.status === 'done');

  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const { play, stop, isPlaying, activePanelNum, muted, toggleMute } =
    useSceneNarration({
      panels: displayPanels,
      characters,
      enabled: narrationEnabled && sceneReady && !useMockData,
    });

  useEffect(() => {
    setNarrationEnabled(false);
    stop();
  }, [sceneNum, stop]);

  const handleNarrationToggle = () => {
    if (isPlaying) {
      stop();
      return;
    }
    setNarrationEnabled(true);
    if (muted) toggleMute();
    void play();
  };

  const handleMute = () => {
    if (muted) {
      toggleMute();
      return;
    }
    stop();
    setNarrationEnabled(false);
    toggleMute();
  };

  const storyHeader = formatStoryHeader(displayGenre, displaySetting);

  return (
    <div className="inkwell-page-bg flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ink px-6 py-2 md:px-10">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              className="font-display text-sm uppercase tracking-wide text-ink transition-colors hover:text-accent"
            >
              Inkwell
            </button>
          ) : (
            <span className="font-display text-sm uppercase tracking-wide text-ink">
              Inkwell
            </span>
          )}
          <span className="font-label text-[10px] uppercase tracking-widest text-ink/40">
            Overview
          </span>
        </div>

        <p
          className="min-w-0 flex-1 truncate px-4 text-center font-label text-xs uppercase tracking-widest text-ink"
          title={storyHeader}
        >
          {storyHeader}
        </p>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {sceneReady && !useMockData && (
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={handleNarrationToggle}
                className={`border border-ink px-2 py-0.5 font-label text-[10px] uppercase ${
                  isPlaying
                    ? 'bg-accent text-paper'
                    : 'bg-paper hover:bg-surface'
                }`}
                title={isPlaying ? 'Stop narration' : 'Listen to scene'}
              >
                {isPlaying ? '■' : '🔊'}
              </button>
              {(narrationEnabled || isPlaying) && (
                <button
                  type="button"
                  onClick={handleMute}
                  className="border border-ink bg-paper px-2 py-0.5 font-label text-[10px] uppercase hover:bg-surface"
                >
                  {muted ? 'Unmute' : 'Mute'}
                </button>
              )}
            </div>
          )}
          {sessionCurrentScene != null && (
            <span
              className={`border px-1.5 py-0.5 font-label text-[10px] uppercase tracking-widest ${
                isViewingHistory
                  ? 'border-ink/30 text-ink/55'
                  : 'border-accent text-accent'
              }`}
            >
              {isViewingHistory ? 'Past scene' : 'Live'}
            </span>
          )}
          <span className="font-label text-[10px] uppercase tracking-widest text-ink/70">
            Scene {sceneNum} / {displayTotal}
          </span>
          <SceneProgressDots
            total={displayTotal}
            current={sceneNum}
            acts={displayActs}
            isGenerating={anyGenerating}
          />
          {onOpenAllScenes && (
            <button
              type="button"
              onClick={onOpenAllScenes}
              className="font-label text-[10px] uppercase tracking-widest text-ink/60 hover:text-accent"
            >
              All scenes
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StoryThread
          acts={displayActs}
          currentSceneNum={sceneNum}
          onSelectAct={useMockData ? undefined : onSelectAct}
          trail={
            useMockData
              ? undefined
              : {
                  sceneNum,
                  sceneTitle: displayTitle,
                  sceneSummary: displaySummary ?? currentSceneRow?.sceneSummary,
                  sceneStatus: currentSceneRow?.status,
                  panels: displayPanels,
                  directives: sceneDirectives,
                  isGenerating: anyGenerating,
                }
          }
        />

        <main className="min-h-0 flex-1 overflow-hidden border-x border-ink px-4 py-3 md:px-6">
          <ComicPage
            panels={displayPanels}
            sceneNum={sceneNum}
            title={displayTitle}
            summary={displaySummary ?? currentSceneRow?.sceneSummary ?? undefined}
            activePanelNum={activePanelNum}
          />
        </main>

        <DirectSceneRail
          genre={displayGenre}
          onNudge={onNudge}
          onNextScene={onNextScene}
          disabled={railDisabled}
          isLastScene={isLastScene}
          isGenerating={anyGenerating}
          viewingHistory={isViewingHistory}
        />
      </div>
    </div>
  );
}
