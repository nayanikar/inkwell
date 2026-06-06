export type PanelStatus = 'generating' | 'done' | 'error';

export type PanelData = {
  panelId?: bigint;
  panelNum: number;
  caption: string;
  speaker: string;
  dialogue: string;
  imageUrl: string;
  imagePrompt?: string;
  layoutHint: string;
  status: PanelStatus;
};

export type CharacterData = {
  charId: bigint;
  name: string;
  archetype: string;
  personality: string;
  currentMood: string;
};

export type SessionData = {
  sessionId: bigint;
  genre: string;
  setting: string;
  totalScenes: number;
  currentScene: number;
  status: string;
};

export type DirectiveType = 'plot' | 'tone' | 'character' | 'custom' | string;
