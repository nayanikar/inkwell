export type CharacterVisualInput = {
  char_id?: bigint;
  name: string;
  archetype: string;
  visual_description?: string;
  current_outfit?: string;
};

const NON_HUMAN_PATTERNS =
  /\b(animal|creature|monster|robot|android|alien|goat|cat|dog|mouse|deer|bird|dragon|demon|ghost|spirit|beast|anthropomorphic|furry|non-human|wolf|fox|rabbit|bear|pig|horse|cow|sheep|fish|insect|reptile|amphibian)\b/i;

const APPEARANCE_DRIFT_PATTERNS = [
  /\b(red|blue|green|black|white|blonde|brunette|auburn|ginger)\s+(hair|coat|dress|shirt|jacket|eyes|suit)\b/gi,
  /\b(new|different|changed|altered)\s+(outfit|appearance|look|hairstyle|face|design|species)\b/gi,
  /\b(suddenly|now)\s+(looks|appears|wearing|dressed)\b/gi,
  /\b(anthropomorphic|animal|goat|deer|mouse|creature|monster|furry|species)\b/gi,
  /\b(tall|short|muscular|heavyset|thin)\s+(woman|man|figure|person|character)\b/gi,
  /\blooks like\b[^.;,]*/gi,
  /\bwearing a\b[^.;,]{0,60}\b(coat|dress|suit|uniform|hat|robe|armor)\b/gi,
];

export function isExplicitlyNonHuman(visualDescription: string): boolean {
  return NON_HUMAN_PATTERNS.test(visualDescription);
}

export const HUMAN_DEFAULT_RULE = `
HUMAN DEFAULT — all characters are human adults unless visual_description explicitly says otherwise (e.g. robot, animal, creature). Never depict human characters as animals or anthropomorphic animals.
`.trim();

export const VISUAL_CONSISTENCY_RULES = `
VISUAL CONSISTENCY — non-negotiable across every scene:
- Each character is ONE fixed human appearance and body type unless visual_description explicitly specifies non-human.
- Reuse the exact same face shape, hair style, eye size, skin tone, and proportions every scene.
- Default outfit is locked unless scene_wardrobe specifies a change for this scene only.
- Give each character a distinct silhouette (height, build, hair, clothing) so they never merge.
- image_prompt must describe pose, expression, action, environment, and camera angle ONLY — never appearance, clothing, hair, or body type.
- characters_present lists who appears in that panel (exact names from the cast).
- Never draw human characters as animals, goats, or anthropomorphic creatures.
- scene_wardrobe must use the exact char_id values from CHARACTER VISUAL LOCKS.
`.trim();

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function sanitizePanelImagePrompt(prompt: string): string {
  let cleaned = normalizeWhitespace(prompt);
  for (const pattern of APPEARANCE_DRIFT_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\-–—\s]+|[,.\-–—\s]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 8) {
    return 'Pose, expression, action, environment, and camera angle only';
  }
  return cleaned;
}

function defaultHumanLook(archetype: string): string {
  const role = archetype.trim() || 'story character';
  return `human adult, expressive ink-cartoon style, clearly human face and proportions, dressed fitting their role as ${role}`;
}

export function buildLockedVisualAnchor(c: CharacterVisualInput): string {
  const name = c.name.trim();
  const desc = normalizeWhitespace(c.visual_description ?? '');
  const archetype = normalizeWhitespace(c.archetype);
  const nonHuman = isExplicitlyNonHuman(desc);

  if (desc.length >= 24) {
    const consistency = nonHuman
      ? 'Keep identical appearance, face, proportions, and default outfit across all scenes.'
      : 'Human character — keep identical face, hair, body proportions, and default outfit across all scenes.';
    return `${name}: ${desc}. ${consistency}`;
  }

  if (desc.length > 0) {
    const consistency = nonHuman
      ? 'Same appearance and face every scene — never redesign.'
      : 'Human character — same face, hair, and body type every scene. Never depict as an animal.';
    return `${name}: ${desc}. ${consistency} Distinct silhouette, simple iconic ink cartoon.`;
  }

  const humanLook = defaultHumanLook(archetype);
  return `${name}: ${humanLook}. Human only — never depict as an animal or anthropomorphic creature. Distinct silhouette, simple iconic ink cartoon.`;
}

export function buildCharacterVisualCards(
  characters: CharacterVisualInput[]
): string {
  const lines = characters.map(c => {
    const id = c.char_id != null ? ` (char_id ${c.char_id})` : '';
    return `- ${c.name}${id}: ${buildLockedVisualAnchor(c)}`;
  });
  return [
    HUMAN_DEFAULT_RULE,
    'CHARACTER VISUAL LOCKS (never change face or body type):',
    ...lines,
  ].join('\n');
}

export function resolveWardrobeMap(
  characters: CharacterVisualInput[],
  wardrobe?: { char_id: number; outfit: string }[]
): Map<string, string> {
  const wardrobeMap = new Map<string, string>();
  if (!wardrobe?.length) return wardrobeMap;

  const byId = new Map(
    characters.map(c => [Number(c.char_id ?? 0n), c.name.trim()])
  );
  for (const w of wardrobe) {
    let name = byId.get(w.char_id);
    if (!name && w.char_id >= 1 && w.char_id <= characters.length) {
      name = characters[w.char_id - 1]?.name.trim();
    }
    if (name && w.outfit?.trim()) {
      wardrobeMap.set(name, w.outfit.trim());
    }
  }
  return wardrobeMap;
}

export function buildCharacterAnchorBlock(
  characters: CharacterVisualInput[],
  sceneWardrobe?: Map<string, string>
): string {
  const lines = characters.map(c => {
    const name = c.name.trim().toUpperCase();
    const wardrobe = sceneWardrobe?.get(c.name.trim());
    const look = buildLockedVisualAnchor(c);
    const outfit = wardrobe
      ? ` Scene outfit: ${wardrobe}.`
      : c.current_outfit?.trim()
        ? ` Locked outfit: ${c.current_outfit.trim()}.`
        : ' Same default outfit as reference.';
    return `${name}: ${look}${outfit} Simple iconic ink cartoon — preserve exactly.`;
  });

  return [
    HUMAN_DEFAULT_RULE,
    'CHARACTER ANCHORS (DO NOT REDESIGN — match reference images if provided):',
    ...lines,
    'CONSTRAINTS: Same human face, hair style, body proportions, and linework in every panel. Only vary pose, expression, and camera angle. Never depict as animals.',
  ].join('\n');
}

export function buildSceneWardrobeBlock(
  characters: CharacterVisualInput[],
  wardrobe?: { char_id: number; outfit: string }[]
): string {
  const wardrobeMap = resolveWardrobeMap(characters, wardrobe);
  if (wardrobeMap.size === 0) return '';

  const lines = [...wardrobeMap.entries()].map(
    ([name, outfit]) => `- ${name}: ${outfit}`
  );
  return ['SCENE WARDROBE (locked for all panels this scene):', ...lines].join('\n');
}

export function resolveCharactersInPanel(
  panel: { speaker?: string; characters_present?: string[] },
  cast: CharacterVisualInput[]
): string[] {
  const names = new Set<string>();
  for (const n of panel.characters_present ?? []) {
    const t = n.trim();
    if (t) names.add(t);
  }
  const speaker = panel.speaker?.trim();
  if (speaker) names.add(speaker);

  if (names.size === 0) {
    if (speaker) return [speaker];
    return [];
  }
  return [...names];
}

export function buildCharacterReferencePrompt(
  character: CharacterVisualInput,
  styleBible: string
): string {
  const anchor = buildLockedVisualAnchor(character);
  const desc = normalizeWhitespace(character.visual_description ?? '');
  const humanNote = isExplicitlyNonHuman(desc)
    ? 'Draw as specified in LOCKED DESIGN.'
    : 'Human character model sheet — clearly human face, hair, and body proportions. Never draw as an animal or anthropomorphic creature.';

  return [
    styleBible,
    HUMAN_DEFAULT_RULE,
    'Character model sheet, single character only, plain white background.',
    'Black and white pen-and-ink cartoon, front 3/4 view, full body, bold outlines, cross-hatching.',
    `Character name: ${character.name.trim()}.`,
    humanNote,
    `LOCKED DESIGN: ${anchor}`,
    'This model sheet is the canonical design — every future scene must match this face, hair, and body exactly.',
    'No text, no speech balloons, no other characters, no scenery.',
  ].join('\n');
}
