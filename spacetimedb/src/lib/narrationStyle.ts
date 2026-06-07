/**
 * Genre-neutral audiobook narration principles (applied to TTS script formatting):
 * - Clarity: every word understandable; short speakable sentences
 * - Controlled pacing: conversational speed, strategic pauses between beats
 * - Restraint: text leads; avoid over-dramatization or stiff meta-phrasing
 * - Neutral engagement: warm, crisp vessel for the story — not a "machine" or announcer
 * - Comprehension first: slightly slower delivery on dense lines
 */

export const NARRATION_SEGMENT_GAP_MS = 450;

/** Soft pause marker TTS often respects via prosody (not read aloud). */
export function trailingPause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

export function formatCaptionForSpeech(caption: string): string {
  return trailingPause(caption.trim());
}

/** Speak the line itself — no "Name said," prefix (reads robotic on TTS). */
export function formatDialogueForSpeech(dialogue: string): string {
  const line = dialogue.trim();
  if (!line) return '';
  if (/^["']/.test(line)) return trailingPause(line);
  return trailingPause(`"${line}"`);
}

export function formatSceneTitleForSpeech(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '';
  return trailingPause(trimmed);
}
