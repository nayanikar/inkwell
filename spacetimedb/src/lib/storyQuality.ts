export type CharacterForVoice = {
  char_id: bigint;
  name: string;
  archetype: string;
  personality: string;
  current_mood: string;
  secret: string;
};

export function getSceneDramaticFunction(
  sceneNum: number,
  totalScenes: number
): string {
  const position = sceneNum / totalScenes;

  if (sceneNum === 1) {
    return `
    OPENING SCENE. Establish the world and the wound.
    Introduce the protagonist in their ordinary state — but something is already wrong.
    The inciting incident arrives at the last panel. End on a question, not an answer.
    DO NOT resolve anything. DO NOT explain the premise.`;
  }

  if (sceneNum === 2) {
    return `
    COMPLICATION. The protagonist takes the case / makes the choice.
    They think they understand the situation. They are wrong.
    Introduce the second major character if not yet seen.
    End on a revelation that reframes scene 1.`;
  }

  if (position <= 0.4) {
    return `
    DEEPENING. The protagonist gets deeper in.
    A small victory followed by a larger problem.
    Something from the past surfaces. Trust is tested.
    End on a moment of doubt.`;
  }

  if (position <= 0.6) {
    return `
    MIDPOINT TURN. Everything the protagonist believed is wrong.
    The real stakes become clear. Someone betrays or is betrayed.
    The protagonist cannot go back to who they were.
    This is the point of no return. End with them choosing to continue anyway.`;
  }

  if (position <= 0.8) {
    return `
    DESCENT. The protagonist is losing.
    Strip away allies, resources, certainty.
    The antagonist's full plan becomes visible.
    End at the lowest point — the protagonist alone, everything gone wrong.`;
  }

  if (sceneNum === totalScenes - 1) {
    return `
    CONFRONTATION. The protagonist faces the truth directly.
    Not just the antagonist — the truth about themselves.
    Violence or revelation or both. Nothing is resolved yet.
    End on a cliffhanger or a sacrifice.`;
  }

  return `
    RESOLUTION. The protagonist wins — but at a cost.
    What they lost matters as much as what they gained.
    The world is changed. They are changed.
    The last panel should echo the first scene visually. End with one line that lands.`;
}

export const SUBTEXT_RULES = `
DIALOGUE RULES — non-negotiable:
- Characters NEVER state the theme directly ("trust is everything", "nobody's innocent")
- Characters speak about CONCRETE things (keys, weather, money, names, times, places)
  and let the abstract bleed through
- Every line of dialogue should be doing two things at once — the surface thing
  and the real thing underneath
- Silence is an option. A panel with no dialogue and a strong visual IS a panel.
- Maximum 2 lines of dialogue per speech balloon. If it needs more, split the panels.
- The best line in each scene should be the LAST line spoken. Build to it.

CAPTION RULES:
- Captions are the protagonist's internal voice — first person, present tense
- Captions observe, they do not explain
- "The rain never stopped in this city" is good.
  "I knew something was wrong" is bad — show us, don't tell us.
- Max one caption per panel. Many panels should have none.

NARRATION RULES (text will be read aloud by a neutral audiobook narrator):
- Write captions and dialogue that sound natural when spoken — contractions, plain words, breath-sized sentences
- Avoid semicolon chains, stage directions in parentheses, or ALL CAPS in caption/dialogue fields
- Dialogue is spoken as the line itself — never write "he said" or "she replied" in the dialogue field
- One clear beat per caption or dialogue line; split long thoughts across panels
- End key lines on a period or ellipsis so the narrator can land the beat

VISUAL RULES:
- Each panel should be describable in one strong image
- If two panels have the same composition (two people talking at a desk),
  change the angle, distance, or staging of one
- Use the environment as a character — rain, light, reflections, shadows
  should reflect the emotional state of the scene
`;

export function getArchetypeSpeechPattern(archetype: string): string {
  const patterns: Record<string, string> = {
    detective:
      "Short declarative sentences. Questions that aren't really questions. Observations delivered flat.",
    'femme fatale':
      'Never answers directly. Deflects with compliments or redirections. Says more with less.',
    'corrupt official':
      'Formal language that slips when threatened. Uses "we" when he means "I".',
    witness:
      'Over-explains. Nervous tangents. The important detail buried in the middle.',
    antagonist:
      "Calm. Almost warm. The threat is in what they don't need to say.",
    ally:
      'Direct, loyal, slightly behind — they understand less than the protagonist but feel more.',
  };
  return (
    patterns[archetype.toLowerCase()] ||
    'Speak from their archetype. Be specific to who they are, not what they represent.'
  );
}

export function buildCharacterVoiceCards(characters: CharacterForVoice[]): string {
  return characters
    .map(
      c => `
CHARACTER VOICE — ${c.name} (${c.archetype}):
  Personality: ${c.personality.trim() || 'Infer from their role and the scene.'}
  Current mood: ${c.current_mood}
  char_id: ${c.char_id}
  Speech pattern: ${getArchetypeSpeechPattern(c.archetype)}
  What they want in this scene: unknown to them, drive it from their archetype
  What they are hiding: ${c.secret || 'unknown — let it show in what they avoid saying'}
  `
    )
    .join('\n');
}

export function getLightingForGenre(genre: string): string {
  const lighting: Record<string, string> = {
    noir: 'single hard light source, deep shadows, venetian blind patterns, wet reflections on pavement',
    horror:
      'underlighting, darkness at edges, single cold light source, shadows that move wrong',
    comedy: 'bright even lighting, warm tones, no dramatic shadows',
    fantasy:
      'magical light sources, saturated but soft, practical light from torches or magic',
    'sci-fi':
      'blue-white LED light, screens glowing, hard shadows in zero-gravity settings',
    western:
      'harsh sun overhead or golden hour low angle, dust particles visible in light beams',
  };
  return (
    lighting[genre.toLowerCase()] ||
    'naturalistic lighting appropriate to the setting'
  );
}

export function getCameraForLayoutHint(layoutHint: string): string {
  switch (layoutHint) {
    case 'close-up':
      return 'extreme close-up, face fills frame';
    case 'wide':
      return 'wide establishing shot, figures small in environment';
    case 'tall':
      return 'vertical composition, use height for drama';
    default:
      return 'medium shot, waist up, clear staging';
  }
}
