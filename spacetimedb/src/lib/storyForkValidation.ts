// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

const PAGE_DRAW_KINDS = new Set([
  'page_image_start',
  'page_image_done',
  'page_image_error',
  'page_retry_start',
  'page_retry_done',
  'page_retry_failed',
]);

function pickCanonicalScene<
  T extends { scene_id: bigint; scene_num: number; status: string },
>(scenes: T[], sceneNum: number): T | undefined {
  const candidates = scenes.filter(s => s.scene_num === sceneNum);
  if (candidates.length === 0) return undefined;
  const done = candidates
    .filter(s => s.status === 'done')
    .sort((a, b) => Number(b.scene_id - a.scene_id));
  if (done.length > 0) return done[0];
  return candidates.sort((a, b) => Number(b.scene_id - a.scene_id))[0];
}

function isPageImageInFlight(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): boolean {
  const latest = [...tx.db.activityEvent.session_id.filter(sessionId)]
    .filter(
      (e: { scene_num: number; kind: string }) =>
        e.scene_num === sceneNum && PAGE_DRAW_KINDS.has(e.kind)
    )
    .sort(
      (a: { created_at: bigint }, b: { created_at: bigint }) =>
        Number(b.created_at - a.created_at)
    )[0];
  if (!latest) return false;
  return latest.kind === 'page_image_start' || latest.kind === 'page_retry_start';
}

/** Returns a user-facing error message, or null when fork is allowed. */
export function getForkPreconditionError(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number,
  generationId: bigint
): string | null {
  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (!sessionRow) {
    return 'Session not found';
  }

  if (sessionRow.generating_scene !== 0) {
    return 'Cannot fork while a scene is generating';
  }

  if (isPageImageInFlight(tx, sessionId, sessionRow.current_scene)) {
    return 'Cannot fork while page image is in flight';
  }

  if (sceneNum < 1 || sceneNum > sessionRow.current_scene) {
    return 'Invalid fork scene — must be a completed act';
  }

  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const canonical = pickCanonicalScene(scenes, sceneNum);
  if (!canonical) {
    return 'Scene not found';
  }
  if (canonical.status !== 'done') {
    return 'Finish or retry this scene before forking';
  }

  if (generationId !== 0n) {
    const gen = tx.db.sceneGeneration.generation_id.find(generationId);
    if (!gen || gen.session_id !== sessionId || gen.scene_num !== sceneNum) {
      return 'Generation not found for this scene';
    }
  }

  return null;
}

export function effectiveRootSessionId(sessionRow: {
  root_session_id?: bigint;
  session_id: bigint;
}): bigint {
  const root = sessionRow.root_session_id ?? 0n;
  return root !== 0n ? root : sessionRow.session_id;
}
