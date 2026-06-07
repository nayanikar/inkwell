export type CharacterVisualInput = {
  char_id?: bigint;
  name: string;
  archetype: string;
  visual_description?: string;
};

export const VISUAL_CONSISTENCY_RULES = `
VISUAL CONSISTENCY — non-negotiable across every scene:
- Each character is ONE fixed species and body type. Never change mouse to goat, deer to human, etc.
- Reuse the exact same face shape, ear/horn/antler style, eye size, fur/hair, and proportions every scene.
- Default outfit is locked unless scene_wardrobe specifies a change for this scene only.
- Give each character a distinct silhouette (height, ear shape, clothing mass) so they never merge.
- image_prompt must name characters exactly and describe pose/action only — NOT redesign their species or face.
- characters_present lists who appears in that panel (exact names from the cast).
`.trim();

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildLockedVisualAnchor(c: CharacterVisualInput): string {
  const name = c.name.trim();
  const desc = normalizeWhitespace(c.visual_description ?? '');
  const archetype = normalizeWhitespace(c.archetype);

  if (desc.length >= 24) {
    return `${name}: ${desc}. Keep identical species, face, proportions, and default outfit across all scenes.`;
  }

  const fallback = desc || archetype || 'simple cartoon character';
  return `${name}: ${fallback}. Same species and face every scene — never redesign as a different animal or human type. Distinct silhouette, simple iconic ink cartoon.`;
}

export function buildCharacterVisualCards(
  characters: CharacterVisualInput[]
): string {
  const lines = characters.map(c => {
    const id = c.char_id != null ? ` (char_id ${c.char_id})` : '';
    return `- ${c.name}${id}: ${buildLockedVisualAnchor(c)}`;
  });
  return ['CHARACTER VISUAL LOCKS (never change species or face):', ...lines].join('\n');
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
      : ' Same default outfit as reference.';
    return `${name}: ${look}${outfit} Simple iconic ink cartoon — preserve exactly.`;
  });

  return [
    'CHARACTER ANCHORS (DO NOT REDESIGN — match reference images if provided):',
    ...lines,
    'CONSTRAINTS: Same species, face shape, ear/horn style, proportions, and linework in every panel. Only vary pose, expression, and camera angle.',
  ].join('\n');
}

export function buildSceneWardrobeBlock(
  characters: CharacterVisualInput[],
  wardrobe?: { char_id: number; outfit: string }[]
): string {
  if (!wardrobe?.length) return '';
  const byId = new Map(characters.map(c => [Number(c.char_id ?? 0n), c.name]));
  const lines = wardrobe
    .map(w => {
      const name = byId.get(w.char_id) ?? `char ${w.char_id}`;
      return `- ${name}: ${w.outfit.trim()}`;
    })
    .filter(l => !l.endsWith(':'));
  if (lines.length === 0) return '';
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
    return cast.map(c => c.name.trim());
  }
  return [...names];
}

export function buildCharacterReferencePrompt(
  character: CharacterVisualInput,
  styleBible: string
): string {
  const anchor = buildLockedVisualAnchor(character);
  return [
    styleBible,
    'Character model sheet, single character only, plain white background.',
    'Black and white pen-and-ink cartoon, front 3/4 view, full body, bold outlines, cross-hatching.',
    `Character name: ${character.name.trim()}.`,
    `LOCKED DESIGN: ${anchor}`,
    'No text, no speech balloons, no other characters, no scenery.',
  ].join('\n');
}
