import { useEffect, useMemo, useState } from 'react';
import ComicPage from '../components/ComicPage';
import DirectSceneRail from '../components/DirectSceneRail';
import StoryThread from '../components/StoryThread';
import ShareSessionButton from '../components/ShareSessionButton';
import type { PanelProps } from '../components/Panel';
import type { StoryAct } from '../lib/storyActs';
import {
  buildPanelNarrationText,
  type NarrationCharacter,
} from '../lib/narration';
import {
  generationPanelsToDisplay,
  parseGenerationPanels,
} from '../lib/storyActs';
import AppHeader from '../components/AppHeader';
import { getNudgePresets } from '../lib/nudgePresets';
import { useSceneNarration } from '../hooks/useSceneNarration';
import { useVoiceNudge } from '../hooks/useVoiceNudge';
import VoiceNudgeButton from '../components/VoiceNudgeButton';
import ForkConfirmModal from '../components/ForkConfirmModal';
import {
  useActivityEvents,
  useSceneDirectives,
  useCurrentScene,
  useCharacters,
  useMemories,
  useSceneGenerations,
  useGenerationCounts,
} from '../lib/hooks';
import type { PendingNudgeRow, StoryBranchRow } from '../lib/hooks';
import type { NudgeOutcome } from '../hooks/useInkwellSession';

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
  onSubmitNudge?: (type: string, content: string) => void;
  onNextScene?: () => void;
  onOpenAllScenes?: () => void;
  onOpenStoryLibrary?: () => void;
  onGoHome?: () => void;
  isGenerating?: boolean;
  isAdvancePending?: boolean;
  shareUrl?: string | null;
  onRetryPage?: () => void;
  nudgeActorName?: string | null;
  nudgeActorIsSelf?: boolean;
  pendingNudge?: PendingNudgeRow | null;
  nudgeOutcome?: NudgeOutcome;
  nudgeStatusMessage?: string | null;
  coDirectHint?: boolean;
  autoNarrateRequestId?: number;
  onRestoreGeneration?: (generationId: bigint) => void;
  parentSessionId?: bigint;
  forkSceneNum?: number;
  branchLabel?: string;
  storyBranches?: StoryBranchRow[];
  onSwitchBranch?: (sessionId: bigint) => void;
  onRequestFork?: (sceneNum: number, generationId?: bigint) => void;
  canForkAtScene?: (sceneNum: number) => boolean;
  forkConfirm?: {
    sceneNum: number;
    generationId?: bigint;
    branchLabel?: string;
  } | null;
  onConfirmFork?: () => void;
  onCancelFork?: () => void;
  forkPending?: boolean;
  error?: string | null;
};

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
  onSubmitNudge,
  onNextScene,
  onOpenAllScenes,
  onGoHome,
  isGenerating = false,
  isAdvancePending = false,
  shareUrl,
  onRetryPage,
  nudgeActorName,
  nudgeActorIsSelf = false,
  pendingNudge = null,
  nudgeOutcome = 'idle',
  nudgeStatusMessage = null,
  coDirectHint = false,
  autoNarrateRequestId = 0,
  onRestoreGeneration,
  parentSessionId = 0n,
  forkSceneNum = 0,
  branchLabel = '',
  storyBranches = [],
  onSwitchBranch,
  onRequestFork,
  canForkAtScene,
  forkConfirm = null,
  onConfirmFork,
  onCancelFork,
  forkPending = false,
  error = null,
}: SceneScreenProps) {
  const [viewingGenerationId, setViewingGenerationId] = useState<bigint | null>(
    null
  );

  useEffect(() => {
    setViewingGenerationId(null);
  }, [sceneNum]);

  const trailSceneNum = sceneNum;
  const sceneDirectives = useSceneDirectives(
    sessionId,
    trailSceneNum
  );
  const currentSceneRow = useCurrentScene(
    sessionId,
    sceneNum
  );
  const generations = useSceneGenerations(
    sessionId,
    sceneNum
  );
  const generationCounts = useGenerationCounts(
    sessionId
  );
  const previewGeneration = useMemo(
    () =>
      viewingGenerationId != null
        ? generations.find(g => g.generationId === viewingGenerationId)
        : undefined,
    [generations, viewingGenerationId]
  );
  const activityEvents = useActivityEvents(
    sessionId,
    trailSceneNum,
    viewingGenerationId ??
      currentSceneRow?.currentGenerationId ??
      undefined
  );
  const subscriptionCharacters = useCharacters(sessionId);
  const memories = useMemories(sessionId);

  const livePanels = panels ?? [];
  const previewPanels = previewGeneration
    ? generationPanelsToDisplay(
        parseGenerationPanels(previewGeneration.panelsJson)
      )
    : livePanels;
  const displayPanels = previewGeneration ? previewPanels : livePanels;
  const displayTitle =
    previewGeneration?.title?.trim() || (title ?? `Scene ${sceneNum}`);
  const displaySummary =
    previewGeneration?.sceneSummary?.trim() ||
    sceneSummary?.trim() ||
    undefined;
  const displayGenre = genre ?? 'noir';
  const displaySetting = setting ?? '';
  const displayTotal = totalScenes ?? 4;
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

  const pageImageUrl =
    previewGeneration?.pageImageUrl?.trim() ||
    currentSceneRow?.pageImageUrl?.trim() ||
    undefined;
  const isPreviewingGeneration = viewingGenerationId != null;
  const anyGenerating =
    isGenerating || currentSceneRow?.status === 'generating';
  const pageReady =
    !!pageImageUrl ||
    (currentSceneRow?.status === 'done' && displayPanels.length > 0);
  const isLastScene = sceneNum >= displayTotal;
  const isViewingHistory =
    sessionCurrentScene != null && sceneNum < sessionCurrentScene;
  const isLiveScene =
    sessionCurrentScene == null || sceneNum === sessionCurrentScene;
  const canRetryPage =
    isLiveScene &&
    onRetryPage != null &&
    currentSceneRow?.status === 'error' &&
    !pageImageUrl;
  const railDisabled =
    anyGenerating || isLastScene || isViewingHistory || isAdvancePending;
  const sceneReady =
    !anyGenerating &&
    !!pageImageUrl &&
    (previewGeneration != null || currentSceneRow?.status === 'done');
  const narrationStatus =
    previewGeneration?.narrationStatus ??
    currentSceneRow?.narrationStatus ??
    '';
  const narrationBusy = narrationStatus === 'generating';
  const hasServerNarration =
    !!previewGeneration?.narrationAudioUrl?.trim() ||
    !!currentSceneRow?.narrationAudioUrl?.trim();
  const hasPanelNarration = displayPanels.some(
    p => p.status === 'done' && buildPanelNarrationText(p).length > 0
  );
  const narrationUsable =
    hasServerNarration ||
    (narrationStatus === 'error' && hasPanelNarration);
  const sceneReadyForNarration =
    sceneReady && narrationUsable && !narrationBusy && !isPreviewingGeneration;
  const canRestoreGeneration =
    isLiveScene &&
    !anyGenerating &&
    onRestoreGeneration != null;
  const canForkAtThisScene =
    canForkAtScene?.(sceneNum) === true &&
    onRequestFork != null;
  const canForkScene = canForkAtThisScene && isViewingHistory;
  const canForkGeneration =
    canForkAtThisScene &&
    isPreviewingGeneration &&
    viewingGenerationId != null;

  const hasForkablePastScenes = useMemo(() => {
    if (sessionCurrentScene == null || !canForkAtScene) {
      return false;
    }
    for (let s = 1; s < sessionCurrentScene; s++) {
      if (canForkAtScene(s)) return true;
    }
    return false;
  }, [sessionCurrentScene, canForkAtScene]);

  const {
    play,
    stop,
    isPlaying,
    activePanelNum,
    activeNarrationText,
    muted,
    toggleMute,
  } = useSceneNarration({
    panels: displayPanels,
    characters,
    audioUrl:
      previewGeneration?.narrationAudioUrl ??
      currentSceneRow?.narrationAudioUrl ??
      undefined,
    segmentsJson:
      previewGeneration?.narrationSegmentsJson ??
      currentSceneRow?.narrationSegmentsJson,
    sceneKey: `${sessionId}-${sceneNum}-${viewingGenerationId?.toString() ?? 'live'}`,
    autoPlayRequestId: autoNarrateRequestId,
    canPlay: sceneReadyForNarration,
  });

  const handleNarrationToggle = () => {
    if (isPlaying) {
      stop();
      return;
    }
    if (muted) toggleMute();
    void play();
  };

  const handleRestore = (generationId: bigint) => {
    onRestoreGeneration?.(generationId);
    setViewingGenerationId(null);
  };

  const voicePresets = getNudgePresets(displayGenre);
  const voiceNudge = useVoiceNudge({
    presets: voicePresets,
    disabled: railDisabled,
    onNudge,
    onSubmitNudge,
  });

  return (
    <div className="inkwell-page-bg flex h-full min-h-0 flex-col overflow-hidden">
      <AppHeader
        variant="scene"
        onLogoClick={onGoHome}
        actions={
          <>
            {!isViewingHistory && (
              <VoiceNudgeButton
                compact
                disabled={railDisabled}
                isListening={voiceNudge.isListening}
                supported={voiceNudge.supported}
                interimTranscript={voiceNudge.interimTranscript}
                speechError={voiceNudge.speechError}
                onToggle={voiceNudge.toggleListening}
              />
            )}
            {sceneReadyForNarration && (
              <button
                type="button"
                onClick={handleNarrationToggle}
                className={`scene-header-btn ${isPlaying ? 'scene-header-btn--active' : ''}`}
                title={isPlaying ? 'Stop narration' : 'Listen to scene'}
              >
                {isPlaying ? 'Stop' : 'Listen'}
              </button>
            )}
            {shareUrl && (
              <ShareSessionButton
                shareUrl={shareUrl}
                disabled={anyGenerating}
                compact
              />
            )}
            {onOpenAllScenes && (
              <button
                type="button"
                onClick={onOpenAllScenes}
                className="scene-header-btn"
              >
                Scenes
              </button>
            )}
          </>
        }
      />
      {error && (
        <p
          className="shrink-0 border-b border-accent/25 bg-accent/5 px-5 py-1.5 font-label text-[10px] normal-case leading-snug text-accent md:px-8"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StoryThread
          acts={displayActs}
          currentSceneNum={sceneNum}
          onSelectAct={onSelectAct}
          characters={subscriptionCharacters}
          memories={memories}
          generationCounts={generationCounts}
          generations={generations}
          viewingGenerationId={viewingGenerationId}
          onSelectGeneration={
            setViewingGenerationId
          }
          onRestoreGeneration={handleRestore}
          canRestoreGeneration={canRestoreGeneration}
          restoreGenerationDisabled={anyGenerating}
          branches={storyBranches}
          activeSessionId={sessionId}
          onSwitchBranch={onSwitchBranch}
          onForkGeneration={
            !canForkGeneration
              ? undefined
              : genId => onRequestFork?.(sceneNum, genId)
          }
          canForkGeneration={canForkGeneration}
          forkDisabled={anyGenerating || forkPending}
          trail={{
            sceneNum: trailSceneNum,
            sceneTitle: displayTitle,
            sceneSummary:
              displaySummary ?? currentSceneRow?.sceneSummary,
            sceneStatus: previewGeneration?.status ?? currentSceneRow?.status,
            narrationStatus:
              previewGeneration?.narrationStatus ??
              currentSceneRow?.narrationStatus ??
              undefined,
            pageImageUrl,
            panels: displayPanels,
            directives: sceneDirectives,
            isGenerating: anyGenerating && !isPreviewingGeneration,
            serverEvents: activityEvents,
          }}
        />

        <main className="min-h-0 flex-1 overflow-hidden border-x border-ink px-4 py-3 md:px-6">
          <ComicPage
            panels={displayPanels}
            sceneNum={sceneNum}
            title={displayTitle}
            summary={displaySummary ?? currentSceneRow?.sceneSummary ?? undefined}
            activePanelNum={activePanelNum}
            activeNarrationText={activeNarrationText}
            isNarrating={isPlaying}
            pageImageUrl={pageImageUrl}
            isPageGenerating={anyGenerating && !pageReady}
            onRetryPage={canRetryPage ? onRetryPage : undefined}
            retryDisabled={anyGenerating}
          />
        </main>

        <DirectSceneRail
          genre={displayGenre}
          onNudge={onNudge}
          onSubmitNudge={onSubmitNudge}
          onNextScene={onNextScene}
          disabled={railDisabled}
          isLastScene={isLastScene}
          isGenerating={anyGenerating}
          viewingHistory={isViewingHistory}
          nudgeActorName={nudgeActorName}
          nudgeActorIsSelf={nudgeActorIsSelf}
          pendingNudge={pendingNudge}
          nudgeOutcome={nudgeOutcome}
          nudgeStatusMessage={nudgeStatusMessage}
          coDirectHint={coDirectHint}
          voiceNudge={voiceNudge}
          onForkAtScene={
            canForkScene ? () => onRequestFork?.(sceneNum) : undefined
          }
          canForkAtScene={canForkScene}
          forkDisabled={anyGenerating || forkPending}
          hasForkablePastScenes={hasForkablePastScenes}
        />
      </div>
      <ForkConfirmModal
        open={forkConfirm != null}
        sceneNum={forkConfirm?.sceneNum ?? sceneNum}
        branchLabel={forkConfirm?.branchLabel ?? branchLabel}
        withGeneration={forkConfirm?.generationId != null}
        pending={forkPending}
        onConfirm={() => onConfirmFork?.()}
        onCancel={() => onCancelFork?.()}
      />
    </div>
  );
}
