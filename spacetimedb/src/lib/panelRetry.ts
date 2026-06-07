import { SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import { logActivity } from './activityLog.js';

export const MAX_PANEL_RETRIES = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

export function assertSchedulerCaller(ctx: {
  sender: unknown;
  identity: unknown;
}): void {
  if (ctx.sender !== ctx.identity) {
    throw new SenderError('Scheduled procedure invoked by non-scheduler');
  }
}

export function computeRetryDelayMicros(attempt: number): bigint {
  const seconds = attempt === 1 ? 5 : attempt === 2 ? 10 : 20;
  return BigInt(seconds) * 1_000_000n;
}

export function cancelPanelRetriesForPanel(tx: AnyTx, panelId: bigint): void {
  for (const row of [...tx.db.panelRetryQueue.panel_id.filter(panelId)]) {
    tx.db.panelRetryQueue.delete(row);
  }
}

export function cancelPanelRetriesForScene(tx: AnyTx, sceneId: bigint): void {
  for (const row of [...tx.db.panelRetryQueue.scene_id.filter(sceneId)]) {
    tx.db.panelRetryQueue.delete(row);
  }
}

export function anyPanelRetryPending(tx: AnyTx, sceneId: bigint): boolean {
  for (const _row of tx.db.panelRetryQueue.scene_id.filter(sceneId)) {
    return true;
  }
  return false;
}

export function enqueuePanelRetry(
  tx: AnyTx,
  args: {
    sessionId: bigint;
    sceneId: bigint;
    panelId: bigint;
    sceneNum: number;
    panelNum: number;
    attempt: number;
    lastError: string;
    delayMicros?: bigint;
  }
): void {
  const now = tx.timestamp.microsSinceUnixEpoch;
  const delay = args.delayMicros ?? computeRetryDelayMicros(args.attempt);
  tx.db.panelRetryQueue.insert({
    retry_id: 0n,
    scheduled_at: ScheduleAt.time(now + delay),
    session_id: args.sessionId,
    scene_id: args.sceneId,
    panel_id: args.panelId,
    scene_num: args.sceneNum,
    panel_num: args.panelNum,
    attempt: args.attempt,
    last_error: args.lastError,
  });

  logActivity(
    tx,
    args.sessionId,
    args.sceneNum,
    'panel_retry_scheduled',
    `panel #${String(args.panelNum).padStart(2, '0')} · retry scheduled`,
    `attempt ${args.attempt}/${MAX_PANEL_RETRIES} · in ${Number(delay / 1_000_000n)}s`,
    { done: true }
  );
}
