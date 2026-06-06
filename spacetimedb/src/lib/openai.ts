import { SenderError } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { OPENAI_API_KEY } from './env.generated.js';

export function callOpenAI(
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
        json: () => unknown;
      };
    };
  },
  fullPrompt: string
): string {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    throw new SenderError('OPENAI_API_KEY is not configured');
  }

  const response = ctx.http.fetch(
    'https://api.openai.com/v1/images/generations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      }),
      timeout: TimeDuration.fromMillis(180_000),
    }
  );

  if (response.status !== 200) {
    throw new SenderError(
      `OpenAI API returned status ${response.status}: ${response.text()}`
    );
  }

  const data = response.json() as {
    data?: { url?: string; b64_json?: string }[];
  };
  const item = data.data?.[0];
  if (item?.url) {
    return item.url;
  }
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }

  throw new SenderError('Failed to parse OpenAI image response');
}
