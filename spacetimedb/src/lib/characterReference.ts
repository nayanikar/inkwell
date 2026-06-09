import {
  buildCharacterReferencePrompt,
  type CharacterVisualInput,
} from './characterVisual.js';
import { callOpenAI, normalizeStoredImageUrl } from './openai.js';
import { logActivity } from './activityLog.js';
import { pickCanonicalScene } from './sessionGuards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

type CharacterRow = CharacterVisualInput & {
  char_id: bigint;
  reference_image_url?: string;
};

export type ReferenceImageCollection = {
  urls: string[];
  referencedCharacters: CharacterRow[];
  previousPageIncluded: boolean;
};

export function generateCharacterReferenceSheet(
  ctx: AnyCtx,
  character: CharacterRow,
  styleBible: string
): string {
  const prompt = buildCharacterReferencePrompt(character, styleBible);
  return callOpenAI(ctx, prompt);
}

function defaultHumanVisualDescription(archetype: string): string {
  const role = archetype.trim() || 'story character';
  return `Human adult, ink cartoon style, dressed fitting their role as ${role}`;
}

export function ensureCharacterReferences(
  ctx: AnyCtx,
  sessionId: bigint,
  styleBible: string,
  sceneNum: number
): void {
  ctx.withTx((tx: AnyCtx) => {
    for (const character of tx.db.character.session_id.filter(sessionId)) {
      const row = character as CharacterRow & { archetype: string; visual_description?: string };
      const desc = row.visual_description?.trim() ?? '';
      if (desc.length > 0) continue;

      const humanLook = defaultHumanVisualDescription(row.archetype);
      tx.db.character.char_id.update({
        ...row,
        visual_description: humanLook,
        reference_image_url: '',
      });
    }
  });

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

  const stillMissing = ctx.withTx((tx: AnyCtx) =>
    [...tx.db.character.session_id.filter(sessionId)].filter(
      (c: CharacterRow) => !c.reference_image_url?.trim()
    )
  );

  ctx.withTx((tx: AnyCtx) => {
    logActivity(
      tx,
      sessionId,
      sceneNum,
      stillMissing.length > 0 ? 'character_refs_incomplete' : 'character_refs_done',
      stillMissing.length > 0
        ? 'Some character reference sheets missing'
        : 'Character reference sheets ready',
      stillMissing.length > 0
        ? stillMissing.map((c: CharacterRow) => c.name).join(', ')
        : 'Stored on character rows for page generation',
      { done: true }
    );
  });
}

export function collectReferenceImages(
  characters: CharacterRow[],
  previousPageUrl?: string,
  options?: {
    maxRefs?: number;
    reservePreviousPage?: boolean;
    priorityNames?: string[];
  }
): ReferenceImageCollection {
  const maxRefs = options?.maxRefs ?? 4;
  const prev = previousPageUrl?.trim();
  const reservePrev = !!options?.reservePreviousPage && !!prev;
  const charBudget = reservePrev ? maxRefs - 1 : maxRefs;

  const prioritySet = new Set(
    (options?.priorityNames ?? [])
      .map(name => name.trim().toLowerCase())
      .filter(Boolean)
  );

  const sorted = [...characters].sort((a, b) => {
    const aPriority = prioritySet.has(a.name.trim().toLowerCase()) ? 0 : 1;
    const bPriority = prioritySet.has(b.name.trim().toLowerCase()) ? 0 : 1;
    return aPriority - bPriority || a.name.localeCompare(b.name);
  });

  const urls: string[] = [];
  const referencedCharacters: CharacterRow[] = [];
  for (const character of sorted) {
    if (urls.length >= charBudget) break;
    const url = character.reference_image_url?.trim();
    if (!url) continue;
    urls.push(url);
    referencedCharacters.push(character);
  }

  let previousPageIncluded = false;
  if (prev) {
    if (reservePrev || urls.length < maxRefs) {
      urls.push(prev);
      previousPageIncluded = true;
    }
  }

  return {
    urls: urls.slice(0, maxRefs),
    referencedCharacters,
    previousPageIncluded,
  };
}

export function findPreviousScenePageUrl(
  tx: AnyCtx,
  sessionId: bigint,
  sceneNum: number
): string | undefined {
  if (sceneNum <= 1) return undefined;
  const scenes = [...tx.db.scene.session_id.filter(sessionId)];
  const prevScene = pickCanonicalScene(scenes, sceneNum - 1);
  return prevScene?.page_image_url?.trim() || undefined;
}
