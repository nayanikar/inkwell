import { SenderError } from 'spacetimedb/server';
import { logActivity } from './activityLog.js';
import { pickCanonicalScene } from './sessionGuards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

/** Keep history manageable — prune oldest non-current rows beyond this cap. */
const MAX_GENERATIONS_PER_SCENE = 40;

export type GenerationKind =
  | 'initial'
  | 'page_retry'
  | 'script_regen'
  | 'failed_attempt'
  | 'restored'
  | 'fork_origin';

export type PanelSnapshot = {
  panelNum: number;
  caption: string;
  speaker: string;
  dialogue: string;
  imagePrompt: string;
  layoutHint: string;
};

function panelRowsForScene(tx: AnyTx, sceneId: bigint) {
  return [...tx.db.panel.scene_id.filter(sceneId)].sort(
    (a: AnyTx, b: AnyTx) => a.panel_num - b.panel_num
  );
}

function panelsToJson(panels: AnyTx[]): string {
  const snapshots: PanelSnapshot[] = panels.map(p => ({
    panelNum: p.panel_num,
    caption: p.caption ?? '',
    speaker: p.speaker ?? '',
    dialogue: p.dialogue ?? '',
    imagePrompt: p.image_prompt ?? '',
    layoutHint: p.layout_hint ?? 'square',
  }));
  return JSON.stringify(snapshots);
}

function sceneContentFingerprint(
  sceneRow: AnyTx,
  panelsJson: string
): string {
  return JSON.stringify({
    title: sceneRow.title ?? '',
    scene_summary: sceneRow.scene_summary ?? '',
    page_image_url: sceneRow.page_image_url ?? '',
    narration_audio_url: sceneRow.narration_audio_url ?? '',
    narration_segments_json: sceneRow.narration_segments_json ?? '',
    narration_status: sceneRow.narration_status ?? '',
    status: sceneRow.status ?? '',
    panels_json: panelsJson,
  });
}

function latestGenerationForScene(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): AnyTx | undefined {
  const rows = [...tx.db.sceneGeneration.session_id.filter(sessionId)].filter(
    (g: AnyTx) => g.scene_num === sceneNum
  );
  if (rows.length === 0) return undefined;
  return rows.sort(
    (a: AnyTx, b: AnyTx) => b.generation_num - a.generation_num
  )[0];
}

function generationMatchesLiveScene(
  tx: AnyTx,
  sceneId: bigint,
  generation: AnyTx
): boolean {
  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (!sceneRow) return false;
  const panelsJson = panelsToJson(panelRowsForScene(tx, sceneId));
  const liveFp = sceneContentFingerprint(sceneRow, panelsJson);
  const archivedFp = sceneContentFingerprint(
    {
      title: generation.title,
      scene_summary: generation.scene_summary,
      page_image_url: generation.page_image_url,
      narration_audio_url: generation.narration_audio_url,
      narration_segments_json: generation.narration_segments_json,
      narration_status: generation.narration_status,
      status: generation.status,
    },
    generation.panels_json ?? '[]'
  );
  return liveFp === archivedFp;
}

export function pruneSceneGenerationHistory(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): void {
  pruneOldGenerations(tx, sessionId, sceneNum);
}

function pruneOldGenerations(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): void {
  const rows = [...tx.db.sceneGeneration.session_id.filter(sessionId)]
    .filter((g: AnyTx) => g.scene_num === sceneNum)
    .sort((a: AnyTx, b: AnyTx) => b.generation_num - a.generation_num);

  const extras = rows.slice(MAX_GENERATIONS_PER_SCENE);
  for (const gen of extras) {
    if (gen.is_current) continue;
    tx.db.sceneGeneration.delete(gen);
  }
}

export function nextGenerationNum(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): number {
  const rows = [...tx.db.sceneGeneration.session_id.filter(sessionId)].filter(
    (g: AnyTx) => g.scene_num === sceneNum
  );
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((g: AnyTx) => g.generation_num)) + 1;
}

export function supersedeAllCurrentForAct(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): void {
  const now = tx.timestamp.microsSinceUnixEpoch;
  for (const gen of [...tx.db.sceneGeneration.session_id.filter(sessionId)]) {
    if (gen.scene_num === sceneNum && gen.is_current) {
      tx.db.sceneGeneration.generation_id.update({
        ...gen,
        is_current: false,
        superseded_at: now,
      });
    }
  }
}

export function snapshotSceneToGeneration(
  tx: AnyTx,
  sceneId: bigint,
  opts: {
    kind: GenerationKind;
    reason?: string;
    isCurrent?: boolean;
  }
): bigint {
  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (!sceneRow) {
    throw new SenderError('Scene not found for generation snapshot');
  }

  const panels = panelRowsForScene(tx, sceneId);
  const panelsJson = panelsToJson(panels);
  const latest = latestGenerationForScene(
    tx,
    sceneRow.session_id,
    sceneRow.scene_num
  );
  if (latest && generationMatchesLiveScene(tx, sceneId, latest)) {
    return latest.generation_id;
  }

  const generationNum = nextGenerationNum(
    tx,
    sceneRow.session_id,
    sceneRow.scene_num
  );
  const now = tx.timestamp.microsSinceUnixEpoch;
  const isCurrent = opts.isCurrent ?? false;

  const inserted = tx.db.sceneGeneration.insert({
    generation_id: 0n,
    session_id: sceneRow.session_id,
    scene_num: sceneRow.scene_num,
    source_scene_id: sceneId,
    generation_num: generationNum,
    kind: opts.kind,
    reason: opts.reason ?? '',
    title: sceneRow.title,
    scene_summary: sceneRow.scene_summary ?? '',
    page_image_url: sceneRow.page_image_url ?? '',
    narration_audio_url: sceneRow.narration_audio_url ?? '',
    narration_segments_json: sceneRow.narration_segments_json ?? '',
    narration_status: sceneRow.narration_status ?? '',
    panels_json: panelsJson,
    status: sceneRow.status,
    is_current: isCurrent,
    created_at: now,
    superseded_at: isCurrent ? 0n : now,
  });

  pruneOldGenerations(tx, sceneRow.session_id, sceneRow.scene_num);

  return inserted.generation_id;
}

function sceneHasArchivableContent(tx: AnyTx, sceneId: bigint): boolean {
  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (!sceneRow) return false;
  if (sceneRow.page_image_url?.trim()) return true;
  return panelRowsForScene(tx, sceneId).some(
    (p: AnyTx) => p.caption?.trim() || p.dialogue?.trim() || p.speaker?.trim()
  );
}

export function archiveSceneBeforeOverwrite(
  tx: AnyTx,
  sceneId: bigint,
  kind: GenerationKind,
  reason: string
): bigint | null {
  if (!sceneHasArchivableContent(tx, sceneId)) return null;

  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (!sceneRow) return null;

  supersedeAllCurrentForAct(tx, sceneRow.session_id, sceneRow.scene_num);
  return snapshotSceneToGeneration(tx, sceneId, {
    kind,
    reason,
    isCurrent: false,
  });
}

export function recordGenerationOnFinalize(
  tx: AnyTx,
  sceneId: bigint,
  sessionId: bigint,
  sceneNum: number,
  kind: GenerationKind = 'initial'
): bigint {
  supersedeAllCurrentForAct(tx, sessionId, sceneNum);
  const generationId = snapshotSceneToGeneration(tx, sceneId, {
    kind,
    reason: '',
    isCurrent: true,
  });

  const sceneRow = tx.db.scene.scene_id.find(sceneId);
  if (sceneRow) {
    tx.db.scene.scene_id.update({
      ...sceneRow,
      current_generation_id: generationId,
    });
  }

  return generationId;
}

export function panelsFromJson(
  tx: AnyTx,
  sceneId: bigint,
  sessionId: bigint,
  sceneNum: number,
  panelsJson: string
): void {
  for (const panel of [...tx.db.panel.scene_id.filter(sceneId)]) {
    tx.db.panel.delete(panel);
  }

  let parsed: PanelSnapshot[] = [];
  try {
    const raw = JSON.parse(panelsJson) as PanelSnapshot[];
    if (Array.isArray(raw)) parsed = raw;
  } catch {
    parsed = [];
  }

  for (const p of parsed) {
    tx.db.panel.insert({
      panel_id: 0n,
      scene_id: sceneId,
      session_id: sessionId,
      scene_num: sceneNum,
      panel_num: p.panelNum,
      caption: p.caption ?? '',
      speaker: p.speaker ?? '',
      dialogue: p.dialogue ?? '',
      image_prompt: p.imagePrompt ?? '',
      image_url: '',
      layout_hint: p.layoutHint ?? 'square',
      status: 'done',
    });
  }
}

export function restoreGeneration(
  tx: AnyTx,
  sessionId: bigint,
  generationId: bigint,
  actorName: string
): void {
  const target = tx.db.sceneGeneration.generation_id.find(generationId);
  if (!target || target.session_id !== sessionId) {
    throw new SenderError('Generation not found');
  }

  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }

  if (target.scene_num !== sessionRow.current_scene) {
    throw new SenderError('Can only restore the live scene');
  }

  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const sceneRow = pickCanonicalScene(scenes, target.scene_num);
  if (!sceneRow) {
    throw new SenderError('Scene not found');
  }

  if (sceneRow.status === 'generating') {
    throw new SenderError('Scene is still generating');
  }

  if (sceneHasArchivableContent(tx, sceneRow.scene_id)) {
    snapshotSceneToGeneration(tx, sceneRow.scene_id, {
      kind: 'restored',
      reason: `Archived before restore to v${target.generation_num}`,
      isCurrent: false,
    });
  }

  supersedeAllCurrentForAct(tx, sessionId, target.scene_num);

  tx.db.scene.scene_id.update({
    ...sceneRow,
    title: target.title,
    scene_summary: target.scene_summary ?? '',
    page_image_url: target.page_image_url ?? '',
    narration_audio_url: target.narration_audio_url ?? '',
    narration_segments_json: target.narration_segments_json ?? '',
    narration_status: target.narration_status ?? '',
    status: 'done',
    current_generation_id: generationId,
  });

  panelsFromJson(
    tx,
    sceneRow.scene_id,
    sessionId,
    target.scene_num,
    target.panels_json
  );

  tx.db.sceneGeneration.generation_id.update({
    ...target,
    is_current: true,
    superseded_at: 0n,
  });

  logActivity(
    tx,
    sessionId,
    target.scene_num,
    'generation_restored',
    `Restored generation v${target.generation_num}`,
    `${actorName} · ${target.kind}`,
    { done: true },
    generationId
  );
}
