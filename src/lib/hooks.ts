import { useMemo } from 'react';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { sessionIdForFilter } from './subscribe';
import type { PanelProps } from '../components/Panel';
import type { CharacterData } from './types';
import {
  buildStoryActs,
  pickCanonicalScene,
  type GenerationRow,
  type StoryAct,
} from './storyActs';

export function useSession(sessionId: bigint | null) {
  const sid = sessionIdForFilter(sessionId);
  const [sessions] = useTable(tables.session.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () =>
      sessionId != null
        ? sessions.find(s => s.sessionId === sessionId)
        : undefined,
    [sessions, sessionId]
  );
}

/** Sessions owned by the connected director (SpacetimeDB view). */
export function useMySessions() {
  const [sessions] = useTable(tables.my_sessions);
  return sessions;
}

/** Online presence for the connected director. */
export function useSelfPresence() {
  const { identity } = useSpacetimeDB();
  const [rows] = useTable(tables.directorPresence);
  return useMemo(() => {
    if (!identity) return undefined;
    const hex = identity.toHexString();
    return rows.find(r => r.identity.toHexString() === hex);
  }, [rows, identity]);
}

/** Story summaries for accessible sessions (SpacetimeDB view). */
export function useStoryLibrary() {
  const [rows] = useTable(tables.story_library);
  return rows;
}

export type StoryBranchRow = {
  sessionId: bigint;
  rootSessionId: bigint;
  parentSessionId: bigint;
  forkSceneNum: number;
  forkGenerationId: bigint;
  branchLabel: string;
  forkedAt: bigint;
  currentScene: number;
  totalScenes: number;
  generatingScene: number;
  isRoot: boolean;
  role: string;
  genre: string;
  setting: string;
  createdAt: bigint;
};

/** All branch rows for accessible sessions (group client-side by rootSessionId). */
export function useAllStoryBranches(): StoryBranchRow[] {
  const [rows] = useTable(tables.story_branches);
  return useMemo(
    () =>
      rows
        .map(r => ({
          sessionId: r.sessionId,
          rootSessionId: r.rootSessionId,
          parentSessionId: r.parentSessionId,
          forkSceneNum: r.forkSceneNum,
          forkGenerationId: r.forkGenerationId,
          branchLabel: r.branchLabel,
          forkedAt: r.forkedAt,
          currentScene: r.currentScene,
          totalScenes: r.totalScenes,
          generatingScene: r.generatingScene,
          isRoot: r.isRoot,
          role: r.role,
          genre: r.genre,
          setting: r.setting,
          createdAt: r.createdAt,
        }))
        .sort((a, b) => {
          if (a.rootSessionId !== b.rootSessionId) {
            return Number(a.rootSessionId - b.rootSessionId);
          }
          if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
          const forkDiff = a.forkSceneNum - b.forkSceneNum;
          if (forkDiff !== 0) return forkDiff;
          return Number(a.createdAt - b.createdAt);
        }),
    [rows]
  );
}

/** Branch lineage for accessible sessions (filter client-side by rootSessionId). */
export function useStoryBranches(rootSessionId: bigint | null): StoryBranchRow[] {
  const [rows] = useTable(tables.story_branches);
  return useMemo(() => {
    if (rootSessionId == null) return [];
    return rows
      .filter(r => r.rootSessionId === rootSessionId)
      .map(r => ({
        sessionId: r.sessionId,
        rootSessionId: r.rootSessionId,
        parentSessionId: r.parentSessionId,
        forkSceneNum: r.forkSceneNum,
        forkGenerationId: r.forkGenerationId,
        branchLabel: r.branchLabel,
        forkedAt: r.forkedAt,
        currentScene: r.currentScene,
        totalScenes: r.totalScenes,
        generatingScene: r.generatingScene,
        isRoot: r.isRoot,
        role: r.role,
        genre: r.genre,
        setting: r.setting,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => {
        if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
        const forkDiff = a.forkSceneNum - b.forkSceneNum;
        if (forkDiff !== 0) return forkDiff;
        return Number(a.createdAt - b.createdAt);
      });
  }, [rows, rootSessionId]);
}

export function useAllSessions() {
  return useAccessibleSessions();
}

/** Sessions owned or co-directed by the connected director. */
export function useAccessibleSessions() {
  const [sessions] = useTable(tables.accessible_sessions);
  return sessions;
}

export function useCoDirectors(sessionId: bigint | null) {
  const sid = sessionIdForFilter(sessionId);
  const [rows] = useTable(tables.coDirector.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () => (sessionId != null ? rows : []),
    [rows, sessionId]
  );
}

export type DirectorOnline = {
  identityHex: string;
  displayName: string;
  online: boolean;
  isSelf: boolean;
  role: 'owner' | 'co-director';
};

export function useSessionDirectorsOnline(
  sessionId: bigint | null
): DirectorOnline[] {
  const { identity } = useSpacetimeDB();
  const session = useSession(sessionId);
  const coDirectors = useCoDirectors(sessionId);
  const [presenceRows] = useTable(tables.directorPresence);

  return useMemo(() => {
    if (!session) return [];
    const selfHex = identity?.toHexString();
    const directors: DirectorOnline[] = [];
    const ownerHex = session.ownerIdentity.toHexString();
    const ownerPresence = presenceRows.find(
      p => p.identity.toHexString() === ownerHex
    );
    directors.push({
      identityHex: ownerHex,
      displayName: ownerPresence?.displayName ?? ownerHex.slice(0, 8),
      online: ownerPresence?.online ?? false,
      isSelf: selfHex === ownerHex,
      role: 'owner',
    });
    for (const cd of coDirectors) {
      const hex = cd.identity.toHexString();
      const pres = presenceRows.find(p => p.identity.toHexString() === hex);
      directors.push({
        identityHex: hex,
        displayName: cd.displayName || pres?.displayName || hex.slice(0, 8),
        online: pres?.online ?? false,
        isSelf: selfHex === hex,
        role: 'co-director',
      });
    }
    return directors;
  }, [session, coDirectors, presenceRows, identity]);
}

export function useSessionRole(
  sessionId: bigint | null
): 'owner' | 'co-director' | null {
  const { identity } = useSpacetimeDB();
  const session = useSession(sessionId);
  const coDirectors = useCoDirectors(sessionId);
  return useMemo(() => {
    if (!identity || sessionId == null || !session) return null;
    const hex = identity.toHexString();
    if (session.ownerIdentity.toHexString() === hex) return 'owner';
    if (coDirectors.some(cd => cd.identity.toHexString() === hex)) {
      return 'co-director';
    }
    return null;
  }, [identity, sessionId, session, coDirectors]);
}

export function useCharacters(sessionId: bigint | null): CharacterData[] {
  const sid = sessionIdForFilter(sessionId);
  const [characters] = useTable(tables.character.where(r => r.sessionId.eq(sid)));
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

export type MemoryEntry = {
  memoryId: bigint;
  charId: bigint;
  sceneNum: number;
  panelNum: number;
  eventText: string;
};

export function useMemories(sessionId: bigint | null): MemoryEntry[] {
  const sid = sessionIdForFilter(sessionId);
  const [memories] = useTable(tables.memory.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () =>
      [...memories]
        .sort(
          (a, b) =>
            a.sceneNum - b.sceneNum ||
            a.panelNum - b.panelNum ||
            Number(a.memoryId - b.memoryId)
        )
        .map(m => ({
          memoryId: m.memoryId,
          charId: m.charId,
          sceneNum: m.sceneNum,
          panelNum: m.panelNum,
          eventText: m.eventText,
        })),
    [memories]
  );
}

export type ActivityEventRow = {
  eventId: bigint;
  sessionId: bigint;
  sceneNum: number;
  kind: string;
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
  createdAt: bigint;
  generationId: bigint;
};

export function useActivityEvents(
  sessionId: bigint | null,
  sceneNum: number,
  generationId?: bigint | null
): ActivityEventRow[] {
  const sid = sessionIdForFilter(sessionId);
  const [events] = useTable(tables.activityEvent.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () =>
      events
        .filter(e => {
          if (e.sceneNum !== sceneNum) return false;
          if (generationId == null || generationId === 0n) return true;
          return e.generationId === generationId || e.generationId === 0n;
        })
        .sort((a, b) => Number(a.eventId - b.eventId))
        .map(e => ({
          eventId: e.eventId,
          sessionId: e.sessionId,
          sceneNum: e.sceneNum,
          kind: e.kind,
          label: e.label,
          detail: e.detail,
          done: e.done,
          active: e.active,
          createdAt: e.createdAt,
          generationId: e.generationId,
        })),
    [events, sceneNum, generationId]
  );
}

export function useScenes(sessionId: bigint | null) {
  const sid = sessionIdForFilter(sessionId);
  const [scenes] = useTable(tables.scene.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () => [...scenes].sort((a, b) => a.sceneNum - b.sceneNum || Number(a.sceneId - b.sceneId)),
    [scenes]
  );
}

export function useIsSceneGenerating(
  sessionId: bigint | null,
  sceneNum: number
): boolean {
  const currentScene = useCurrentScene(sessionId, sceneNum);
  return currentScene?.status === 'generating';
}

export function useStoryActs(
  sessionId: bigint | null,
  totalScenes: number,
  currentSceneNum: number,
  isGenerating: boolean,
  forkPointSceneNum?: number
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
        sessionCurrentScene,
        forkPointSceneNum
      ),
    [
      scenes,
      totalScenes,
      currentSceneNum,
      isGenerating,
      sessionCurrentScene,
      forkPointSceneNum,
    ]
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
  const sid = sessionIdForFilter(sessionId);
  const [panels] = useTable(
    tables.panel.where(r =>
      r.sessionId.eq(sid).and(r.sceneNum.eq(sceneNum))
    )
  );
  return useMemo(
    () =>
      panels
        .filter(p => canonical == null || p.sceneId === canonical.sceneId)
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
  appliedBy: string;
};

export function useSceneDirectives(
  sessionId: bigint | null,
  sceneNum: number
): SceneDirective[] {
  const sid = sessionIdForFilter(sessionId);
  const [directives] = useTable(
    tables.narrativeDirective.where(r =>
      r.sessionId.eq(sid).and(r.appliedAtScene.eq(sceneNum))
    )
  );
  return useMemo(
    () =>
      sessionId == null
        ? []
        : directives.map(d => ({
          directiveId: d.directiveId,
          type: d.type,
          content: d.content,
          appliedAtScene: d.appliedAtScene,
          appliedBy: d.appliedBy,
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

export function useSceneGenerations(
  sessionId: bigint | null,
  sceneNum: number
): GenerationRow[] {
  const sid = sessionIdForFilter(sessionId);
  const [rows] = useTable(
    tables.sceneGeneration.where(r =>
      r.sessionId.eq(sid).and(r.sceneNum.eq(sceneNum))
    )
  );
  return useMemo(
    () =>
      sessionId == null
        ? []
        : [...rows]
            .sort((a, b) => b.generationNum - a.generationNum)
            .map(r => ({
          generationId: r.generationId,
          sessionId: r.sessionId,
          sceneNum: r.sceneNum,
          sourceSceneId: r.sourceSceneId,
          generationNum: r.generationNum,
          kind: r.kind,
          reason: r.reason,
          title: r.title,
          sceneSummary: r.sceneSummary,
          pageImageUrl: r.pageImageUrl,
          narrationAudioUrl: r.narrationAudioUrl,
          narrationSegmentsJson: r.narrationSegmentsJson,
          narrationStatus: r.narrationStatus,
          panelsJson: r.panelsJson,
          status: r.status,
          isCurrent: r.isCurrent,
          createdAt: r.createdAt,
          supersededAt: r.supersededAt,
        })),
    [rows, sessionId, sceneNum]
  );
}

export function useCurrentGeneration(
  sessionId: bigint | null,
  sceneNum: number
): GenerationRow | undefined {
  const generations = useSceneGenerations(sessionId, sceneNum);
  return useMemo(
    () => generations.find(g => g.isCurrent) ?? generations[0],
    [generations]
  );
}

export function useGenerationCounts(
  sessionId: bigint | null
): Map<number, number> {
  const sid = sessionIdForFilter(sessionId);
  const [rows] = useTable(tables.sceneGeneration.where(r => r.sessionId.eq(sid)));
  return useMemo(() => {
    const counts = new Map<number, number>();
    if (sessionId == null) return counts;
    for (const row of rows) {
      if (row.sessionId !== sessionId) continue;
      counts.set(row.sceneNum, (counts.get(row.sceneNum) ?? 0) + 1);
    }
    return counts;
  }, [rows, sessionId]);
}

export type PendingNudgeRow = {
  sessionId: bigint;
  targetScene: number;
  type: string;
  content: string;
  submittedByName: string;
  submittedAt: bigint;
  isSelf: boolean;
};

export function usePendingNudge(sessionId: bigint | null): PendingNudgeRow | null {
  const { identity } = useSpacetimeDB();
  const sid = sessionIdForFilter(sessionId);
  const [rows] = useTable(tables.pendingNudge.where(r => r.sessionId.eq(sid)));
  return useMemo(() => {
    if (sessionId == null) return null;
    const row = rows.find(r => r.sessionId === sessionId);
    if (!row) return null;
    const selfHex = identity?.toHexString();
    return {
      sessionId: row.sessionId,
      targetScene: row.targetScene,
      type: row.type,
      content: row.content,
      submittedByName: row.submittedByName,
      submittedAt: row.submittedAt,
      isSelf:
        selfHex != null &&
        row.submittedBy.toHexString() === selfHex,
    };
  }, [rows, sessionId, identity]);
}

export type NudgeEventRow = {
  eventId: bigint;
  sessionId: bigint;
  targetScene: number;
  kind: string;
  type: string;
  content: string;
  actorName: string;
  detail: string;
  createdAt: bigint;
};

export function useNudgeEvents(sessionId: bigint | null): NudgeEventRow[] {
  const sid = sessionIdForFilter(sessionId);
  const [events] = useTable(tables.nudgeEvent.where(r => r.sessionId.eq(sid)));
  return useMemo(
    () =>
      sessionId == null
        ? []
        : events
            .filter(e => e.sessionId === sessionId)
            .sort((a, b) => Number(a.eventId - b.eventId))
            .map(e => ({
              eventId: e.eventId,
              sessionId: e.sessionId,
              targetScene: e.targetScene,
              kind: e.kind,
              type: e.type,
              content: e.content,
              actorName: e.actorName,
              detail: e.detail,
              createdAt: e.createdAt,
            })),
    [events, sessionId]
  );
}
