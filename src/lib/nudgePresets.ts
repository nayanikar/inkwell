export type NudgePreset = {
  type: string;
  label: string;
  content: string;
};

export const NUDGE_PRESETS: Record<string, NudgePreset[]> = {
  noir: [
    {
      type: 'tension',
      label: 'Reveal someone is lying',
      content: 'Someone is lying.',
    },
    {
      type: 'plot',
      label: 'Introduce a witness',
      content: 'A witness appears with new information.',
    },
    {
      type: 'tone',
      label: 'Push the tone darker',
      content: 'Let the weather turn hostile and the mood turn grim.',
    },
    {
      type: 'tone',
      label: 'Bring the rain back',
      content: 'Rain returns and soaks the scene.',
    },
  ],
  default: [
    {
      type: 'plot',
      label: 'Twist',
      content: 'Introduce an unexpected complication.',
    },
    {
      type: 'tone',
      label: 'Mood shift',
      content: 'Shift the emotional temperature.',
    },
    {
      type: 'tension',
      label: 'Raise stakes',
      content: 'Make the consequences clearer.',
    },
    {
      type: 'character',
      label: 'Spotlight conflict',
      content: 'Spotlight one character’s inner conflict.',
    },
  ],
};

export function getNudgePresets(genre: string): NudgePreset[] {
  return NUDGE_PRESETS[genre] ?? NUDGE_PRESETS.default;
}
