// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

export function logActivity(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number,
  kind: string,
  label: string,
  detail: string,
  opts: { done?: boolean; active?: boolean } = {},
  generationId: bigint = 0n
): void {
  tx.db.activityEvent.insert({
    event_id: 0n,
    session_id: sessionId,
    scene_num: sceneNum,
    kind,
    label,
    detail,
    done: opts.done ?? true,
    active: opts.active ?? false,
    created_at: tx.timestamp.microsSinceUnixEpoch,
    generation_id: generationId,
  });
}
