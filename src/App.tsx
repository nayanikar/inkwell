import LandingScreen from './screens/LandingScreen';
import SetupScreen from './screens/SetupScreen';
import SceneScreen from './screens/SceneScreen';
import SessionScreen from './screens/SessionScreen';
import StoryLibraryScreen from './screens/StoryLibraryScreen';
import { useInkwellSession } from './hooks/useInkwellSession';

function App() {
  const {
    connected,
    screen,
    setScreen,
    sessionId,
    sceneNum,
    isSubmitting,
    isGenerating,
    isAdvancePending,
    isJoining,
    error,
    session,
    characters,
    scenes,
    storyActs,
    panels,
    currentScene,
    savedSession,
    shareUrl,
    directorsOnline,
    sessionRole,
    nudgeActorName,
    nudgeActorIsSelf,
    pendingNudge,
    nudgeOutcome,
    nudgeStatusMessage,
    otherDirectorsOnline,
    handleGoHome,
    handleContinueStory,
    handleStart,
    handleNudge,
    handleSubmitNudge,
    handleNextScene,
    handleSelectAct,
    autoNarrateRequestId,
    handleRetryPage,
    handleRestoreGeneration,
    handleSwitchBranch,
    requestForkAtScene,
    confirmFork,
    cancelFork,
    forkConfirm,
    canForkAtScene,
    forkPending,
    forkConfirmPending,
    storyBranches,
    sessionScenes,
    handleJoinFromForm,
    handleOpenStoryLibrary,
    handleResumeStory,
    handleBrowseStoryScenes,
    storyLibrary,
  } = useInkwellSession();

  const isLiveScene =
    session?.currentScene == null || sceneNum === session?.currentScene;
  const coDirectHint =
    otherDirectorsOnline &&
    !isGenerating &&
    isLiveScene;

  const main = (() => {
    if (screen === 'landing') {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <LandingScreen
            connected={connected}
            onStartNewStory={() => setScreen('setup')}
            onContinueStory={
              savedSession ? handleContinueStory : undefined
            }
            savedSession={savedSession}
            onJoinSession={handleJoinFromForm}
            onOpenStoryLibrary={handleOpenStoryLibrary}
            isJoining={isJoining}
            error={error}
          />
        </div>
      );
    }

    if (screen === 'story-library') {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <StoryLibraryScreen
            stories={storyLibrary}
            savedSession={savedSession}
            connected={connected}
            onGoHome={handleGoHome}
            onResumeStory={handleResumeStory}
            onBrowseScenes={handleBrowseStoryScenes}
            onSwitchBranch={handleSwitchBranch}
            activeSessionId={sessionId}
            error={error}
          />
        </div>
      );
    }

    if (screen === 'setup') {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SetupScreen
            onStart={handleStart}
            onContinueStory={savedSession ? handleContinueStory : undefined}
            savedSession={savedSession}
            onGoHome={handleGoHome}
            isSubmitting={isSubmitting}
            error={error}
          />
        </div>
      );
    }

    if (screen === 'session' && sessionId != null) {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SessionScreen
            sessionId={sessionId}
            genre={session?.genre}
            setting={session?.setting}
            currentSceneNum={session?.currentScene}
            totalScenes={session?.totalScenes}
            scenes={sessionScenes}
            onGoHome={handleGoHome}
            onOpenScene={num => {
              handleSelectAct(num);
              setScreen('scene');
            }}
            onBack={() => setScreen('scene')}
            onRequestFork={requestForkAtScene}
            canForkAtScene={canForkAtScene}
            forkPending={forkPending}
            forkConfirmPending={forkConfirmPending}
            forkConfirm={forkConfirm}
            onConfirmFork={() => void confirmFork()}
            onCancelFork={cancelFork}
            isGenerating={isGenerating}
            directorsOnline={directorsOnline}
            sessionRole={sessionRole}
            error={error}
          />
        </div>
      );
    }

    if (sessionId != null) {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SceneScreen
            sessionId={sessionId}
            sceneNum={sceneNum}
            sessionCurrentScene={session?.currentScene}
            title={currentScene?.title}
            sceneSummary={currentScene?.sceneSummary}
            panels={panels}
            genre={session?.genre}
            setting={session?.setting}
            totalScenes={session?.totalScenes}
            acts={storyActs}
            characters={characters.map(c => ({
              name: c.name,
              archetype: c.archetype,
            }))}
            onSelectAct={handleSelectAct}
            onGoHome={handleGoHome}
            onOpenStoryLibrary={handleOpenStoryLibrary}
            onNudge={handleNudge}
            onSubmitNudge={handleSubmitNudge}
            onNextScene={handleNextScene}
            onOpenAllScenes={() => setScreen('session')}
            isGenerating={isGenerating}
            isAdvancePending={isAdvancePending}
            shareUrl={shareUrl}
            onRetryPage={handleRetryPage}
            nudgeActorName={nudgeActorName}
            nudgeActorIsSelf={nudgeActorIsSelf}
            pendingNudge={pendingNudge}
            nudgeOutcome={nudgeOutcome}
            nudgeStatusMessage={nudgeStatusMessage}
            coDirectHint={coDirectHint}
            autoNarrateRequestId={autoNarrateRequestId}
            onRestoreGeneration={handleRestoreGeneration}
            parentSessionId={session?.parentSessionId}
            forkSceneNum={session?.forkSceneNum}
            branchLabel={session?.branchLabel}
            storyBranches={storyBranches}
            onSwitchBranch={handleSwitchBranch}
            onRequestFork={requestForkAtScene}
            canForkAtScene={canForkAtScene}
            forkConfirm={forkConfirm}
            onConfirmFork={() => void confirmFork()}
            onCancelFork={cancelFork}
            forkPending={forkPending}
            forkConfirmPending={forkConfirmPending}
            error={error}
          />
        </div>
      );
    }

    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <LandingScreen
          connected={connected}
          onStartNewStory={() => setScreen('setup')}
          onContinueStory={savedSession ? handleContinueStory : undefined}
          savedSession={savedSession}
          onJoinSession={handleJoinFromForm}
          onOpenStoryLibrary={handleOpenStoryLibrary}
          isJoining={isJoining}
          error={error}
        />
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{main}</div>
    </div>
  );
}

export default App;
