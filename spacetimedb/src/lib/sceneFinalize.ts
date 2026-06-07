import type { SceneJson } from './types.js';
import { logActivity } from './activityLog.js';
import { buildVisualContextJson } from './sceneVisualContext.js';
import { releaseGenerationLock } from './nudgeCoordination.js';
import {
  archiveSceneBeforeOverwrite,
  recordGenerationOnFinalize,
} from './generationArchive.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

export function persistPendingFinalize(
  tx: AnyTx,
  sceneId: bigint,
  sessionId: bigint,
  sceneNum: number,
  sceneJson: SceneJson
): void {
  const existing = tx.db.scenePendingFinalize.scene_id.find(sceneId);
  if (existing) {
    tx.db.scenePendingFinalize.delete(existing);
  }

  tx.db.scenePendingFinalize.insert({
    scene_id: sceneId,
    session_id: sessionId,
    scene_num: sceneNum,
    mood_updates_json: JSON.stringify(sceneJson.character_updates ?? []),
    memories_json: JSON.stringify(sceneJson.new_memories ?? []),
    visual_context_json: buildVisualContextJson(sceneJson),
  });
}

function pageImageReady(tx: AnyTx, sceneId: bigint): boolean {
  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  return !!sceneRow?.page_image_url?.trim();
}

function markAllPanelsDone(tx: AnyTx, sceneId: bigint): void {
  for (const panel of [...tx.db.panel.scene_id.filter(sceneId)]) {
    if (panel.status !== 'done') {
      tx.db.panel.panel_id.update({ ...panel, status: 'done' });
    }
  }
}

function markAllPanelsError(tx: AnyTx, sceneId: bigint): void {
  for (const panel of [...tx.db.panel.scene_id.filter(sceneId)]) {
    if (panel.status !== 'error') {
      tx.db.panel.panel_id.update({ ...panel, status: 'error' });
    }
  }
}

function clearPendingFinalize(tx: AnyTx, sceneId: bigint): void {
  const pending = tx.db.scenePendingFinalize.scene_id.find(sceneId);
  if (pending) {
    tx.db.scenePendingFinalize.delete(pending);
  }
}

export function maybeFinalizeScene(
  tx: AnyTx,
  sceneId: bigint,
  sessionId: bigint,
  sceneNum: number,
  generationKind: 'initial' | 'page_retry' = 'initial'
): void {
  if (!pageImageReady(tx, sceneId)) return;

  const pending = tx.db.scenePendingFinalize.scene_id.find(sceneId);
  if (!pending) return;

  markAllPanelsDone(tx, sceneId);

  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (sceneRow) {
    tx.db.scene.scene_id.update({ ...sceneRow, status: 'done' });
  }

  const moodUpdates = JSON.parse(pending.mood_updates_json) as {
    char_id: number;
    new_mood: string;
  }[];
  for (const update of moodUpdates) {
    const charId = BigInt(update.char_id);
    const row = tx.db.character.char_id.find(charId);
    if (row) {
      tx.db.character.char_id.update({
        ...row,
        current_mood: update.new_mood,
      });
    }
  }

  const memories = JSON.parse(pending.memories_json) as {
    char_id: number;
    panel_num: number;
    event_text: string;
  }[];
  for (const mem of memories) {
    tx.db.memory.insert({
      memory_id: 0n,
      char_id: BigInt(mem.char_id),
      session_id: sessionId,
      scene_num: sceneNum,
      panel_num: mem.panel_num,
      event_text: mem.event_text,
    });
  }

  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (sessionRow && sessionRow.status === 'setup') {
    tx.db.session.session_id.update({
      ...sessionRow,
      status: 'running',
    });
  }

  tx.db.scenePendingFinalize.delete(pending);

  releaseGenerationLock(tx, sessionId);

  const generationId = recordGenerationOnFinalize(
    tx,
    sceneId,
    sessionId,
    sceneNum,
    generationKind
  );

  logActivity(
    tx,
    sessionId,
    sceneNum,
    'scene_done',
    'scene row updated · status=done',
    `character mood + ${memories.length} memory row(s) written`,
    { done: true },
    generationId
  );
}

export function markScenePageError(
  tx: AnyTx,
  sceneId: bigint,
  sessionId: bigint,
  sceneNum: number,
  detail: string,
  opts?: { skipArchive?: boolean }
): void {
  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (!opts?.skipArchive && sceneRow?.page_image_url?.trim()) {
    archiveSceneBeforeOverwrite(
      tx,
      sceneId,
      'failed_attempt',
      detail.slice(0, 120)
    );
  }
  if (sceneRow && sceneRow.status !== 'done') {
    tx.db.scene.scene_id.update({ ...sceneRow, status: 'error' });
  }
  markAllPanelsError(tx, sceneId);
  releaseGenerationLock(tx, sessionId);
  logActivity(
    tx,
    sessionId,
    sceneNum,
    'scene_done',
    'scene row updated',
    `status=error · ${detail.slice(0, 120)}`,
    { done: false }
  );
}

/** Claude/script failure — release lock so the session can advance or retry. */
export function markSceneScriptError(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number,
  detail: string
): void {
  const scenes = [...tx.db.scene.session_id.filter(sessionId)].filter(
    (s: AnyTx) => s.scene_num === sceneNum
  );

  for (const sceneRow of scenes) {
    if (sceneRow.status === 'done') continue;
    clearPendingFinalize(tx, sceneRow.scene_id);
    for (const panel of [...tx.db.panel.scene_id.filter(sceneRow.scene_id)]) {
      tx.db.panel.delete(panel);
    }
    tx.db.scene.scene_id.update({
      ...sceneRow,
      title: sceneRow.title?.trim() ? sceneRow.title : 'Generation failed',
      status: 'error',
    });
  }

  releaseGenerationLock(tx, sessionId);

  logActivity(
    tx,
    sessionId,
    sceneNum,
    'claude_error',
    'scene script generation failed',
    detail.slice(0, 120),
    { done: false }
  );
}
