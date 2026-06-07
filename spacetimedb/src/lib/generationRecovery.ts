import { SenderError } from 'spacetimedb/server';
import { pickCanonicalScene } from './sessionGuards.js';
import {
  claimGenerationLock,
  releaseGenerationLock,
} from './nudgeCoordination.js';
import { logActivity } from './activityLog.js';
import { maybeFinalizeScene } from './sceneFinalize.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

type ResumePlan =
  | { action: 'none' }
  | { action: 'released' }
  | { action: 'full'; sceneNum: number }
  | { action: 'page_only'; sceneId: bigint; sceneNum: number }
  | { action: 'page_retry'; sceneId: bigint; sceneNum: number }
  | { action: 'finalize'; sceneId: bigint; sceneNum: number };

function panelCount(tx: AnyCtx, sceneId: bigint): number {
  return [...tx.db.panel.scene_id.filter(sceneId)].length;
}

const PAGE_DRAW_KINDS = new Set([
  'page_image_start',
  'page_image_done',
  'page_image_error',
  'page_retry_start',
  'page_retry_done',
  'page_retry_failed',
]);

/** True when the latest page-draw activity for this scene is still in flight. */
export function isPageImageInFlight(
  tx: AnyCtx,
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

export function planGenerationResume(
  tx: AnyCtx,
  sessionId: bigint
): ResumePlan {
  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }

  let sceneNum = sessionRow.generating_scene;
  if (sceneNum === 0) {
    const scenes = [...tx.db.scene.session_id.filter(sessionId)];
    const current = pickCanonicalScene(scenes, sessionRow.current_scene);
    if (current?.status === 'generating') {
      sceneNum = sessionRow.current_scene;
    } else {
      return { action: 'none' };
    }
  }

  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const canonical = pickCanonicalScene(scenes, sceneNum);
  const freshSession = tx.db.session.session_id.find(sessionId)!;

  if (!canonical) {
    if (freshSession.generating_scene === 0) {
      claimGenerationLock(tx, freshSession, sceneNum);
    }
    return { action: 'full', sceneNum };
  }

  if (canonical.status === 'done') {
    releaseGenerationLock(tx, sessionId);
    return { action: 'released' };
  }

  if (canonical.status === 'error') {
    return { action: 'none' };
  }

  const panels = panelCount(tx, canonical.scene_id);
  if (panels === 0) {
    if (freshSession.generating_scene === 0) {
      claimGenerationLock(tx, freshSession, sceneNum);
    }
    return { action: 'full', sceneNum };
  }

  const recentManualRetry = [...tx.db.activityEvent.session_id.filter(sessionId)]
    .filter(
      (e: { scene_num: number; kind: string; created_at: bigint }) =>
        e.scene_num === sceneNum && e.kind === 'page_retry_requested'
    )
    .sort(
      (a: { created_at: bigint }, b: { created_at: bigint }) =>
        Number(b.created_at - a.created_at)
    )[0];
  const now = tx.timestamp.microsSinceUnixEpoch;
  if (
    recentManualRetry &&
    now - recentManualRetry.created_at < 120_000_000n
  ) {
    return { action: 'none' };
  }

  if (isPageImageInFlight(tx, sessionId, sceneNum)) {
    return { action: 'none' };
  }

  if (!canonical.page_image_url?.trim()) {
    return {
      action: 'page_only',
      sceneId: canonical.scene_id,
      sceneNum,
    };
  }

  maybeFinalizeScene(tx, canonical.scene_id, sessionId, sceneNum);
  const afterScene = tx.db.scene.scene_id.find(canonical.scene_id);
  const afterSession = tx.db.session.session_id.find(sessionId);
  if (afterScene?.status === 'done' && afterSession && afterSession.generating_scene !== 0) {
    releaseGenerationLock(tx, sessionId);
  }
  return { action: 'finalize', sceneId: canonical.scene_id, sceneNum };
}

export function logGenerationResume(
  ctx: AnyCtx,
  sessionId: bigint,
  plan: ResumePlan
): void {
  if (plan.action === 'none' || plan.action === 'released') return;
  ctx.withTx((tx: AnyCtx) => {
    logActivity(
      tx,
      sessionId,
      'sceneNum' in plan ? plan.sceneNum : 0,
      'generation_resume',
      'resume_generation · continuing server work',
      plan.action,
      { done: true }
    );
  });
}
