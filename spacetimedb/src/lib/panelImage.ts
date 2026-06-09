import { buildPageImagePrompt } from './prompts.js';
import {
  callOpenAIWithReferences,
  type ReferenceImageGenerationResult,
} from './openai.js';
import type { CharacterVisualInput } from './characterVisual.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

type SessionRow = {
  genre: string;
  setting: string;
  style_bible: string;
};

type CharacterRow = CharacterVisualInput & {
  reference_image_url?: string;
};

type PanelRow = {
  panel_num: number;
  caption: string;
  speaker: string;
  dialogue: string;
  image_prompt: string;
  layout_hint: string;
  characters_present?: string[];
};

export type PageImageOptions = {
  sceneWardrobe?: { char_id: number; outfit: string }[];
  referenceImageUrls?: string[];
  referencedCharacters?: CharacterRow[];
  hasPreviousPage?: boolean;
};

export function generatePageImage(
  ctx: AnyCtx,
  sessionRow: SessionRow,
  sceneNum: number,
  characters: CharacterRow[],
  panels: PanelRow[],
  options: PageImageOptions = {}
): ReferenceImageGenerationResult {
  const refs = options.referenceImageUrls ?? [];

  const fullPrompt = buildPageImagePrompt({
    session: {
      genre: sessionRow.genre,
      setting: sessionRow.setting,
      style_bible: sessionRow.style_bible,
    },
    sceneNum,
    characters,
    panels,
    sceneWardrobe: options.sceneWardrobe,
    hasReferenceImages: refs.length > 0,
    hasPreviousPage: options.hasPreviousPage ?? false,
    referencedCharacters: options.referencedCharacters ?? [],
  });

  return callOpenAIWithReferences(ctx, fullPrompt, refs);
}
