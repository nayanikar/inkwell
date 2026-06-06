import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useReducer, useProcedure } from 'spacetimedb/react';
import { reducers, procedures, type DbConnection } from '../module_bindings';
import type { SetupFormData } from '../screens/SetupScreen';
import {
  useSession,
  useCharacters,
  useScenes,
  useScenePanels,
  useCurrentScene,
  useAllSessions,
  useStoryActs,
} from '../lib/hooks';
import { subscribeToSession, subscribeToAllSessions } from '../lib/stdb';
import {
  loadSavedSession,
  saveSessionProgress,
  clearSavedSession,
  type SavedSession,
} from '../lib/savedSession';

export type InkwellScreen = 'landing' | 'setup' | 'scene' | 'session';

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

export function useInkwellSession() {
  const { isActive: connected, getConnection } = useSpacetimeDB();
  const createSession = useReducer(reducers.createSession);
  const applyNudge = useReducer(reducers.applyNudge);
  const advanceScene = useReducer(reducers.advanceScene);
  const generateScene = useProcedure(procedures.generateScene);

  const [screen, setScreen] = useState<InkwellScreen>('landing');
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [sceneNum, setSceneNum] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useMockPreview, setUseMockPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = useSession(sessionId);
  const allSessions = useAllSessions();
  const characters = useCharacters(sessionId);
  const scenes = useScenes(sessionId);
  const storyActs = useStoryActs(
    sessionId,
    session?.totalScenes ?? 6,
    sceneNum,
    isGenerating
  );
  const panels = useScenePanels(sessionId, sceneNum);
  const currentScene = useCurrentScene(sessionId, sceneNum);

  useEffect(() => {
    if (!connected) return;
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    subscribeToAllSessions(conn);
  }, [connected, getConnection]);

  useEffect(() => {
    if (sessionId == null || !connected) return;
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    subscribeToSession(conn, sessionId);
  }, [sessionId, getConnection, connected]);

  useEffect(() => {
    if (sessionId == null || useMockPreview || !session) return;
    if (session.status === 'done') {
      clearSavedSession();
      return;
    }
    saveSessionProgress({
      sessionId: sessionId.toString(),
      sceneNum,
      genre: session.genre,
      setting: session.setting,
    });
  }, [sessionId, sceneNum, useMockPreview, session?.genre, session?.setting, session?.status]);

  const savedSession: SavedSession | null = useMemo(() => {
    const saved = loadSavedSession();
    if (!saved) return null;
    const id = BigInt(saved.sessionId);
    const row = allSessions.find(s => s.sessionId === id);
    if (!row || row.status === 'done') return null;
    return {
      ...saved,
      genre: row.genre,
      setting: row.setting,
    };
  }, [allSessions]);

  const handleGoHome = () => {
    if (sessionId != null && !useMockPreview && session) {
      saveSessionProgress({
        sessionId: sessionId.toString(),
        sceneNum,
        genre: session.genre,
        setting: session.setting,
      });
    }
    setScreen('landing');
    setSessionId(null);
    setUseMockPreview(false);
    setError(null);
  };

  const handleContinueStory = () => {
    const saved = loadSavedSession();
    if (!saved) return;
    const id = BigInt(saved.sessionId);
    if (!allSessions.some(s => s.sessionId === id)) return;

    setSessionId(id);
    setSceneNum(saved.sceneNum);
    setUseMockPreview(false);
    setScreen('scene');
    setError(null);

    const conn = getConnection() as DbConnection | null;
    if (conn) subscribeToSession(conn, id);
  };

  const handleStart = async (data: SetupFormData) => {
    setIsSubmitting(true);
    setUseMockPreview(false);
    setError(null);
    try {
      const connBefore = getConnection() as DbConnection | null;
      const beforeMax =
        connBefore != null
          ? [...connBefore.db.session.iter()].reduce<bigint>(
              (max, s) => (s.sessionId > max ? s.sessionId : max),
              0n
            )
          : 0n;

      try {
        await createSession({
          genre: data.genre,
          setting: data.setting,
          totalScenes: data.totalScenes,
          characters: data.characters.map(c => ({
            name: c.name,
            archetype: c.archetype,
            personality: c.personality,
            currentMood: c.currentMood,
            secret: c.secret,
          })),
        });
      } catch (err) {
        throw new Error(
          `Could not create session: ${formatError(err, 'reducer failed')}`
        );
      }

      let newSessionId: bigint | null = null;
      for (let i = 0; i < 100; i++) {
        await new Promise(r => setTimeout(r, 100));
        const conn = getConnection() as DbConnection | null;
        if (!conn) continue;
        const created = [...conn.db.session.iter()].find(
          s => s.sessionId > beforeMax
        );
        if (created) {
          newSessionId = created.sessionId;
          break;
        }
      }

      if (newSessionId == null) {
        throw new Error(
          'Session was not created — check SpacetimeDB connection and try again.'
        );
      }

      setSessionId(newSessionId);
      setSceneNum(1);
      const conn = getConnection() as DbConnection | null;
      if (conn) subscribeToSession(conn, newSessionId);

      setScreen('scene');
      setIsGenerating(true);
      try {
        await generateScene({ sessionId: newSessionId, sceneNum: 1 });
      } catch (err) {
        throw new Error(
          `Scene generation failed: ${formatError(err, 'procedure failed')}`
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to start session';
      console.error('Failed to start session:', err);
      setError(message);
    } finally {
      setIsSubmitting(false);
      setIsGenerating(false);
    }
  };

  const handleNudge = async (type: string, content: string) => {
    if (sessionId == null || !session || useMockPreview) return;
    if (sceneNum !== session.currentScene) return;
    if (session.currentScene >= session.totalScenes || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);
      await applyNudge({ sessionId, type, content });
      await advanceScene({ sessionId });
      const nextNum = sceneNum + 1;
      setSceneNum(nextNum);
      await generateScene({ sessionId, sceneNum: nextNum });
    } catch (err) {
      setError(formatError(err, 'Nudge failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNextScene = async () => {
    if (sessionId == null || !session || useMockPreview) return;
    if (sceneNum !== session.currentScene) return;
    if (session.currentScene >= session.totalScenes || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);
      await advanceScene({ sessionId });
      const nextNum = sceneNum + 1;
      setSceneNum(nextNum);
      await generateScene({ sessionId, sceneNum: nextNum });
    } catch (err) {
      setError(formatError(err, 'Advance scene failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreviewScene = () => {
    setUseMockPreview(true);
    setSessionId(1n);
    setSceneNum(1);
    setScreen('scene');
    setError(null);
  };

  return {
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
  };
}
