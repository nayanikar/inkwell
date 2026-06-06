import { useMemo } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { PanelProps } from '../components/Panel';
import type { CharacterData } from './types';
import {
  buildStoryActs,
  pickCanonicalScene,
  type StoryAct,
} from './storyActs';

export function useSession(sessionId: bigint | null) {
  const [sessions] = useTable(
    sessionId != null
      ? tables.session.where(r => r.sessionId.eq(sessionId))
      : tables.session
  );
  return useMemo(
    () =>
      sessionId != null
        ? sessions.find(s => s.sessionId === sessionId)
        : undefined,
    [sessions, sessionId]
  );
}

export function useAllSessions() {
  const [sessions] = useTable(tables.session);
  return sessions;
}

export function useCharacters(sessionId: bigint | null): CharacterData[] {
  const [characters] = useTable(
    sessionId != null
      ? tables.character.where(r => r.sessionId.eq(sessionId))
      : tables.character
  );
  return useMemo(
    () =>
      characters.map(c => ({
        charId: c.charId,
        name: c.name,
        archetype: c.archetype,
        personality: c.personality,
        currentMood: c.currentMood,
      })),
    [characters]
  );
}

export function useScenes(sessionId: bigint | null) {
  const [scenes] = useTable(
    sessionId != null
      ? tables.scene.where(r => r.sessionId.eq(sessionId))
      : tables.scene
  );
  return useMemo(
    () => [...scenes].sort((a, b) => a.sceneNum - b.sceneNum || Number(a.sceneId - b.sceneId)),
    [scenes]
  );
}

export function useStoryActs(
  sessionId: bigint | null,
  totalScenes: number,
  currentSceneNum: number,
  isGenerating: boolean
): StoryAct[] {
  const scenes = useScenes(sessionId);
  const session = useSession(sessionId);
  const sessionCurrentScene = session?.currentScene ?? 1;

  return useMemo(
    () =>
      buildStoryActs(
        scenes,
        totalScenes,
        currentSceneNum,
        isGenerating,
        sessionCurrentScene
      ),
    [scenes, totalScenes, currentSceneNum, isGenerating, sessionCurrentScene]
  );
}

function useCanonicalScene(sessionId: bigint | null, sceneNum: number) {
  const scenes = useScenes(sessionId);
  return useMemo(
    () => pickCanonicalScene(scenes, sceneNum),
    [scenes, sceneNum]
  );
}

export function useScenePanels(
  sessionId: bigint | null,
  sceneNum: number
): PanelProps[] {
  const canonical = useCanonicalScene(sessionId, sceneNum);
  const [panels] = useTable(
    sessionId != null
      ? tables.panel.where(r => r.sessionId.eq(sessionId))
      : tables.panel
  );
  return useMemo(
    () =>
      panels
        .filter(
          p =>
            p.sceneNum === sceneNum &&
            (canonical == null || p.sceneId === canonical.sceneId)
        )
        .sort((a, b) => a.panelNum - b.panelNum)
        .map(p => ({
          panelId: p.panelId,
          panelNum: p.panelNum,
          caption: p.caption,
          speaker: p.speaker,
          dialogue: p.dialogue,
          imageUrl: p.imageUrl,
          imagePrompt: p.imagePrompt,
          layoutHint: p.layoutHint,
          status: p.status as 'generating' | 'done' | 'error',
        })),
    [panels, sceneNum, canonical?.sceneId]
  );
}

export type SceneDirective = {
  directiveId: bigint;
  type: string;
  content: string;
  appliedAtScene: number;
};

export function useSceneDirectives(
  sessionId: bigint | null,
  sceneNum: number
): SceneDirective[] {
  const [directives] = useTable(
    sessionId != null
      ? tables.narrativeDirective.where(r => r.sessionId.eq(sessionId))
      : tables.narrativeDirective
  );
  return useMemo(
    () =>
      directives
        .filter(d => d.appliedAtScene === sceneNum)
        .map(d => ({
          directiveId: d.directiveId,
          type: d.type,
          content: d.content,
          appliedAtScene: d.appliedAtScene,
        })),
    [directives, sceneNum]
  );
}

export function useCurrentScene(
  sessionId: bigint | null,
  sceneNum: number
) {
  return useCanonicalScene(sessionId, sceneNum);
}
