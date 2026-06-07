import {
  buildCharacterReferencePrompt,
  type CharacterVisualInput,
} from './characterVisual.js';
import { callOpenAI, normalizeStoredImageUrl } from './openai.js';
import { logActivity } from './activityLog.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

type CharacterRow = CharacterVisualInput & {
  char_id: bigint;
  reference_image_url?: string;
};

export function generateCharacterReferenceSheet(
  ctx: AnyCtx,
  character: CharacterRow,
  styleBible: string
): string {
  const prompt = buildCharacterReferencePrompt(character, styleBible);
  return callOpenAI(ctx, prompt);
}

export function ensureCharacterReferences(
  ctx: AnyCtx,
  sessionId: bigint,
  styleBible: string,
  sceneNum: number
): void {
  const legacyRefs = ctx.withTx((tx: AnyCtx) =>
    [...tx.db.character.session_id.filter(sessionId)].filter(
      (c: CharacterRow) =>
        c.reference_image_url?.trim().startsWith('http')
    )
  );
  for (const character of legacyRefs) {
    const normalized = normalizeStoredImageUrl(
      ctx,
      character.reference_image_url
    );
    if (normalized.startsWith('data:')) {
      ctx.withTx((tx: AnyCtx) => {
        const row = tx.db.character.char_id.find(character.char_id);
        if (row) {
          tx.db.character.char_id.update({
            ...row,
            reference_image_url: normalized,
          });
        }
      });
    }
  }

  const missing = ctx.withTx((tx: AnyCtx) =>
    [...tx.db.character.session_id.filter(sessionId)].filter(
      (c: CharacterRow) => !c.reference_image_url?.trim()
    )
  );

  if (missing.length === 0) return;

  ctx.withTx((tx: AnyCtx) => {
    logActivity(
      tx,
      sessionId,
      sceneNum,
      'character_refs_start',
      'Generating character reference sheets',
      `${missing.length} character(s) · OpenAI`,
      { done: false, active: true }
    );
  });

  for (const character of missing) {
    try {
      const url = generateCharacterReferenceSheet(ctx, character, styleBible);
      const normalized = normalizeStoredImageUrl(ctx, url);
      ctx.withTx((tx: AnyCtx) => {
        const row = tx.db.character.char_id.find(character.char_id);
        if (row) {
          tx.db.character.char_id.update({
            ...row,
            reference_image_url: normalized || url,
          });
        }
      });
    } catch (err) {
      console.error(
        `Character reference failed for ${character.name}:`,
        String(err)
      );
    }
  }

  ctx.withTx((tx: AnyCtx) => {
    logActivity(
      tx,
      sessionId,
      sceneNum,
      'character_refs_done',
      'Character reference sheets ready',
      'Stored on character rows for page generation',
      { done: true }
    );
  });
}

export function collectReferenceImages(
  characters: CharacterRow[],
  previousPageUrl?: string,
  maxRefs = 4
): string[] {
  const refs: string[] = [];
  for (const c of characters) {
    const url = c.reference_image_url?.trim();
    if (url) refs.push(url);
  }
  const prev = previousPageUrl?.trim();
  if (prev && refs.length < maxRefs) {
    refs.push(prev);
  }
  return refs.slice(0, maxRefs);
}

export function findPreviousScenePageUrl(
  tx: AnyCtx,
  sessionId: bigint,
  sceneNum: number
): string | undefined {
  if (sceneNum <= 1) return undefined;
  const scenes = [...tx.db.scene.session_id.filter(sessionId)].filter(
    (s: AnyCtx) => s.scene_num === sceneNum - 1 && s.page_image_url?.trim()
  );
  const prev = scenes.sort(
    (a: AnyCtx, b: AnyCtx) => Number(b.scene_id - a.scene_id)
  )[0];
  return prev?.page_image_url?.trim() || undefined;
}
