import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpacetimeDB, useProcedure, useReducer } from 'spacetimedb/react';
import { procedures, reducers } from '../module_bindings';
import type { SetupFormData } from '../screens/SetupScreen';
import {
  useSession,
  useCharacters,
  useScenes,
  useScenePanels,
  useCurrentScene,
  useAccessibleSessions,
  useStoryActs,
  useIsSceneGenerating,
  useSessionDirectorsOnline,
  useSessionRole,
  useSceneDirectives,
  usePendingNudge,
  useSelfPresence,
  useGenerationCounts,
  useStoryLibrary,
  useStoryBranches,
} from '../lib/hooks';
import { mapStoryLibraryRow } from '../lib/storyLibrary';
import { pickCanonicalScene } from '../lib/storyActs';
import {
  loadSavedSession,
  saveSessionProgress,
  clearSavedSession,
  type SavedSession,
} from '../lib/savedSession';
import { unlockNarrationAudio } from '../lib/audioUnlock';
import { parseJoinCredentials } from '../lib/joinSession';

export type InkwellScreen =
  | 'landing'
  | 'setup'
  | 'scene'
  | 'session'
  | 'story-library';

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

function friendlyProcedureError(err: unknown, fallback: string): string {
  const raw = formatError(err, fallback);
  if (raw.includes('NUDGE_LOST:RACE')) {
    return 'Another director just advanced — your nudge was queued if you had one.';
  }
  if (raw.includes('NUDGE_LOST:GENERATING')) {
    return 'Scene is still generating — wait for the scene to finish.';
  }
  if (raw.includes('NUDGE_BLOCKED:COMPLETE')) {
    return 'Story is complete — no more scenes to nudge.';
  }
  if (raw.includes('NUDGE_SUPERSEDED')) {
    return 'Your pending nudge was replaced by another director.';
  }
  if (
    raw.includes('still generating') ||
    raw.includes('just advanced') ||
    raw.includes('already generating')
  ) {
    return 'Another director just advanced — hang tight.';
  }
  if (raw.includes('Not authorized')) {
    return 'You no longer have access to this session.';
  }
  if (raw.includes('Invalid invite code')) {
    return 'Invalid invite code — ask the owner for a fresh link.';
  }
  if (raw.includes('Session not found')) {
    return 'Session not found — check the session number or invite link.';
  }
  if (raw.includes('Story is complete')) {
    return 'That story is already finished — you can browse it but not co-direct.';
  }
  return raw;
}

export type NudgeOutcome = 'idle' | 'submitted' | 'lost' | 'consumed';

export function useInkwellSession() {
  const { isActive: connected, identity } = useSpacetimeDB();
  const startStory = useProcedure(procedures.startStory);
  const advanceAndGenerate = useProcedure(procedures.advanceAndGenerate);
  const resumeGeneration = useProcedure(procedures.resumeGeneration);
  const retryPageNow = useProcedure(procedures.retryPageNow);
  const regenerateSceneNarration = useProcedure(procedures.regenerateSceneNarration);
  const forkStoryBranch = useProcedure(procedures.forkStoryBranch);
  const joinSession = useReducer(reducers.joinSession);
  const submitNudge = useReducer(reducers.submitNudge);
  const restoreGenerationReducer = useReducer(reducers.restoreGeneration);

  const [screen, setScreen] = useState<InkwellScreen>('landing');
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  /** Browsing act number; live act follows session.currentScene when equal. */
  const [sceneNum, setSceneNum] = useState(1);
  const [forkConfirm, setForkConfirm] = useState<{
    sceneNum: number;
    generationId?: bigint;
    branchLabel?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [procedurePending, setProcedurePending] = useState(false);
  const [optimisticGeneratingScene, setOptimisticGeneratingScene] = useState<
    number | null
  >(null);
  const [nudgeOutcome, setNudgeOutcome] = useState<NudgeOutcome>('idle');
  const [nudgeStatusMessage, setNudgeStatusMessage] = useState<string | null>(
    null
  );
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoNarrateRequestId, setAutoNarrateRequestId] = useState(0);
  const [forkSettling, setForkSettling] = useState(false);
  const [forkWaitingForBranch, setForkWaitingForBranch] = useState(false);

  /** When true, auto-follow live scene on advance/complete; false after manual history browse. */
  const followLiveRef = useRef(true);
  const prevLiveSceneRef = useRef<number | null>(null);
  const prevLiveSceneStatusRef = useRef<string | null>(null);
  const prevNarrationReadyRef = useRef(false);
  const narrationSceneKeyRef = useRef('');
  const resumeAttemptRef = useRef<string | null>(null);
  /** Prevents URL auto-join from re-firing when accessibleSessions updates mid-join. */
  const urlJoinAttemptRef = useRef<string | null>(null);
  const pendingForkRef = useRef<{
    parentSessionId: bigint;
    sceneNum: number;
    /** Source generation when forking a version; 0n for scene-only fork. */
    generationId: bigint;
    requestedAtMs: number;
  } | null>(null);

  const resetGenerationClientState = useCallback(() => {
    setProcedurePending(false);
    setOptimisticGeneratingScene(null);
    setNudgeOutcome('idle');
    setNudgeStatusMessage(null);
    setForkWaitingForBranch(false);
    setForkSettling(false);
  }, []);

  const bumpAutoNarrate = useCallback(() => {
    setAutoNarrateRequestId(id => id + 1);
  }, []);

  const session = useSession(sessionId);
  const rootSessionId = useMemo(() => {
    if (!session) return null;
    return session.rootSessionId !== 0n
      ? session.rootSessionId
      : session.sessionId;
  }, [session]);
  const storyBranches = useStoryBranches(
    rootSessionId
  );
  const accessibleSessions = useAccessibleSessions();
  const accessibleSessionsRef = useRef(accessibleSessions);
  accessibleSessionsRef.current = accessibleSessions;
  const storyLibraryRows = useStoryLibrary();
  const storyLibrary = useMemo(
    () => storyLibraryRows.map(mapStoryLibraryRow),
    [storyLibraryRows]
  );
  const characters = useCharacters(sessionId);
  const scenes = useScenes(sessionId);
  const liveSceneNum = session?.currentScene ?? sceneNum;
  const panels = useScenePanels(sessionId, sceneNum);
  const currentScene = useCurrentScene(sessionId, sceneNum);
  const sceneGenerating = useIsSceneGenerating(sessionId, sceneNum);
  const liveSceneGenerating = useIsSceneGenerating(sessionId, liveSceneNum);
  const liveScene = useCurrentScene(sessionId, liveSceneNum);
  const livePanels = useScenePanels(sessionId, liveSceneNum);
  const optimisticSceneGenerating = useIsSceneGenerating(
    sessionId,
    optimisticGeneratingScene ?? 0
  );
  const directorsOnline = useSessionDirectorsOnline(
    sessionId
  );
  const sessionRole = useSessionRole(sessionId);
  const liveDirectives = useSceneDirectives(
    sessionId,
    session?.currentScene ?? sceneNum
  );
  const pendingNudge = usePendingNudge(sessionId);
  const selfPresence = useSelfPresence();
  const generationCounts = useGenerationCounts(
    sessionId
  );

  const otherDirectorsOnline = useMemo(
    () => directorsOnline.some(d => d.online && !d.isSelf),
    [directorsOnline]
  );
  const remoteGenerating =
    sessionId != null &&
    liveSceneGenerating &&
    !procedurePending &&
    optimisticGeneratingScene !== liveSceneNum &&
    (sceneNum === liveSceneNum || followLiveRef.current);

  const remoteNudgeActorName = useMemo(() => {
    if (!remoteGenerating || liveDirectives.length === 0) return null;
    const latest = [...liveDirectives].sort(
      (a, b) => Number(b.directiveId - a.directiveId)
    )[0];
    return latest?.appliedBy?.trim() || null;
  }, [remoteGenerating, liveDirectives]);

  const nudgeActorName = procedurePending
    ? selfPresence?.displayName ?? null
    : remoteGenerating
      ? remoteNudgeActorName
      : null;

  const nudgeActorIsSelf =
    procedurePending ||
    (remoteGenerating &&
      remoteNudgeActorName != null &&
      selfPresence?.displayName === remoteNudgeActorName);

  const serverGenerating =
    sessionId != null &&
    session != null &&
    session.generatingScene !== 0;

  const liveSceneComplete =
    liveScene?.status === 'done' && !!liveScene.pageImageUrl?.trim();

  /** Server truth — used for acts, comic page, rail status. */
  const isGenerating =
    serverGenerating ||
    liveSceneGenerating ||
    (sceneGenerating && sceneNum === liveSceneNum);

  /** Client-only advance call in flight — disables nudge controls briefly. */
  const isAdvancePending =
    procedurePending ||
    (optimisticGeneratingScene != null &&
      sessionId != null &&
      !liveSceneComplete);

  const storyActs = useStoryActs(
    sessionId,
    session?.totalScenes ?? 6,
    sceneNum,
    isGenerating,
    session?.parentSessionId !== 0n ? session?.forkSceneNum : undefined
  );

  const shareUrl = useMemo(() => {
    if (sessionId == null || !session?.inviteCode ) {
      return null;
    }
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('session', sessionId.toString());
    url.searchParams.set('code', session.inviteCode);
    return url.toString();
  }, [sessionId, session?.inviteCode]);

  useEffect(() => {
    followLiveRef.current = true;
    prevLiveSceneRef.current = null;
    prevLiveSceneStatusRef.current = null;
    prevNarrationReadyRef.current = false;
    narrationSceneKeyRef.current = '';
    setForkSettling(false);
    setForkWaitingForBranch(false);
  }, [sessionId]);

  // Follow live scene when session advances; stay on past scene during generation if following live.
  useEffect(() => {
    if (sessionId == null  || !session) return;
    if (procedurePending) return;

    const live = session.currentScene;
    const prev = prevLiveSceneRef.current;

    if (prev == null) {
      prevLiveSceneRef.current = live;
      if (followLiveRef.current && sceneNum < live) {
        setSceneNum(live);
      }
      return;
    }

    if (!followLiveRef.current) {
      prevLiveSceneRef.current = live;
      return;
    }

    if (live > prev && sceneNum === prev) {
      setSceneNum(live);
    } else if (sceneNum > live) {
      setSceneNum(live);
    }

    prevLiveSceneRef.current = live;
  }, [
    session?.currentScene,
    sessionId,
    sceneNum,
    session,
    procedurePending,
  ]);

  // Switch to the new scene once its page image is ready (after advance/nudge).
  useEffect(() => {
    if (sessionId == null  || !session || !liveScene) return;
    if (!followLiveRef.current) return;
    if (sceneNum >= session.currentScene) return;
    if (liveScene.status === 'generating') return;

    const pageReady =
      liveScene.status === 'done' && !!liveScene.pageImageUrl?.trim();
    const pageFailed = liveScene.status === 'error';
    if (!pageReady && !pageFailed) return;

    setSceneNum(session.currentScene);
    setOptimisticGeneratingScene(null);
  }, [
    liveScene?.status,
    liveScene?.pageImageUrl,
    session?.currentScene,
    sceneNum,
    sessionId,
    session,
    liveScene,
  ]);

  // Auto-narrate when server TTS finishes (scene may already be `done` while narration generates).
  useEffect(() => {
    if (sessionId == null  || !session || !liveScene) return;
    if (!followLiveRef.current) return;
    if (sceneNum !== session.currentScene) return;
    if (forkSettling || forkWaitingForBranch) return;

    const sceneKey = `${sessionId}-${sceneNum}`;
    if (narrationSceneKeyRef.current !== sceneKey) {
      narrationSceneKeyRef.current = sceneKey;
      prevNarrationReadyRef.current = false;
    }

    const narrationStatus = liveScene.narrationStatus ?? '';
    const hasServerAudio = !!liveScene.narrationAudioUrl?.trim();
    const narrationReady =
      narrationStatus === 'done' && hasServerAudio;
    const wasReady = prevNarrationReadyRef.current;
    prevNarrationReadyRef.current = narrationReady;

    if (narrationReady && !wasReady) {
      bumpAutoNarrate();
    }
  }, [
    liveScene?.narrationStatus,
    liveScene?.narrationAudioUrl,
    sceneNum,
    session?.currentScene,
    sessionId,
    session,
    liveScene,
    bumpAutoNarrate,
    forkSettling,
    forkWaitingForBranch,
  ]);

  // Clear fork settling once the fork scene's comic data has synced.
  useEffect(() => {
    if (!forkSettling || sessionId == null || !liveScene) return;
    const pageReady = !!liveScene.pageImageUrl?.trim();
    const panelsReady = livePanels.length > 0;
    if (pageReady && panelsReady) {
      setForkSettling(false);
    }
  }, [forkSettling, sessionId, liveScene, liveScene?.pageImageUrl, livePanels.length]);

  useEffect(() => {
    if (optimisticGeneratingScene == null || !session) return;
    if (
      session.currentScene === optimisticGeneratingScene &&
      !optimisticSceneGenerating
    ) {
      setOptimisticGeneratingScene(null);
    }
  }, [
    optimisticGeneratingScene,
    session?.currentScene,
    optimisticSceneGenerating,
    session,
  ]);

  useEffect(() => {
    if (sessionId == null  || !session) return;
    if (session.generatingScene !== 0) return;

    const liveDone =
      liveScene?.status === 'done' && !!liveScene.pageImageUrl?.trim();
    const liveFailed = liveScene?.status === 'error';

    if (liveDone || liveFailed) {
      setProcedurePending(false);
      setOptimisticGeneratingScene(null);
    }
  }, [
    sessionId,
    session?.generatingScene,
    liveScene?.status,
    liveScene?.pageImageUrl,
    session,
  ]);

  useEffect(() => {
    if (nudgeOutcome === 'idle') return;
    const timer = window.setTimeout(() => {
      setNudgeOutcome('idle');
      setNudgeStatusMessage(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [nudgeOutcome]);

  useEffect(() => {
    if (!connected || sessionId == null  || !session) return;
    if (procedurePending || isAdvancePending) return;

    const liveStatus = liveScene?.status;
    const liveHasPage = !!liveScene?.pageImageUrl?.trim();

    // Failed scenes require an explicit manual retry — never auto-resume errors.
    if (liveStatus === 'error') {
      resumeAttemptRef.current = null;
      return;
    }

    const serverHoldLock = session.generatingScene !== 0;
    const stuckGenerating =
      serverHoldLock &&
      liveStatus === 'generating' &&
      !liveHasPage;

    if (!stuckGenerating) {
      resumeAttemptRef.current = null;
      return;
    }

    const key = `${sessionId.toString()}-${session.generatingScene}-${liveStatus ?? 'none'}-${liveHasPage ? 'page' : 'nopage'}-${liveScene?.sceneId?.toString() ?? '0'}-${livePanels.length}`;
    if (resumeAttemptRef.current === key) return;
    resumeAttemptRef.current = key;

    void resumeGeneration({ sessionId }).catch(err => {
      console.error('resume_generation failed:', err);
    });

    const retryTimer = window.setTimeout(() => {
      resumeAttemptRef.current = null;
    }, 300_000);

    return () => window.clearTimeout(retryTimer);
  }, [
    connected,
    sessionId,
    session?.generatingScene,
    liveScene?.status,
    liveScene?.pageImageUrl,
    liveScene?.sceneId,
    livePanels.length,
    procedurePending,
    isAdvancePending,
    session,
    resumeGeneration,
  ]);

  useEffect(() => {
    if (sessionId == null  || !session) return;
    if (session.status === 'done') {
      clearSavedSession();
      return;
    }
    saveSessionProgress({
      sessionId: sessionId.toString(),
      rootSessionId: (
        session.rootSessionId !== 0n
          ? session.rootSessionId
          : session.sessionId
      ).toString(),
      sceneNum: session.currentScene,
      genre: session.genre,
      setting: session.setting,
      role: sessionRole ?? undefined,
    });
  }, [
    sessionId,
    session?.genre,
    session?.setting,
    session?.status,
    session?.currentScene,
    sessionRole,
  ]);

  const savedSession: SavedSession | null = useMemo(() => {
    const saved = loadSavedSession();
    if (!saved) return null;
    const id = BigInt(saved.sessionId);
    const row = accessibleSessions.find(s => s.sessionId === id);
    if (!row || row.status === 'done') return null;
    return {
      ...saved,
      genre: row.genre,
      setting: row.setting,
      sceneNum: row.currentScene,
    };
  }, [accessibleSessions]);

  const handleJoinSession = useCallback(
    async (id: bigint, inviteCode: string): Promise<boolean> => {
      if (!connected) {
        setError(
          'Not connected to SpacetimeDB — wait a moment and try again.'
        );
        return false;
      }
      setIsJoining(true);
      setError(null);
      try {
        await joinSession({ sessionId: id, inviteCode });
        resetGenerationClientState();
        resumeAttemptRef.current = null;
        unlockNarrationAudio();
        const row = accessibleSessionsRef.current.find(s => s.sessionId === id);
        setSessionId(id);
        followLiveRef.current = true;
        prevLiveSceneRef.current = null;
        setSceneNum(row?.currentScene ?? 1);
        setScreen('scene');
        if (row) {
          saveSessionProgress({
            sessionId: id.toString(),
            sceneNum: row.currentScene,
            genre: row.genre,
            setting: row.setting,
            role: 'co-director',
          });
        }
        return true;
      } catch (err) {
        setError(friendlyProcedureError(err, 'Failed to join session'));
        return false;
      } finally {
        setIsJoining(false);
      }
    },
    [connected, joinSession, resetGenerationClientState]
  );

  const handleJoinSessionRef = useRef(handleJoinSession);
  handleJoinSessionRef.current = handleJoinSession;

  const handleJoinFromForm = useCallback(
    (sessionInput: string, codeInput: string) => {
      const parsed = parseJoinCredentials(sessionInput, codeInput);
      if ('error' in parsed) {
        setError(parsed.error);
        return;
      }
      void handleJoinSession(parsed.sessionId, parsed.inviteCode);
    },
    [handleJoinSession]
  );

  useEffect(() => {
    if (!connected) return;
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const codeParam = params.get('code');
    if (!sessionParam || !codeParam) return;

    const parsed = parseJoinCredentials(sessionParam, codeParam);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }

    const attemptKey = `${parsed.sessionId}:${parsed.inviteCode}`;
    if (urlJoinAttemptRef.current === attemptKey) return;
    urlJoinAttemptRef.current = attemptKey;

    void handleJoinSessionRef.current(
      parsed.sessionId,
      parsed.inviteCode
    ).then(success => {
      if (!success) {
        urlJoinAttemptRef.current = null;
        return;
      }
      params.delete('session');
      params.delete('code');
      const next = params.toString();
      window.history.replaceState(
        {},
        '',
        next ? `?${next}` : window.location.pathname
      );
    });
  }, [connected]);

  const handleGoHome = () => {
    if (sessionId != null && session) {
      saveSessionProgress({
        sessionId: sessionId.toString(),
        sceneNum: session.currentScene,
        genre: session.genre,
        setting: session.setting,
        role: sessionRole ?? undefined,
      });
    }
    resetGenerationClientState();
    resumeAttemptRef.current = null;
    setScreen('landing');
    setSessionId(null);
    setError(null);
  };

  const handleContinueStory = () => {
    const saved = loadSavedSession();
    if (!saved) return;
    const id = BigInt(saved.sessionId);
    const row = accessibleSessions.find(s => s.sessionId === id);
    if (!row) return;

    unlockNarrationAudio();
    setSessionId(id);
    followLiveRef.current = true;
    prevLiveSceneRef.current = null;
    setSceneNum(row.currentScene);
    setScreen('scene');
    setError(null);
  };

  const handleStart = async (data: SetupFormData) => {
    if (!connected) {
      setError('Not connected to SpacetimeDB — wait for connection and try again.');
      return;
    }
    setIsSubmitting(true);
    resetGenerationClientState();
    resumeAttemptRef.current = null;
    setError(null);
    unlockNarrationAudio();
    try {
      const newSessionId = await startStory({
        genre: data.genre,
        setting: data.setting,
        totalScenes: data.totalScenes,
        characters: data.characters.map(c => ({
          name: c.name,
          archetype: c.archetype,
          personality: c.personality,
          currentMood: c.currentMood,
          visualDescription: c.visual_description,
          secret: c.secret,
        })),
      });

      setSessionId(newSessionId);
      setSceneNum(1);
      setScreen('scene');
    } catch (err) {
      const message = formatError(err, 'Failed to start session');
      console.error('Failed to start session:', err);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitNudge = async (type: string, content: string) => {
    if (sessionId == null || !session ) return;
    if (sceneNum !== session.currentScene) return;
    if (session.currentScene >= session.totalScenes || isGenerating || isAdvancePending) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    try {
      setError(null);
      await submitNudge({ sessionId, type: type || 'custom', content: trimmed });
      setNudgeOutcome('submitted');
      setNudgeStatusMessage('Nudge queued for next scene');
    } catch (err) {
      setError(friendlyProcedureError(err, 'Submit nudge failed'));
    }
  };

  const handleNudge = async (type: string, content: string) => {
    if (sessionId == null || !session ) return;
    if (sceneNum !== session.currentScene) return;
    if (session.currentScene >= session.totalScenes || isGenerating || isAdvancePending) return;

    const nextScene = session.currentScene + 1;
    try {
      followLiveRef.current = true;
      setProcedurePending(true);
      setOptimisticGeneratingScene(nextScene);
      setError(null);
      setNudgeOutcome('idle');
      setNudgeStatusMessage(null);
      await advanceAndGenerate({
        sessionId,
        nudgeType: type,
        nudgeContent: content,
      });
      setNudgeOutcome('consumed');
    } catch (err) {
      setOptimisticGeneratingScene(null);
      const msg = friendlyProcedureError(err, 'Nudge failed');
      if (msg.includes('just advanced')) {
        setNudgeOutcome('lost');
      }
      setNudgeStatusMessage(msg);
      setError(msg);
    } finally {
      setProcedurePending(false);
    }
  };

  const handleNextScene = async () => {
    if (sessionId == null || !session ) return;
    if (sceneNum !== session.currentScene) return;
    if (session.currentScene >= session.totalScenes || isGenerating || isAdvancePending) return;

    const nextScene = session.currentScene + 1;
    try {
      followLiveRef.current = true;
      setProcedurePending(true);
      setOptimisticGeneratingScene(nextScene);
      setError(null);
      setNudgeOutcome('idle');
      setNudgeStatusMessage(null);
      await advanceAndGenerate({
        sessionId,
        nudgeType: '',
        nudgeContent: '',
      });
    } catch (err) {
      setOptimisticGeneratingScene(null);
      const msg = friendlyProcedureError(err, 'Advance scene failed');
      if (msg.includes('just advanced')) {
        setNudgeOutcome('lost');
      }
      setNudgeStatusMessage(msg);
      setError(msg);
    } finally {
      setProcedurePending(false);
    }
  };

  const handleRetryPage = async () => {
    if (sessionId == null  || currentScene?.sceneId == null) return;
    try {
      setError(null);
      setProcedurePending(true);
      await retryPageNow({ sessionId, sceneId: currentScene.sceneId });
    } catch (err) {
      setProcedurePending(false);
      setError(friendlyProcedureError(err, 'Retry failed'));
    }
  };

  const handleRestoreGeneration = async (generationId: bigint) => {
    if (sessionId == null ) return;
    try {
      setError(null);
      await restoreGenerationReducer({ sessionId, generationId });
    } catch (err) {
      setError(friendlyProcedureError(err, 'Restore failed'));
    }
  };

  const handleSwitchBranch = useCallback(
    (targetSessionId: bigint) => {
      if (targetSessionId === sessionId) return;
      const branch = storyBranches.find(b => b.sessionId === targetSessionId);
      if (!branch) return;
      resetGenerationClientState();
      resumeAttemptRef.current = null;
      pendingForkRef.current = null;
      setForkWaitingForBranch(false);
      setForkSettling(false);
      setSessionId(targetSessionId);
      followLiveRef.current = true;
      prevLiveSceneRef.current = null;
      setSceneNum(branch.currentScene);
      setScreen('scene');
      setError(null);
    },
    [sessionId, storyBranches, resetGenerationClientState]
  );

  const requestForkAtScene = useCallback(
    (targetSceneNum: number, generationId?: bigint, branchLabel?: string) => {
      if (sessionId == null ) return;
      if (session?.generatingScene !== 0) {
        setError('Wait for generation to finish before forking');
        return;
      }
      setForkConfirm({
        sceneNum: targetSceneNum,
        generationId,
        branchLabel,
      });
    },
    [sessionId, session?.generatingScene]
  );

  const cancelFork = useCallback(() => {
    setForkConfirm(null);
  }, []);

  const completeForkNavigation = useCallback(
    (newSessionId: bigint, forkSceneNum: number) => {
      pendingForkRef.current = null;
      setProcedurePending(false);
      setOptimisticGeneratingScene(null);
      setNudgeOutcome('idle');
      setNudgeStatusMessage(null);
      setForkWaitingForBranch(false);
      resumeAttemptRef.current = null;
      prevLiveSceneStatusRef.current = null;
      prevNarrationReadyRef.current = false;
      narrationSceneKeyRef.current = '';
      setSessionId(newSessionId);
      followLiveRef.current = true;
      prevLiveSceneRef.current = null;
      setSceneNum(forkSceneNum);
      setScreen('scene');
      setForkSettling(true);

      void regenerateSceneNarration({
        sessionId: newSessionId,
        sceneNum: forkSceneNum,
      }).catch(err => {
        console.error('Fork narration regen failed:', err);
      });
    },
    [regenerateSceneNarration]
  );

  const confirmFork = useCallback(async () => {
    if (sessionId == null || forkConfirm == null) return;

    const { sceneNum: forkSceneNum, generationId, branchLabel } = forkConfirm;
    setForkConfirm(null);
    setError(null);
    setForkWaitingForBranch(true);
    unlockNarrationAudio();
    pendingForkRef.current = {
      parentSessionId: sessionId,
      sceneNum: forkSceneNum,
      generationId: generationId ?? 0n,
      requestedAtMs: Date.now(),
    };

    try {
      const newSessionId = await forkStoryBranch({
        sessionId,
        sceneNum: forkSceneNum,
        generationId: generationId ?? 0n,
        branchLabel: branchLabel ?? '',
      });
      completeForkNavigation(newSessionId, forkSceneNum);
    } catch (err) {
      pendingForkRef.current = null;
      setForkWaitingForBranch(false);
      setError(friendlyProcedureError(err, 'Fork failed'));
    }
  }, [sessionId, forkConfirm, forkStoryBranch, completeForkNavigation]);

  useEffect(() => {
    const pending = pendingForkRef.current;
    if (!pending) return;

    const newBranch = storyBranches
      .filter(b => {
        if (b.parentSessionId !== pending.parentSessionId) return false;
        if (b.forkSceneNum !== pending.sceneNum) return false;
        const forkedMs = Number((b.forkedAt || b.createdAt) / 1000n);
        if (forkedMs < pending.requestedAtMs - 60_000) return false;
        if (pending.generationId === 0n) {
          return b.forkGenerationId === 0n;
        }
        return b.forkGenerationId !== 0n;
      })
      .sort((a, b) => Number(b.createdAt - a.createdAt))[0];

    if (!newBranch) return;

    completeForkNavigation(newBranch.sessionId, pending.sceneNum);
  }, [storyBranches, completeForkNavigation]);

  useEffect(() => {
    if (!forkWaitingForBranch || pendingForkRef.current == null) return;

    const timer = window.setTimeout(() => {
      if (pendingForkRef.current == null) return;
      pendingForkRef.current = null;
      setForkWaitingForBranch(false);
      setForkConfirm(null);
      setError(
        'Fork is taking longer than expected — check Your stories or refresh'
      );
    }, 45_000);

    return () => window.clearTimeout(timer);
  }, [forkWaitingForBranch]);

  const canForkAtScene = useCallback(
    (targetSceneNum: number) => {
      if (
        sessionId == null ||
        procedurePending ||
        forkWaitingForBranch ||
        forkSettling ||
        session == null
      ) {
        return false;
      }
      if (session.generatingScene !== 0) return false;
      if (targetSceneNum < 1 || targetSceneNum > session.currentScene) {
        return false;
      }
      const canonical = pickCanonicalScene(scenes, targetSceneNum);
      return canonical?.status === 'done';
    },
    [sessionId, procedurePending, forkWaitingForBranch, forkSettling, session, scenes]
  );

  const sessionScenes = useMemo(() => {
    if (sessionId == null) return [];
    const nums = [...new Set(scenes.map(s => s.sceneNum))].sort((a, b) => a - b);
    return nums.map(sceneNumValue => {
      const canonical = pickCanonicalScene(scenes, sceneNumValue);
      return {
        sceneNum: sceneNumValue,
        title: canonical?.title ?? '',
        status: canonical?.status ?? 'pending',
        versionCount: generationCounts.get(sceneNumValue) ?? 0,
      };
    });
  }, [scenes, sessionId, generationCounts]);

  const handleSelectAct = useCallback(
    (num: number) => {
      if (session?.currentScene != null && num < session.currentScene) {
        followLiveRef.current = false;
      } else if (num === session?.currentScene) {
        followLiveRef.current = true;
      }
      setSceneNum(num);
    },
    [session?.currentScene]
  );


  const handleOpenStoryLibrary = useCallback(() => {
    setScreen('story-library');
    setError(null);
  }, []);

  const handleResumeStory = useCallback(
    (targetSessionId: bigint) => {
      const row =
        storyLibrary.find(s => s.sessionId === targetSessionId) ??
        accessibleSessions.find(s => s.sessionId === targetSessionId);
      if (!row) return;

      const resumeScene =
        'resumeScene' in row
          ? row.resumeScene
          : Math.min(row.currentScene, Math.max(row.totalScenes, 1));

      unlockNarrationAudio();
      setSessionId(targetSessionId);
      followLiveRef.current = !('isComplete' in row) || !row.isComplete;
      prevLiveSceneRef.current = null;
      setSceneNum(resumeScene);
      setScreen('scene');
      setError(null);
    },
    [accessibleSessions, storyLibrary]
  );

  const handleBrowseStoryScenes = useCallback(
    (targetSessionId: bigint) => {
      const row =
        storyLibrary.find(s => s.sessionId === targetSessionId) ??
        accessibleSessions.find(s => s.sessionId === targetSessionId);
      if (!row) return;

      const resumeScene =
        'resumeScene' in row
          ? row.resumeScene
          : Math.min(row.currentScene, Math.max(row.totalScenes, 1));

      setSessionId(targetSessionId);
      followLiveRef.current = !('isComplete' in row) || !row.isComplete;
      setSceneNum(resumeScene);
      setScreen('session');
      setError(null);
    },
    [accessibleSessions, storyLibrary]
  );

  return {
    connected,
    identity,
    screen,
    setScreen,
    sessionId,
    sceneNum,
    setSceneNum,
    handleSelectAct,
    autoNarrateRequestId,
    isSubmitting,
    isGenerating,
    isAdvancePending,
    isJoining,
    error,
    session,
    characters,
    scenes,
    sessionScenes,
    generationCounts,
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
    handleRetryPage,
    handleRestoreGeneration,
    handleSwitchBranch,
    requestForkAtScene,
    confirmFork,
    cancelFork,
    forkConfirm,
    canForkAtScene,
    forkPending: forkWaitingForBranch || forkSettling,
    forkConfirmPending: forkWaitingForBranch,
    forkSettling,
    storyBranches,
    rootSessionId,
    handleJoinFromForm,
    handleOpenStoryLibrary,
    handleResumeStory,
    handleBrowseStoryScenes,
    storyLibrary,
  };
}
