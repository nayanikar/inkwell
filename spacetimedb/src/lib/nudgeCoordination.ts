import { SenderError } from 'spacetimedb/server';
import { logActivity } from './activityLog.js';
import { pickCanonicalScene } from './sessionGuards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

export type ResolvedNudge = {
  type: string;
  content: string;
  appliedBy: string;
};

export function targetSceneForNudge(sessionRow: { current_scene: number }): number {
  return sessionRow.current_scene + 1;
}

function timestampMicros(ctx: { timestamp: { microsSinceUnixEpoch: bigint } }): bigint {
  return ctx.timestamp.microsSinceUnixEpoch;
}

export function replaceDirectiveForScene(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number,
  directive: { type: string; content: string; appliedBy: string }
): void {
  for (const row of [...tx.db.narrativeDirective.session_id.filter(sessionId)]) {
    if (row.applied_at_scene === sceneNum) {
      tx.db.narrativeDirective.delete(row);
    }
  }
  tx.db.narrativeDirective.insert({
    directive_id: 0n,
    session_id: sessionId,
    type: directive.type,
    content: directive.content,
    applied_at_scene: sceneNum,
    applied_by: directive.appliedBy,
  });
}

export function logNudgeEvent(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number,
  kind: string,
  type: string,
  content: string,
  actorName: string,
  detail: string
): void {
  tx.db.nudgeEvent.insert({
    event_id: 0n,
    session_id: sessionId,
    target_scene: targetScene,
    kind,
    type,
    content,
    actor_name: actorName,
    detail,
    created_at: timestampMicros(tx),
  });
}

export function upsertPendingNudge(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number,
  sender: { toHexString(): string },
  type: string,
  content: string,
  displayName: string
): void {
  const existing = tx.db.pendingNudge.session_id.find(sessionId);
  if (existing) {
    const sameSender =
      existing.submitted_by.toHexString() === sender.toHexString();
    if (
      !sameSender &&
      (existing.content !== content || existing.type !== type)
    ) {
      logNudgeEvent(
        tx,
        sessionId,
        targetScene,
        'superseded',
        existing.type,
        existing.content,
        existing.submitted_by_name,
        `Replaced by ${displayName}`
      );
      logActivity(
        tx,
        sessionId,
        targetScene,
        'nudge_superseded',
        'submit_nudge · pending nudge superseded',
        `${existing.submitted_by_name} → ${displayName}`,
        { done: true }
      );
    }
    tx.db.pendingNudge.session_id.update({
      ...existing,
      target_scene: targetScene,
      type,
      content,
      submitted_by: sender,
      submitted_by_name: displayName,
      submitted_at: timestampMicros(tx),
    });
  } else {
    tx.db.pendingNudge.insert({
      session_id: sessionId,
      target_scene: targetScene,
      type,
      content,
      submitted_by: sender,
      submitted_by_name: displayName,
      submitted_at: timestampMicros(tx),
    });
  }

  logNudgeEvent(
    tx,
    sessionId,
    targetScene,
    'submitted',
    type,
    content,
    displayName,
    ''
  );
  logActivity(
    tx,
    sessionId,
    targetScene,
    'nudge_submitted',
    'submit_nudge · pending nudge queued',
    `${displayName} · [${type}] ${content.slice(0, 80)}`,
    { done: true }
  );
}

export function readPendingNudge(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number
): ResolvedNudge | null {
  const row = tx.db.pendingNudge.session_id.find(sessionId);
  if (!row || row.target_scene !== targetScene) {
    return null;
  }
  return {
    type: row.type,
    content: row.content,
    appliedBy: row.submitted_by_name,
  };
}

export function takePendingNudge(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number
): ResolvedNudge | null {
  const row = tx.db.pendingNudge.session_id.find(sessionId);
  if (!row || row.target_scene !== targetScene) {
    return null;
  }
  tx.db.pendingNudge.delete(row);
  return {
    type: row.type,
    content: row.content,
    appliedBy: row.submitted_by_name,
  };
}

export function resolveAdvanceNudge(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number,
  inlineType: string,
  inlineContent: string,
  sender: { toHexString(): string },
  displayName: string
): ResolvedNudge | null {
  const trimmed = inlineContent.trim();
  if (trimmed.length > 0) {
    return {
      type: inlineType || 'custom',
      content: trimmed,
      appliedBy: displayName,
    };
  }
  return readPendingNudge(tx, sessionId, targetScene);
}

export function claimGenerationLock(
  tx: AnyTx,
  sessionRow: { session_id: bigint; generating_scene: number },
  sceneNum: number
): void {
  if (sessionRow.generating_scene !== 0) {
    throw new SenderError(
      'NUDGE_LOST:GENERATING|Scene is still generating'
    );
  }
  tx.db.session.session_id.update({
    ...sessionRow,
    generating_scene: sceneNum,
  });
}

export function releaseGenerationLock(
  tx: AnyTx,
  sessionId: bigint
): void {
  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (sessionRow && sessionRow.generating_scene !== 0) {
    tx.db.session.session_id.update({
      ...sessionRow,
      generating_scene: 0,
    });
  }
}

export function assertGenerateSceneAllowed(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number
): void {
  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }
  if (sessionRow.current_scene !== sceneNum) {
    throw new SenderError(
      `generate_scene rejected — scene ${sceneNum} is not current (current=${sessionRow.current_scene})`
    );
  }
  if (sessionRow.generating_scene !== sceneNum) {
    throw new SenderError(
      'generate_scene rejected — no active generation lock for this scene'
    );
  }
  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const canonical = pickCanonicalScene(scenes, sceneNum);
  if (canonical && canonical.status !== 'generating') {
    throw new SenderError(
      'generate_scene rejected — scene already exists and is not a generating placeholder'
    );
  }
}

export function queuePendingOnRace(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number,
  sender: { toHexString(): string },
  type: string,
  content: string,
  displayName: string
): void {
  upsertPendingNudge(tx, sessionId, targetScene, sender, type, content, displayName);
  logNudgeEvent(
    tx,
    sessionId,
    targetScene,
    'rejected_race',
    type,
    content,
    displayName,
    'Inline nudge queued after advance race loss'
  );
  logActivity(
    tx,
    sessionId,
    targetScene,
    'nudge_rejected_race',
    'advance_and_generate · race lost, nudge queued',
    displayName,
    { done: true }
  );
}

export function consumePendingNudge(
  tx: AnyTx,
  sessionId: bigint,
  targetScene: number,
  directive: ResolvedNudge | null,
  inlineUsed: boolean
): void {
  const pending = tx.db.pendingNudge.session_id.find(sessionId);
  if (!pending || pending.target_scene !== targetScene) {
    return;
  }
  const pendingDirective: ResolvedNudge = {
    type: pending.type,
    content: pending.content,
    appliedBy: pending.submitted_by_name,
  };
  tx.db.pendingNudge.delete(pending);
  if (!inlineUsed && directive) {
    logNudgeEvent(
      tx,
      sessionId,
      targetScene,
      'consumed',
      directive.type,
      directive.content,
      directive.appliedBy,
      ''
    );
    logActivity(
      tx,
      sessionId,
      targetScene,
      'nudge_consumed',
      'advance_and_generate · pending nudge consumed',
      `${directive.appliedBy} · [${directive.type}] ${directive.content.slice(0, 80)}`,
      { done: true }
    );
  } else if (inlineUsed) {
    logNudgeEvent(
      tx,
      sessionId,
      targetScene,
      'consumed',
      pendingDirective.type,
      pendingDirective.content,
      pendingDirective.appliedBy,
      'Cleared — inline nudge used instead'
    );
  }
}
