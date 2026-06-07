import { SenderError } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { OPENAI_API_KEY } from './env.generated.js';
import { base64Encode } from './base64.js';

/** OpenAI recommends marin/cedar for highest-quality narration. */
export const NARRATION_VOICE = 'marin';
/**
 * Expressive snapshot — follows `instructions` reliably for audiobook-style delivery.
 * (The Dec 2025 snapshot trades steerability for lower word error rate.)
 */
export const NARRATION_MODEL = 'gpt-4o-mini-tts-2025-03-20';
export const NARRATION_INSTRUCTIONS =
  'Warm, natural audiobook narrator. Clear diction, conversational pacing, ' +
  'subtle emotional range. Never robotic or announcer-like. Brief pauses between beats.';

export function callOpenAITts(
  ctx: {
    http: {
      fetch: (
        url: string,
        options?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
          timeout?: ReturnType<typeof TimeDuration.fromMillis>;
        }
      ) => {
        status: number;
        text: () => string;
        bytes: () => Uint8Array;
      };
    };
  },
  input: string,
  opts?: { voice?: string; instructions?: string }
): string {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    throw new SenderError('OPENAI_API_KEY is not configured');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new SenderError('Narration script is empty');
  }

  const response = ctx.http.fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NARRATION_MODEL,
      voice: opts?.voice ?? NARRATION_VOICE,
      input: trimmed,
      instructions: opts?.instructions ?? NARRATION_INSTRUCTIONS,
      response_format: 'mp3',
    }),
    timeout: TimeDuration.fromMillis(60_000),
  });

  if (response.status !== 200) {
    throw new SenderError(
      `OpenAI TTS returned status ${response.status}: ${response.text()}`
    );
  }

  const bytes = response.bytes();
  if (!bytes || bytes.length === 0) {
    throw new SenderError('OpenAI TTS returned empty audio');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = base64Encode(binary);
  return `data:audio/mpeg;base64,${b64}`;
}
