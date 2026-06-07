export type ScenePanelJson = {
  panel_num: number;
  caption: string;
  speaker: string;
  dialogue: string;
  image_prompt: string;
  layout_hint: string;
  characters_present?: string[];
};

export type SceneJson = {
  title: string;
  scene_summary?: string;
  scene_wardrobe?: { char_id: number; outfit: string }[];
  panels: ScenePanelJson[];
  character_updates?: { char_id: number; new_mood: string }[];
  new_memories?: {
    char_id: number;
    panel_num: number;
    event_text: string;
  }[];
};
