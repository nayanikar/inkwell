import { SenderError } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { parseSceneJson } from './prompts.js';
import type { SceneJson } from './types.js';
import { ANTHROPIC_API_KEY } from './env.generated.js';

type HttpCtx = {
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
      json: () => unknown;
    };
  };
};

export function callAnthropic(ctx: HttpCtx, prompt: string): SceneJson {
  const apiKey = ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new SenderError('ANTHROPIC_API_KEY is not configured');
  }

  const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    timeout: TimeDuration.fromMillis(120_000),
  });

  if (response.status !== 200) {
    throw new SenderError(
      `Anthropic API returned status ${response.status}: ${response.text()}`
    );
  }

  const data = response.json() as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find(c => c.type === 'text')?.text;
  if (!text) {
    throw new SenderError('Failed to parse Anthropic response');
  }

  return parseSceneJson(text);
}
