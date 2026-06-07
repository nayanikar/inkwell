import type { NudgePreset } from './nudgePresets';

export type ParsedVoiceNudge = {
  type: string;
  content: string;
  matchedPreset?: NudgePreset;
  /** Preset matches apply immediately; free-form speech queues by default. */
  applyImmediately: boolean;
};

const COMMAND_PREFIXES = [
  /^nudge[:\s]+/i,
  /^direct[:\s]+/i,
  /^tell the story to[:\s]+/i,
  /^make the (next )?scene[:\s]+/i,
  /^i want to[:\s]+/i,
];

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCommandPrefix(text: string): string {
  let result = text.trim();
  for (const pattern of COMMAND_PREFIXES) {
    result = result.replace(pattern, '').trim();
  }
  return result;
}

function presetTriggers(preset: NudgePreset): string[] {
  const triggers = new Set<string>();
  triggers.add(normalizeSpeech(preset.label));
  triggers.add(normalizeSpeech(preset.content));

  for (const phrase of preset.voiceTriggers ?? []) {
    triggers.add(normalizeSpeech(phrase));
  }

  const labelWords = normalizeSpeech(preset.label);
  if (labelWords.length >= 4) triggers.add(labelWords);

  return [...triggers].filter(Boolean);
}

function scorePresetMatch(normalized: string, trigger: string): number {
  if (normalized === trigger) return 100;
  if (normalized.includes(trigger) && trigger.length >= 6) return 80 + trigger.length;
  if (trigger.includes(normalized) && normalized.length >= 6) return 70 + normalized.length;

  const normalizedWords = new Set(normalized.split(' '));
  const triggerWords = trigger.split(' ').filter(w => w.length > 2);
  if (triggerWords.length === 0) return 0;

  const overlap = triggerWords.filter(w => normalizedWords.has(w)).length;
  const ratio = overlap / triggerWords.length;
  if (ratio >= 0.75 && overlap >= 2) return 50 + overlap * 5;
  return 0;
}

export function parseVoiceNudgeCommand(
  rawTranscript: string,
  presets: NudgePreset[]
): ParsedVoiceNudge | null {
  const stripped = stripCommandPrefix(rawTranscript);
  const normalized = normalizeSpeech(stripped);
  if (!normalized) return null;

  let bestPreset: NudgePreset | undefined;
  let bestScore = 0;

  for (const preset of presets) {
    for (const trigger of presetTriggers(preset)) {
      const score = scorePresetMatch(normalized, trigger);
      if (score > bestScore) {
        bestScore = score;
        bestPreset = preset;
      }
    }
  }

  if (bestPreset && bestScore >= 50) {
    return {
      type: bestPreset.type,
      content: bestPreset.content,
      matchedPreset: bestPreset,
      applyImmediately: true,
    };
  }

  return {
    type: 'custom',
    content: stripped,
    applyImmediately: false,
  };
}

export function describeVoiceNudgeResult(result: ParsedVoiceNudge): string {
  if (result.matchedPreset) {
    return `Voice: ${result.matchedPreset.label}`;
  }
  const preview = result.content.slice(0, 48);
  return `Voice: ${preview}${result.content.length > 48 ? '…' : ''}`;
}
