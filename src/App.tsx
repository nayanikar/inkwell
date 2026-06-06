import LandingScreen from './screens/LandingScreen';
import SetupScreen from './screens/SetupScreen';
import SceneScreen from './screens/SceneScreen';
import SessionScreen from './screens/SessionScreen';
import ConnectionBanner from './components/ConnectionBanner';
import { useInkwellSession } from './hooks/useInkwellSession';

function App() {
  const {
    connected,
    screen,
    setScreen,
    sessionId,
    sceneNum,
    setSceneNum,
    isSubmitting,
    isGenerating,
    useMockPreview,
    error,
    session,
    characters,
    scenes,
    storyActs,
    panels,
    currentScene,
    savedSession,
    handleGoHome,
    handleContinueStory,
    handleStart,
    handleNudge,
    handleNextScene,
    handlePreviewScene,
  } = useInkwellSession();

  const showConnectionBanner = screen === 'scene' || screen === 'session';

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
            onPreviewScene={handlePreviewScene}
            isSubmitting={isSubmitting}
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
            currentSceneNum={sceneNum}
            totalScenes={session?.totalScenes}
            scenes={scenes.map(s => ({
              sceneNum: s.sceneNum,
              title: s.title,
              status: s.status,
            }))}
            onGoHome={handleGoHome}
            onOpenScene={num => {
              setSceneNum(num);
              setScreen('scene');
            }}
            onBack={() => setScreen('scene')}
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
            sessionCurrentScene={useMockPreview ? undefined : session?.currentScene}
            title={currentScene?.title}
            sceneSummary={currentScene?.sceneSummary}
            panels={useMockPreview ? undefined : panels}
            genre={session?.genre}
            setting={session?.setting}
            totalScenes={session?.totalScenes}
            acts={storyActs}
            characters={characters.map(c => ({
              name: c.name,
              archetype: c.archetype,
            }))}
            onSelectAct={num => setSceneNum(num)}
            onGoHome={handleGoHome}
            onNudge={handleNudge}
            onNextScene={handleNextScene}
            onOpenAllScenes={() => setScreen('session')}
            isGenerating={isGenerating}
            useMockData={useMockPreview}
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
        />
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {showConnectionBanner && (
        <ConnectionBanner error={error} onGoHome={handleGoHome} />
      )}
      {error && !showConnectionBanner && (
        <div className="shrink-0 border-b border-accent bg-accent/10 px-6 py-1.5 font-label text-[10px] text-accent">
          {error}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{main}</div>
    </div>
  );
}

export default App;
