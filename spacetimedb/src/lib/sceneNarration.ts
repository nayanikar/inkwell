import { logActivity } from './activityLog.js';
import { buildNarrationPayload, type PanelForNarration } from './narration.js';
import {
  callOpenAITts,
  NARRATION_MODEL,
  NARRATION_VOICE,
} from './openaiTts.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

export function runSceneNarration(
  ctx: AnyCtx,
  sessionId: bigint,
  sceneId: bigint,
  sceneNum: number,
  sceneTitle: string,
  activityPrefix: string
): void {
  const ctxData = ctx.withTx((tx: AnyCtx) => {
    const panels = [...tx.db.panel.scene_id.filter(sceneId)].sort(
      (a: AnyCtx, b: AnyCtx) => a.panel_num - b.panel_num
    ) as PanelForNarration[];

    const sceneRow = tx.db.scene.scene_id.find(sceneId);
    if (sceneRow) {
      tx.db.scene.scene_id.update({
        ...sceneRow,
        narration_status: 'generating',
        narration_audio_url: '',
        narration_segments_json: '',
      });
    }

    logActivity(
      tx,
      sessionId,
      sceneNum,
      'narration_start',
      `${activityPrefix} · OpenAI TTS`,
      `${panels.length} panel(s) · ${NARRATION_MODEL} · voice ${NARRATION_VOICE}`,
      { done: false, active: true }
    );

    return { panels, title: sceneTitle || sceneRow?.title || '' };
  });

  try {
    const payload = buildNarrationPayload(ctxData.panels, ctxData.title);
    if (!payload) {
      ctx.withTx((tx: AnyCtx) => {
        const sceneRow = tx.db.scene.scene_id.find(sceneId);
        if (sceneRow) {
          tx.db.scene.scene_id.update({
            ...sceneRow,
            narration_status: 'error',
          });
        }
        logActivity(
          tx,
          sessionId,
          sceneNum,
          'narration_error',
          'scene narration failed',
          'No narration text in panels',
          { done: false }
        );
      });
      return;
    }

    const segmentsWithAudio = payload.segments.map(seg => ({
      ...seg,
      audioUrl: callOpenAITts(ctx, seg.text),
    }));

    const segmentsJson = JSON.stringify(segmentsWithAudio);
    const primaryAudioUrl = segmentsWithAudio[0]?.audioUrl ?? '';

    ctx.withTx((tx: AnyCtx) => {
      const sceneRow = tx.db.scene.scene_id.find(sceneId);
      if (sceneRow) {
        tx.db.scene.scene_id.update({
          ...sceneRow,
          narration_audio_url: primaryAudioUrl,
          narration_segments_json: segmentsJson,
          narration_status: 'done',
        });
      }
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'narration_done',
        'scene narration generated',
        `${segmentsWithAudio.length} segment(s) · per-beat TTS · subscription push`,
        { done: true }
      );
    });
  } catch (err) {
    const errText = String(err);
    ctx.withTx((tx: AnyCtx) => {
      const sceneRow = tx.db.scene.scene_id.find(sceneId);
      if (sceneRow) {
        tx.db.scene.scene_id.update({
          ...sceneRow,
          narration_status: 'error',
        });
      }
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'narration_error',
        'scene narration failed',
        errText.slice(0, 120),
        { done: false }
      );
    });
    console.error(`${activityPrefix} narration failed:`, errText);
  }
}
