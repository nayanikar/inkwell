import { isSessionOwner, pickCanonicalScene } from './sessionGuards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

export function accessibleSessions(ctx: AnyCtx): AnyCtx[] {
  const owned = [...ctx.db.session.owner_identity.filter(ctx.sender)];
  const coRows = [...ctx.db.coDirector.identity.filter(ctx.sender)];
  const coSessions = coRows
    .map((r: AnyCtx) => ctx.db.session.session_id.find(r.session_id))
    .filter((s: AnyCtx | undefined) => s != null);

  const seen = new Set<string>();
  const result: AnyCtx[] = [];
  for (const row of [...owned, ...coSessions]) {
    const key = row.session_id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  }
  return result;
}

function effectiveRootId(sessionRow: AnyCtx): bigint {
  const root = sessionRow.root_session_id ?? 0n;
  return root !== 0n ? root : sessionRow.session_id;
}

function pickCoverImageUrl(scenes: AnyCtx[], currentScene: number): string {
  const nums = [
    currentScene,
    1,
    ...[...new Set(scenes.map((s: AnyCtx) => s.scene_num))].sort((a, b) => b - a),
  ];

  for (const sceneNum of nums) {
    const canonical = pickCanonicalScene(scenes, sceneNum);
    const url = canonical?.page_image_url?.trim();
    if (url) return url;
  }
  return '';
}

function countDoneScenes(scenes: AnyCtx[]): number {
  const nums = [...new Set(scenes.map((s: AnyCtx) => s.scene_num))] as number[];
  let done = 0;
  for (const sceneNum of nums) {
    const canonical = pickCanonicalScene(scenes, sceneNum);
    if (canonical?.status === 'done') done++;
  }
  return done;
}

function countBranchesInRoot(allAccessible: AnyCtx[], rootId: bigint): number {
  return allAccessible.filter(
    (s: AnyCtx) => effectiveRootId(s) === rootId
  ).length;
}

export function buildStoryLibrary(ctx: AnyCtx): AnyCtx[] {
  const allAccessible = accessibleSessions(ctx);
  const entries: AnyCtx[] = [];

  for (const sessionRow of allAccessible) {
    const sessionId = sessionRow.session_id;
    const scenes = [...ctx.db.scene.session_id.filter(sessionId)];
    const role = isSessionOwner(sessionRow, ctx.sender) ? 'owner' : 'co-director';
    const scenesDone = countDoneScenes(scenes);
    const resumeScene = Math.min(
      sessionRow.current_scene,
      Math.max(sessionRow.total_scenes, 1)
    );
    const isComplete =
      sessionRow.status === 'done' ||
      sessionRow.current_scene >= sessionRow.total_scenes;
    const cover = pickCoverImageUrl(scenes, resumeScene);
    const rootId = effectiveRootId(sessionRow);
    const parentId = sessionRow.parent_session_id ?? 0n;

    entries.push({
      session_id: sessionId,
      genre: sessionRow.genre,
      setting: sessionRow.setting,
      status: sessionRow.status,
      current_scene: sessionRow.current_scene,
      total_scenes: sessionRow.total_scenes,
      generating_scene: sessionRow.generating_scene,
      resume_scene: resumeScene,
      scenes_done: scenesDone,
      is_complete: isComplete,
      is_generating: sessionRow.generating_scene !== 0,
      role,
      cover_page_image_url: cover,
      created_at: sessionRow.created_at,
      root_session_id: rootId,
      parent_session_id: parentId,
      fork_scene_num: sessionRow.fork_scene_num ?? 0,
      branch_label: sessionRow.branch_label ?? '',
      forked_at: sessionRow.forked_at ?? 0n,
      is_fork: parentId !== 0n,
      branch_count: countBranchesInRoot(allAccessible, rootId),
    });
  }

  entries.sort((a, b) => Number(b.created_at - a.created_at));
  return entries;
}

export function buildStoryBranches(ctx: AnyCtx): AnyCtx[] {
  const allAccessible = accessibleSessions(ctx);
  const entries: AnyCtx[] = [];

  for (const sessionRow of allAccessible) {
    const rootId = effectiveRootId(sessionRow);
    const parentId = sessionRow.parent_session_id ?? 0n;
    const role = isSessionOwner(sessionRow, ctx.sender) ? 'owner' : 'co-director';

    entries.push({
      session_id: sessionRow.session_id,
      root_session_id: rootId,
      parent_session_id: parentId,
      fork_scene_num: sessionRow.fork_scene_num ?? 0,
      fork_generation_id: sessionRow.fork_generation_id ?? 0n,
      branch_label: sessionRow.branch_label ?? '',
      forked_at: sessionRow.forked_at ?? 0n,
      current_scene: sessionRow.current_scene,
      total_scenes: sessionRow.total_scenes,
      generating_scene: sessionRow.generating_scene,
      is_root: sessionRow.session_id === rootId,
      role,
      genre: sessionRow.genre,
      setting: sessionRow.setting,
      created_at: sessionRow.created_at,
    });
  }

  entries.sort((a, b) => {
    const forkDiff = a.fork_scene_num - b.fork_scene_num;
    if (forkDiff !== 0) return forkDiff;
    return Number(a.created_at - b.created_at);
  });

  return entries;
}
