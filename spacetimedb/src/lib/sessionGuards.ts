import { SenderError, type Random } from 'spacetimedb/server';

export function pickCanonicalScene<
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

export function isSessionOwner<
  T extends { owner_identity: { toHexString(): string } },
>(sessionRow: T, sender: { toHexString(): string }): boolean {
  return sessionRow.owner_identity.toHexString() === sender.toHexString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findCoDirectorRow(db: any, sessionId: bigint, sender: { toHexString(): string }) {
  for (const row of db.coDirector.session_id.filter(sessionId)) {
    if (row.identity.toHexString() === sender.toHexString()) {
      return row;
    }
  }
  return null;
}

export function assertSessionOwner<
  T extends { owner_identity: { toHexString(): string } },
>(
  sessionRow: T | null | undefined,
  sender: { toHexString(): string }
): T {
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }
  if (!isSessionOwner(sessionRow, sender)) {
    throw new SenderError('Not authorized for this session');
  }
  return sessionRow;
}

export function assertSessionDirector<
  T extends { owner_identity: { toHexString(): string }; session_id: bigint },
>(
  sessionRow: T | null | undefined,
  sender: { toHexString(): string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): T {
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }
  if (isSessionOwner(sessionRow, sender)) {
    return sessionRow;
  }
  if (findCoDirectorRow(db, sessionRow.session_id, sender)) {
    return sessionRow;
  }
  throw new SenderError('Not authorized for this session');
}

export function directorDisplayName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  sender: { toHexString(): string }
): string {
  const presence = ctx.db.directorPresence.identity.find(sender);
  return presence?.display_name ?? sender.toHexString().slice(0, 8);
}

export function generateInviteCode(ctx: { random: Random }): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[ctx.random.integerInRange(0, chars.length - 1)];
  }
  return code;
}

export function assertCurrentSceneComplete(
  tx: { db: { scene: { session_id: { filter(id: bigint): Iterable<{ scene_num: number; scene_id: bigint; status: string }> } } } },
  sessionId: bigint,
  currentScene: number
): void {
  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const canonical = pickCanonicalScene(scenes, currentScene);
  if (!canonical || canonical.status !== 'done') {
    throw new SenderError(
      'Current scene is still generating — wait for the scene to finish'
    );
  }
}

export function assertNotGenerating(
  tx: { db: { scene: { session_id: { filter(id: bigint): Iterable<{ scene_num: number; scene_id: bigint; status: string }> } } } },
  sessionId: bigint,
  sceneNum: number
): void {
  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const row = pickCanonicalScene(scenes, sceneNum);
  if (row?.status === 'generating') {
    throw new SenderError(
      'Another director just advanced — wait for panels to finish'
    );
  }
}
