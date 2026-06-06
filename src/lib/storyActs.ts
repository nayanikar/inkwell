export type SceneRow = {
  sceneId: bigint;
  sessionId: bigint;
  sceneNum: number;
  title: string;
  sceneSummary?: string | null;
  status: string;
};

export type StoryAct = {
  sceneNum: number;
  sceneId?: bigint;
  title: string;
  status: 'done' | 'generating' | 'upcoming' | 'pending';
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
  sessionCurrentScene: number
): StoryAct[] {
  const acts: StoryAct[] = [];

  for (let n = 1; n <= totalScenes; n++) {
    const canonical = pickCanonicalScene(scenes, n);
    let status: StoryAct['status'];

    if (canonical?.status === 'done') {
      status = 'done';
    } else if (
      canonical?.status === 'generating' ||
      (isGenerating && n === currentSceneNum)
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
    });
  }

  return acts;
}
