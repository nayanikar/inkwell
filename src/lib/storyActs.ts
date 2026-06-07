export type SceneRow = {
  sceneId: bigint;
  sessionId: bigint;
  sceneNum: number;
  title: string;
  sceneSummary?: string | null;
  pageImageUrl?: string | null;
  narrationAudioUrl?: string | null;
  narrationSegmentsJson?: string | null;
  narrationStatus?: string | null;
  currentGenerationId?: bigint | null;
  status: string;
};

export type GenerationRow = {
  generationId: bigint;
  sessionId: bigint;
  sceneNum: number;
  sourceSceneId: bigint;
  generationNum: number;
  kind: string;
  reason: string;
  title: string;
  sceneSummary: string;
  pageImageUrl: string;
  narrationAudioUrl: string;
  narrationSegmentsJson: string;
  narrationStatus: string;
  panelsJson: string;
  status: string;
  isCurrent: boolean;
  createdAt: bigint;
  supersededAt: bigint;
};

export type GenerationPanelSnapshot = {
  panelNum: number;
  caption: string;
  speaker: string;
  dialogue: string;
  imagePrompt: string;
  layoutHint: string;
};

export function parseGenerationPanels(
  panelsJson: string | null | undefined
): GenerationPanelSnapshot[] {
  if (!panelsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(panelsJson) as GenerationPanelSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => typeof p.panelNum === 'number');
  } catch {
    return [];
  }
}

export function generationPanelsToDisplay(
  snapshots: GenerationPanelSnapshot[]
): import('../components/Panel').PanelProps[] {
  return snapshots.map(p => ({
    panelNum: p.panelNum,
    caption: p.caption,
    speaker: p.speaker,
    dialogue: p.dialogue,
    imagePrompt: p.imagePrompt,
    layoutHint: p.layoutHint,
    imageUrl: '',
    status: 'done' as const,
  }));
}

export const GENERATION_KIND_LABELS: Record<string, string> = {
  initial: 'First generation',
  page_retry: 'Page retry',
  script_regen: 'Script regen',
  failed_attempt: 'Failed attempt',
  restored: 'Restored',
  fork_origin: 'Fork origin',
};

export type StoryAct = {
  sceneNum: number;
  sceneId?: bigint;
  title: string;
  status: 'done' | 'generating' | 'upcoming' | 'pending';
  isForkPoint?: boolean;
};

export function pickCanonicalScene(
  scenes: SceneRow[],
  sceneNum: number
): SceneRow | undefined {
  const candidates = scenes.filter(s => s.sceneNum === sceneNum);
  if (candidates.length === 0) return undefined;

  const done = candidates
    .filter(s => s.status === 'done')
    .sort((a, b) => Number(b.sceneId - a.sceneId));
  if (done.length > 0) return done[0];

  return [...candidates].sort((a, b) => Number(b.sceneId - a.sceneId))[0];
}

export function buildStoryActs(
  scenes: SceneRow[],
  totalScenes: number,
  currentSceneNum: number,
  isGenerating: boolean,
  sessionCurrentScene: number,
  forkPointSceneNum?: number
): StoryAct[] {
  const acts: StoryAct[] = [];

  for (let n = 1; n <= totalScenes; n++) {
    const canonical = pickCanonicalScene(scenes, n);
    let status: StoryAct['status'];

    if (canonical?.status === 'done') {
      status = 'done';
    } else if (
      canonical?.status === 'generating' ||
      (isGenerating &&
        n === currentSceneNum &&
        canonical?.status !== 'done')
    ) {
      status = 'generating';
    } else if (n <= sessionCurrentScene && !canonical) {
      status = 'pending';
    } else {
      status = 'upcoming';
    }

    acts.push({
      sceneNum: n,
      sceneId: canonical?.sceneId,
      title: canonical?.title ?? '',
      status,
      isForkPoint:
        forkPointSceneNum != null &&
        forkPointSceneNum > 0 &&
        n === forkPointSceneNum,
    });
  }

  return acts;
}
