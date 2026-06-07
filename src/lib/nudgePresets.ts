export type NudgePreset = {
  type: string;
  label: string;
  content: string;
  voiceTriggers?: string[];
};

export const NUDGE_PRESETS: Record<string, NudgePreset[]> = {
  noir: [
    {
      type: 'tension',
      label: 'Reveal someone is lying',
      content: 'Someone is lying.',
      voiceTriggers: [
        'reveal someone is lying',
        'someone is lying',
        'they are lying',
        'expose the lie',
      ],
    },
    {
      type: 'plot',
      label: 'Introduce a witness',
      content: 'A witness appears with new information.',
      voiceTriggers: [
        'introduce a witness',
        'add a witness',
        'bring in a witness',
        'witness appears',
      ],
    },
    {
      type: 'tone',
      label: 'Push the tone darker',
      content: 'Let the weather turn hostile and the mood turn grim.',
      voiceTriggers: [
        'push the tone darker',
        'make it darker',
        'go darker',
        'darken the mood',
        'turn grim',
      ],
    },
    {
      type: 'tone',
      label: 'Bring the rain back',
      content: 'Rain returns and soaks the scene.',
      voiceTriggers: ['bring the rain back', 'make it rain', 'start raining'],
    },
  ],
  default: [
    {
      type: 'plot',
      label: 'Twist',
      content: 'Introduce an unexpected complication.',
      voiceTriggers: [
        'introduce a twist',
        'add a twist',
        'twist',
        'unexpected complication',
        'plot twist',
      ],
    },
    {
      type: 'tone',
      label: 'Mood shift',
      content: 'Shift the emotional temperature.',
      voiceTriggers: ['mood shift', 'shift the mood', 'change the mood'],
    },
    {
      type: 'tension',
      label: 'Raise stakes',
      content: 'Make the consequences clearer.',
      voiceTriggers: ['raise the stakes', 'raise stakes', 'higher stakes'],
    },
    {
      type: 'character',
      label: 'Spotlight conflict',
      content: 'Spotlight one character’s inner conflict.',
      voiceTriggers: [
        'spotlight conflict',
        'inner conflict',
        'focus on conflict',
        'character conflict',
      ],
    },
  ],
};

export function getNudgePresets(genre: string): NudgePreset[] {
  return NUDGE_PRESETS[genre] ?? NUDGE_PRESETS.default;
}
