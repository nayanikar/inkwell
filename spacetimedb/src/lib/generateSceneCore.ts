import { SenderError } from 'spacetimedb/server';
import { buildScenePrompt } from './prompts.js';
import { callAnthropic } from './anthropic.js';
import { logActivity } from './activityLog.js';
import {
  assertSessionDirector,
  pickCanonicalScene,
} from './sessionGuards.js';
import { assertGenerateSceneAllowed } from './nudgeCoordination.js';
import { generatePageImage } from './panelImage.js';
import { normalizeStoredImageUrl } from './openai.js';
import {
  ensureCharacterReferences,
  collectReferenceImages,
  findPreviousScenePageUrl,
} from './characterReference.js';
import {
  mergePanelCast,
  parseVisualContextJson,
  type SceneVisualContext,
} from './sceneVisualContext.js';
import { runSceneNarration } from './sceneNarration.js';
import { cancelPanelRetriesForScene } from './panelRetry.js';
import {
  persistPendingFinalize,
  maybeFinalizeScene,
  markScenePageError,
  markSceneScriptError,
} from './sceneFinalize.js';
import {
  archiveSceneBeforeOverwrite,
} from './generationArchive.js';
import { isPageImageInFlight } from './generationRecovery.js';
import type { SceneJson } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

function timestampMicros(ctx: { timestamp: { microsSinceUnixEpoch: bigint } }): bigint {
  return ctx.timestamp.microsSinceUnixEpoch;
}

function charactersWithSecrets(tx: AnyCtx, sessionId: bigint) {
  return [...tx.db.character.session_id.filter(sessionId)].map((c: AnyCtx) => {
    const secretRow = tx.db.characterSecret.char_id.find(c.char_id);
    return { ...c, secret: secretRow?.secret ?? '' };
  });
}

function panelRowsForScene(tx: AnyCtx, sceneId: bigint) {
  return [...tx.db.panel.scene_id.filter(sceneId)].sort(
    (a: AnyCtx, b: AnyCtx) => a.panel_num - b.panel_num
  );
}

function buildVisualContextFromSceneJson(sceneJson: SceneJson): SceneVisualContext {
  return {
    scene_wardrobe: sceneJson.scene_wardrobe,
    panels: sceneJson.panels.map(p => ({
      panel_num: p.panel_num,
      characters_present: p.characters_present,
    })),
  };
}

function collectSceneCharacterNames(
  panels: { speaker?: string; characters_present?: string[] }[],
  cast: { name: string }[]
): string[] {
  const names = new Set<string>();
  for (const panel of panels) {
    for (const name of panel.characters_present ?? []) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
    const speaker = panel.speaker?.trim();
    if (speaker) names.add(speaker);
  }
  if (names.size === 0) {
    return cast.map(c => c.name.trim());
  }
  return [...names];
}

function loadPageImageInputs(
  tx: AnyCtx,
  sessionId: bigint,
  sceneId: bigint,
  sceneNum: number,
  sceneJson?: SceneJson
) {
  const sessionRow = tx.db.session.session_id.find(sessionId);
  if (!sessionRow) {
    throw new SenderError('Session not found');
  }
  const characters = charactersWithSecrets(tx, sessionId);
  const panels = panelRowsForScene(tx, sceneId);

  let visualContext: SceneVisualContext | undefined;
  if (sceneJson) {
    visualContext = buildVisualContextFromSceneJson(sceneJson);
  } else {
    const pending = tx.db.scenePendingFinalize.scene_id.find(sceneId);
    visualContext = parseVisualContextJson(pending?.visual_context_json);
  }

  const mergedPanels = mergePanelCast(panels, visualContext);
  const previousPageUrl = findPreviousScenePageUrl(tx, sessionId, sceneNum);
  const priorityNames = collectSceneCharacterNames(mergedPanels, characters);
  const referenceCollection = collectReferenceImages(
    characters,
    previousPageUrl,
    {
      reservePreviousPage: sceneNum > 1,
      priorityNames,
    }
  );

  return {
    session: sessionRow,
    characters,
    panels: mergedPanels,
    sceneWardrobe: visualContext?.scene_wardrobe,
    referenceImageUrls: referenceCollection.urls,
    referencedCharacters: referenceCollection.referencedCharacters,
    hasPreviousPage: referenceCollection.previousPageIncluded,
  };
}

function normalizeReferenceUrls(ctx: AnyCtx, urls: string[]): string[] {
  return urls
    .map(url => normalizeStoredImageUrl(ctx, url))
    .filter(url => url.trim().length > 0);
}

function runPageImageGeneration(
  ctx: AnyCtx,
  sessionId: bigint,
  sceneId: bigint,
  sceneNum: number,
  activityPrefix: string,
  sceneJson?: SceneJson
): boolean {
  const styleBible = ctx.withTx((tx: AnyCtx) => {
    const sessionRow = tx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }
    return sessionRow.style_bible;
  });

  ensureCharacterReferences(ctx, sessionId, styleBible, sceneNum);

  const skipped = ctx.withTx((tx: AnyCtx) => {
    if (isPageImageInFlight(tx, sessionId, sceneNum)) {
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_image_skipped',
        'page image draw skipped',
        'Another page draw is already in flight',
        { done: true }
      );
      return true;
    }
    return false;
  });
  if (skipped) return false;

  const ctxData = ctx.withTx((tx: AnyCtx) =>
    loadPageImageInputs(tx, sessionId, sceneId, sceneNum, sceneJson)
  );

  ctx.withTx((tx: AnyCtx) => {
    logActivity(
      tx,
      sessionId,
      sceneNum,
      'page_image_start',
      `${activityPrefix} · OpenAI page image call`,
      `${ctxData.panels.length} panel(s) in page layout`,
      { done: false, active: true }
    );
  });

  try {
    const referenceImageUrls = normalizeReferenceUrls(
      ctx,
      ctxData.referenceImageUrls
    );
    const pageResult = generatePageImage(
      ctx,
      ctxData.session,
      sceneNum,
      ctxData.characters,
      ctxData.panels,
      {
        sceneWardrobe: ctxData.sceneWardrobe,
        referenceImageUrls,
        referencedCharacters: ctxData.referencedCharacters,
        hasPreviousPage: ctxData.hasPreviousPage,
      }
    );

    ctx.withTx((tx: AnyCtx) => {
      if (referenceImageUrls.length > 0 && !pageResult.usedReferenceEdits) {
        logActivity(
          tx,
          sessionId,
          sceneNum,
          'page_image_fallback',
          'Reference images unavailable — text-only page draw',
          `Requested ${pageResult.requestedRefs} ref(s), applied ${pageResult.appliedRefs}`,
          { done: true }
        );
      }

      const sceneRow = tx.db.scene.scene_id.find(sceneId);
      if (sceneRow) {
        tx.db.scene.scene_id.update({
          ...sceneRow,
          page_image_url: pageResult.imageUrl,
        });
      }
      for (const panel of panelRowsForScene(tx, sceneId)) {
        tx.db.panel.panel_id.update({ ...panel, status: 'done' });
      }
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_image_done',
        'scene page image generated',
        'page_image_url set · subscription push',
        { done: true }
      );
      maybeFinalizeScene(tx, sceneId, sessionId, sceneNum);
    });
    return true;
  } catch (err) {
    const errText = String(err);
    ctx.withTx((tx: AnyCtx) => {
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_image_error',
        'scene page image failed',
        errText.slice(0, 120),
        { done: false }
      );
      markScenePageError(tx, sceneId, sessionId, sceneNum, errText, {
        skipArchive: true,
      });
    });
    console.error(`${activityPrefix} page image failed:`, errText);
    return false;
  }
}

export function runGenerateScene(
  ctx: AnyCtx,
  sessionId: bigint,
  sceneNum: number
): void {
  ctx.withTx((tx: AnyCtx) => {
    const sessionRow = tx.db.session.session_id.find(sessionId);
    assertSessionDirector(sessionRow, ctx.sender, tx.db);
    assertGenerateSceneAllowed(tx, sessionId, sceneNum);
    logActivity(
      tx,
      sessionId,
      sceneNum,
      'generate_start',
      'generate_scene procedure started',
      `scene ${sceneNum} · module orchestrating Claude + OpenAI`,
      { done: true }
    );
  });

  let sceneJson: SceneJson;
  try {
    const ctxData = ctx.withTx((tx: AnyCtx) => {
      const sessionRow = tx.db.session.session_id.find(sessionId);
      if (!sessionRow) {
        throw new SenderError('Session not found');
      }

      const characters = charactersWithSecrets(tx, sessionId);
      const memories = [...tx.db.memory.session_id.filter(sessionId)].filter(
        (m: AnyCtx) => m.scene_num >= sceneNum - 2
      );
      const directives = [
        ...tx.db.narrativeDirective.session_id.filter(sessionId),
      ].filter((d: AnyCtx) => d.applied_at_scene === sceneNum);

      logActivity(
        tx,
        sessionId,
        sceneNum,
        'claude_start',
        'generate_scene · calling Claude',
        `Reading ${characters.length} characters · ${directives.length} directive(s)`,
        { done: false, active: true }
      );

      return { session: sessionRow, characters, memories, directives };
    });

    sceneJson = callAnthropic(
      ctx,
      buildScenePrompt({ ...ctxData, scene_num: sceneNum })
    );

    ctx.withTx((tx: AnyCtx) => {
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'claude_done',
        'generate_scene · Claude response received',
        `"${sceneJson.title}" · ${sceneJson.panels.length} panels`,
        { done: true }
      );
    });
  } catch (err) {
    const errText = String(err);
    ctx.withTx((tx: AnyCtx) => {
      markSceneScriptError(tx, sessionId, sceneNum, errText);
    });
    console.error(`generate_scene Claude failed for session ${sessionId}:`, errText);
    return;
  }

  let insertResult: { scene_id: bigint; title: string };
  try {
    insertResult = ctx.withTx((tx: AnyCtx) => {
      const scenes = [...tx.db.scene.session_id.filter(sessionId)];
      const placeholder = pickCanonicalScene(scenes, sceneNum);

      for (const stale of scenes.filter((s: AnyCtx) => s.scene_num === sceneNum)) {
        if (placeholder && stale.scene_id === placeholder.scene_id) {
          continue;
        }
        cancelPanelRetriesForScene(tx, stale.scene_id);
        for (const panel of [...tx.db.panel.scene_id.filter(stale.scene_id)]) {
          tx.db.panel.delete(panel);
        }
        const pending = tx.db.scenePendingFinalize.scene_id.find(stale.scene_id);
        if (pending) {
          tx.db.scenePendingFinalize.delete(pending);
        }
        tx.db.scene.delete(stale);
      }

      let sceneRow: AnyCtx;
      if (placeholder) {
        archiveSceneBeforeOverwrite(
          tx,
          placeholder.scene_id,
          'script_regen',
          'Claude script regeneration'
        );
        cancelPanelRetriesForScene(tx, placeholder.scene_id);
        for (const panel of [...tx.db.panel.scene_id.filter(placeholder.scene_id)]) {
          tx.db.panel.delete(panel);
        }
        const pendingFinalize = tx.db.scenePendingFinalize.scene_id.find(
          placeholder.scene_id
        );
        if (pendingFinalize) {
          tx.db.scenePendingFinalize.delete(pendingFinalize);
        }
        tx.db.scene.scene_id.update({
          ...placeholder,
          title: sceneJson.title,
          scene_summary: sceneJson.scene_summary ?? '',
          page_image_url: '',
          narration_audio_url: '',
          narration_segments_json: '',
          narration_status: '',
          status: 'generating',
        });
        sceneRow = {
          ...placeholder,
          title: sceneJson.title,
          scene_summary: sceneJson.scene_summary ?? '',
          page_image_url: '',
        };
      } else {
        sceneRow = tx.db.scene.insert({
          scene_id: 0n,
          session_id: sessionId,
          scene_num: sceneNum,
          title: sceneJson.title,
          scene_summary: sceneJson.scene_summary ?? '',
          page_image_url: '',
          narration_audio_url: '',
          narration_segments_json: '',
          narration_status: '',
          status: 'generating',
          created_at: timestampMicros(tx),
        });
      }

      sceneJson.panels.forEach((p, i) => {
        tx.db.panel.insert({
          panel_id: 0n,
          scene_id: sceneRow.scene_id,
          session_id: sessionId,
          scene_num: sceneNum,
          panel_num: p.panel_num ?? i + 1,
          caption: p.caption ?? '',
          speaker: p.speaker ?? '',
          dialogue: p.dialogue ?? '',
          image_prompt: p.image_prompt,
          image_url: '',
          layout_hint: p.layout_hint ?? 'square',
          status: 'generating',
        });
      });

      persistPendingFinalize(
        tx,
        sceneRow.scene_id,
        sessionId,
        sceneNum,
        sceneJson
      );

      logActivity(
        tx,
        sessionId,
        sceneNum,
        'script_ready',
        'scene + panel rows inserted',
        `scene.status=generating · ${sceneJson.panels.length} panel row(s) · subscription push`,
        { done: true }
      );

      return { scene_id: sceneRow.scene_id, title: sceneJson.title };
    });
  } catch (err) {
    const errText = String(err);
    ctx.withTx((tx: AnyCtx) => {
      markSceneScriptError(tx, sessionId, sceneNum, errText);
    });
    console.error(`generate_scene insert failed for session ${sessionId}:`, errText);
    return;
  }

  const pageOk = runPageImageGeneration(
    ctx,
    sessionId,
    insertResult.scene_id,
    sceneNum,
    'generate_scene',
    sceneJson
  );

  if (pageOk) {
    runSceneNarration(
      ctx,
      sessionId,
      insertResult.scene_id,
      sceneNum,
      insertResult.title,
      'generate_scene'
    );
  }
}

export function runRetryPageImage(
  ctx: AnyCtx,
  sessionId: bigint,
  sceneId: bigint,
  sceneNum: number
): void {
  const skipRetry = ctx.withTx((tx: AnyCtx) => {
    const sceneRow = tx.db.scene.scene_id.find(sceneId);
    if (sceneRow?.page_image_url?.trim()) {
      archiveSceneBeforeOverwrite(
        tx,
        sceneId,
        'page_retry',
        'Manual page retry'
      );
    }
    if (isPageImageInFlight(tx, sessionId, sceneNum)) {
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_retry_skipped',
        'page image retry skipped',
        'Another page draw is already in flight',
        { done: true }
      );
      return true;
    }
    logActivity(
      tx,
      sessionId,
      sceneNum,
      'page_retry_start',
      'page image retry · OpenAI call',
      'Manual retry requested',
      { done: false, active: true }
    );
    return false;
  });
  if (skipRetry) return;

  const styleBible = ctx.withTx((tx: AnyCtx) => {
    const sessionRow = tx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }
    return sessionRow.style_bible;
  });

  ensureCharacterReferences(ctx, sessionId, styleBible, sceneNum);

  const ctxData = ctx.withTx((tx: AnyCtx) => {
    const inputs = loadPageImageInputs(tx, sessionId, sceneId, sceneNum);
    const sceneRow = tx.db.scene.scene_id.find(sceneId);
    return {
      ...inputs,
      sceneTitle: sceneRow?.title ?? '',
    };
  });

  try {
    const referenceImageUrls = normalizeReferenceUrls(
      ctx,
      ctxData.referenceImageUrls
    );
    const pageResult = generatePageImage(
      ctx,
      ctxData.session,
      sceneNum,
      ctxData.characters,
      ctxData.panels,
      {
        sceneWardrobe: ctxData.sceneWardrobe,
        referenceImageUrls,
        referencedCharacters: ctxData.referencedCharacters,
        hasPreviousPage: ctxData.hasPreviousPage,
      }
    );

    ctx.withTx((tx: AnyCtx) => {
      if (referenceImageUrls.length > 0 && !pageResult.usedReferenceEdits) {
        logActivity(
          tx,
          sessionId,
          sceneNum,
          'page_image_fallback',
          'Reference images unavailable — text-only page draw',
          `Requested ${pageResult.requestedRefs} ref(s), applied ${pageResult.appliedRefs}`,
          { done: true }
        );
      }

      const sceneRow = tx.db.scene.scene_id.find(sceneId);
      if (sceneRow) {
        tx.db.scene.scene_id.update({
          ...sceneRow,
          page_image_url: pageResult.imageUrl,
        });
      }
      for (const panel of panelRowsForScene(tx, sceneId)) {
        tx.db.panel.panel_id.update({ ...panel, status: 'done' });
      }
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_retry_done',
        'page image retry succeeded',
        'page_image_url set',
        { done: true }
      );
      maybeFinalizeScene(tx, sceneId, sessionId, sceneNum, 'page_retry');
    });
    runSceneNarration(
      ctx,
      sessionId,
      sceneId,
      sceneNum,
      ctxData.sceneTitle,
      'page_retry'
    );
  } catch (err) {
    const errText = String(err);
    ctx.withTx((tx: AnyCtx) => {
      logActivity(
        tx,
        sessionId,
        sceneNum,
        'page_retry_failed',
        'page image retry failed',
        errText.slice(0, 120),
        { done: false }
      );
      markScenePageError(tx, sceneId, sessionId, sceneNum, errText, {
        skipArchive: true,
      });
    });
  }
}

/** Legacy panel retry — clears scheduled queue rows only. */
export function runRetryPanelImage(ctx: AnyCtx, arg: {
  retry_id: bigint;
  session_id: bigint;
  scene_id: bigint;
  panel_id: bigint;
  scene_num: number;
  panel_num: number;
  attempt: number;
  last_error: string;
}): void {
  ctx.withTx((tx: AnyCtx) => {
    const queueRow = tx.db.panelRetryQueue.retry_id.find(arg.retry_id);
    if (queueRow) {
      tx.db.panelRetryQueue.delete(queueRow);
    }
  });
}

export { runPageImageGeneration };
