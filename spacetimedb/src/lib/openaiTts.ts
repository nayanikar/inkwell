import { SenderError } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { OPENAI_API_KEY } from './env.generated.js';
import { base64Encode } from './base64.js';

/** Professional neutral voice — works across noir, fantasy, comedy, etc. */
export const NARRATION_VOICE = 'alloy';
/** HD model for smoother, less robotic prosody (~2× cost vs tts-1). */
export const NARRATION_MODEL = 'tts-1-hd';
/** 1.0 avoids speed-parameter distortion reported on OpenAI TTS. */
export const NARRATION_SPEED = 1.0;

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
  opts?: { voice?: string; speed?: number }
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
      speed: opts?.speed ?? NARRATION_SPEED,
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
