import type { SceneJson } from './types.js';
import {
  SUBTEXT_RULES,
  buildCharacterVoiceCards,
  getSceneDramaticFunction,
  type CharacterForVoice,
} from './storyQuality.js';
import {
  VISUAL_CONSISTENCY_RULES,
  buildCharacterVisualCards,
  buildCharacterAnchorBlock,
  buildSceneWardrobeBlock,
  resolveCharactersInPanel,
  type CharacterVisualInput,
} from './characterVisual.js';

type SessionRow = {
  genre: string;
  setting: string;
  style_bible: string;
  total_scenes: number;
};

type CharacterRow = CharacterForVoice & CharacterVisualInput;

type MemoryRow = {
  scene_num: number;
  panel_num: number;
  event_text: string;
};

type DirectiveRow = {
  type: string;
  content: string;
};

function getGenreRules(genre: string): string {
  const rules: Record<string, string> = {
    noir: 'Someone always has a secret. Someone is always lying. Rain is always a character. Trust costs. The last line of dialogue should land like a verdict.',
    horror:
      'Build dread slowly. What is unseen is scarier than what is shown. The last panel should unsettle, not resolve.',
    comedy:
      'Timing is everything — the joke lands in the last panel. Characters should be earnest about absurd things.',
    fantasy:
      'Rules of magic must be consistent. Wonder is earned through specificity. The world reacts to character choices.',
    'sci-fi':
      'Technology is a mirror for character. The environment reflects the theme. Stakes are always larger than they appear.',
    western:
      'Silence carries as much weight as dialogue. Honour and pragmatism are always in tension. The landscape is a moral statement.',
    romance:
      'Misunderstanding drives tension. What is unsaid matters more than what is said. The last panel should be a held breath.',
    thriller:
      'Every panel should raise the stakes. Someone knows more than they are saying. Paranoia is the correct response.',
  };
  return (
    rules[genre] ||
    'Follow the internal logic of the world. Character consistency above all.'
  );
}

export function buildScenePrompt({
  session,
  characters,
  memories,
  directives,
  scene_num,
}: {
  session: SessionRow;
  characters: CharacterRow[];
  memories: MemoryRow[];
  directives: DirectiveRow[];
  scene_num: number;
}): string {
  return `
You are the genre engine for Inkwell — an AI comic strip writer.
You are the INVISIBLE AUTHOR. You see everything. You enforce genre logic.
You are writing in the tradition of the great ${session.genre} storytellers.

${getGenreRules(session.genre)}

STORY POSITION:
${getSceneDramaticFunction(scene_num, session.total_scenes)}

WORLD:
Genre: ${session.genre}
Setting: ${session.setting}

${buildCharacterVoiceCards(characters)}

${buildCharacterVisualCards(characters)}

${VISUAL_CONSISTENCY_RULES}

STORY MEMORY (what has happened):
${
  memories.length > 0
    ? memories.map(m => `- Scene ${m.scene_num}: ${m.event_text}`).join('\n')
    : 'This is the opening scene. The world is intact. Nothing has gone wrong yet.'
}

ACTIVE DIRECTIVES (honour these — they are the director's instructions):
${
  directives.length > 0
    ? directives.map(d => `- [${d.type.toUpperCase()}] ${d.content}`).join('\n')
    : 'No directives. Follow the natural dramatic function of this scene position.'
}

${SUBTEXT_RULES}

OUTPUT FORMAT:
Respond ONLY with valid JSON. No markdown. No preamble. Exactly this schema:

{
  "title": "4-6 words, evocative, not literal",
  "scene_summary": "One sentence. What actually happened in this scene.",
  "scene_wardrobe": [
    { "char_id": 1, "outfit": "Only if outfit changes this scene; omit if default" }
  ],
  "panels": [
    {
      "panel_num": 1,
      "caption": "First person narrator voice. Observational. Or empty string.",
      "speaker": "Character name or empty string",
      "dialogue": "What they say. Or empty string. Two lines max.",
      "image_prompt": "Pose, expression, action, environment, camera angle ONLY — never redesign species or face.",
      "layout_hint": "wide | tall | square | close-up",
      "characters_present": ["Exact character names visible in this panel"]
    }
  ],
  "character_updates": [
    { "char_id": 1, "new_mood": "specific mood, one phrase" }
  ],
  "new_memories": [
    { "char_id": 1, "panel_num": 3, "event_text": "What this character witnessed. One sentence. Specific." }
  ]
}

Write 5-7 panels. Vary layout_hint across panels. Each panel is ONE complete comic frame with artwork AND all text integrated inside it. Make the last panel earn it.
`.trim();
}

export function parseSceneJson(text: string): SceneJson {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as SceneJson;
}

type PanelPromptInput = {
  panel_num: number;
  caption?: string;
  speaker?: string;
  dialogue?: string;
  image_prompt: string;
  layout_hint?: string;
  characters_present?: string[];
};

type PageImagePromptInput = {
  session: {
    genre: string;
    setting: string;
    style_bible: string;
  };
  sceneNum: number;
  characters: CharacterVisualInput[];
  panels: PanelPromptInput[];
  sceneWardrobe?: { char_id: number; outfit: string }[];
  hasReferenceImages?: boolean;
  hasPreviousPage?: boolean;
};

const PAGE_PROMPT_FOOTER =
  'Hand-drawn speech balloons, caption boxes, ALL CAPS lettering, black ink on white paper.';

function toAllCaps(text: string): string {
  return text.trim().toUpperCase();
}

function buildCharacterAnchorBlockForPage(
  characters: CharacterVisualInput[],
  sceneWardrobe?: { char_id: number; outfit: string }[]
): string {
  const wardrobeMap = new Map<string, string>();
  if (sceneWardrobe?.length) {
    const byId = new Map(
      characters.map(c => [Number(c.char_id ?? 0n), c.name.trim()])
    );
    for (const w of sceneWardrobe) {
      const name = byId.get(w.char_id);
      if (name && w.outfit?.trim()) {
        wardrobeMap.set(name, w.outfit.trim());
      }
    }
  }
  return buildCharacterAnchorBlock(characters, wardrobeMap);
}

function formatPanelLine(
  panel: PanelPromptInput,
  cast: CharacterVisualInput[]
): string {
  const num = panel.panel_num;
  const prompt = panel.image_prompt?.trim() || 'Visual scene';
  const present = resolveCharactersInPanel(panel, cast);
  const castNote =
    present.length > 0
      ? ` Characters in panel: ${present.join(', ')}.`
      : '';
  const parts = [`Panel ${num} — [${prompt}]${castNote}`];

  if (panel.caption?.trim()) {
    parts.push(`Caption box: "${toAllCaps(panel.caption)}"`);
  }
  if (panel.dialogue?.trim()) {
    const speaker = panel.speaker?.trim() || 'UNKNOWN';
    parts.push(`Speech balloon from ${speaker.toUpperCase()}: "${toAllCaps(panel.dialogue)}"`);
  }
  if (!panel.caption?.trim() && !panel.dialogue?.trim()) {
    parts.push('No dialogue.');
  }

  return parts.join('. ');
}

function buildLayoutHeader(panelCount: number): string {
  const stripCount = Math.ceil(panelCount / 3);
  return [
    'LAYOUT: Black and white newspaper comic strip page.',
    'Pen and ink illustration with cross-hatching and clear gutters between panels.',
    `${stripCount} horizontal strip${stripCount === 1 ? '' : 's'}, up to 3 panels per strip.`,
  ].join('\n');
}

export function buildPageImagePrompt({
  session,
  sceneNum,
  characters,
  panels,
  sceneWardrobe,
  hasReferenceImages,
  hasPreviousPage,
}: PageImagePromptInput): string {
  const sortedPanels = [...panels].sort((a, b) => a.panel_num - b.panel_num);
  const refNotes: string[] = [];
  if (hasReferenceImages) {
    refNotes.push(
      'REFERENCE IMAGES: First image(s) are character model sheets — match species, face, ears/horns, proportions, and default outfit exactly.'
    );
  }
  if (hasPreviousPage) {
    refNotes.push(
      'STYLE LOCK: Final reference image is the previous comic page — match character designs and ink style; only change poses and layout for this scene.'
    );
  }

  const parts = [
    session.style_bible,
    `SCENE CONTEXT: ${session.genre} story, ${session.setting}, scene ${sceneNum}.`,
    buildCharacterAnchorBlockForPage(characters, sceneWardrobe),
    buildSceneWardrobeBlock(characters, sceneWardrobe),
    ...refNotes,
    buildLayoutHeader(sortedPanels.length),
    ...sortedPanels.map(p => formatPanelLine(p, characters)),
    PAGE_PROMPT_FOOTER,
  ];

  return parts.filter(Boolean).join('\n');
}
