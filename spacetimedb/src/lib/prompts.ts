import type { SceneJson } from './types.js';
import {
  SUBTEXT_RULES,
  buildCharacterVoiceCards,
  getCameraForLayoutHint,
  getLightingForGenre,
  getSceneDramaticFunction,
  type CharacterForVoice,
} from './storyQuality.js';

type SessionRow = {
  genre: string;
  setting: string;
  style_bible: string;
  total_scenes: number;
};

type CharacterRow = CharacterForVoice;

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
  "panels": [
    {
      "panel_num": 1,
      "caption": "First person narrator voice. Observational. Or empty string.",
      "speaker": "Character name or empty string",
      "dialogue": "What they say. Or empty string. Two lines max.",
      "image_prompt": "Concrete visual description. Pose, expression, environment detail, camera angle.",
      "layout_hint": "wide | tall | square | close-up"
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
  caption?: string;
  speaker?: string;
  dialogue?: string;
  image_prompt: string;
  layout_hint?: string;
};

type PanelImagePromptInput = {
  session: {
    genre: string;
    setting: string;
    style_bible: string;
  };
  sceneNum: number;
  panel: PanelPromptInput;
};

export function buildPanelImagePrompt({
  session,
  sceneNum,
  panel,
}: PanelImagePromptInput): string {
  const layoutHint = panel.layout_hint ?? 'square';
  const lighting = getLightingForGenre(session.genre);
  const camera = getCameraForLayoutHint(layoutHint);

  const parts = [
    session.style_bible,
    `SCENE CONTEXT: ${session.genre} story, ${session.setting}, scene ${sceneNum}.`,
    'This is a comic panel — it must work as a standalone image but belong to a sequence.',
    'CONTINUITY RULES:',
    '- Character appearances must stay consistent with their established look',
    `- The environment is: ${session.setting}`,
    `- Lighting should be: ${lighting}`,
    `- Camera: ${camera}`,
    'Single complete comic book panel. All text must appear inside the image as hand-drawn speech balloons or caption boxes with legible lettering.',
    `THIS PANEL: ${panel.image_prompt}`,
  ];

  if (panel.dialogue?.trim()) {
    parts.push(
      `DIALOGUE IN PANEL (render as speech balloon): "${panel.dialogue.trim()}" — spoken by ${panel.speaker?.trim() || 'unknown'}`
    );
  } else {
    parts.push('No dialogue in this panel.');
  }

  if (panel.caption?.trim()) {
    parts.push(`CAPTION (render as caption box): "${panel.caption.trim()}"`);
  } else {
    parts.push('No caption in this panel.');
  }

  if (!panel.dialogue?.trim() && !panel.caption?.trim()) {
    parts.push('Silent panel with no speech balloons or captions.');
  }

  return parts.join('\n');
}
