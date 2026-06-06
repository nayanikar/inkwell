export type ScenePanelJson = {
  panel_num: number;
  caption: string;
  speaker: string;
  dialogue: string;
  image_prompt: string;
  layout_hint: string;
};

export type SceneJson = {
  title: string;
  scene_summary?: string;
  panels: ScenePanelJson[];
  character_updates?: { char_id: number; new_mood: string }[];
  new_memories?: {
    char_id: number;
    panel_num: number;
    event_text: string;
  }[];
};
