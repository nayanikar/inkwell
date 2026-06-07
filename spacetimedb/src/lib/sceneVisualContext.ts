import type { SceneJson } from './types.js';

export type SceneVisualContext = {
  scene_wardrobe?: SceneJson['scene_wardrobe'];
  panels?: { panel_num: number; characters_present?: string[] }[];
};

export function buildVisualContextJson(sceneJson: SceneJson): string {
  const context: SceneVisualContext = {
    scene_wardrobe: sceneJson.scene_wardrobe,
    panels: sceneJson.panels.map(p => ({
      panel_num: p.panel_num,
      characters_present: p.characters_present,
    })),
  };
  return JSON.stringify(context);
}

export function parseVisualContextJson(raw?: string): SceneVisualContext | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw) as SceneVisualContext;
  } catch {
    return undefined;
  }
}

export function mergePanelCast(
  panels: {
    panel_num: number;
    caption: string;
    speaker: string;
    dialogue: string;
    image_prompt: string;
    layout_hint: string;
  }[],
  visualContext?: SceneVisualContext
) {
  const castByPanel = new Map(
    (visualContext?.panels ?? []).map(p => [p.panel_num, p.characters_present])
  );
  return panels.map(panel => ({
    ...panel,
    characters_present: castByPanel.get(panel.panel_num),
  }));
}
