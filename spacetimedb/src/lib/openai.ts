import { SenderError } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { OPENAI_API_KEY } from './env.generated.js';
import { base64Decode, base64Encode } from './base64.js';

type HttpFetchResponse = {
  status: number;
  text: () => string;
  json: () => unknown;
  bytes?: () => Uint8Array;
};

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
    ) => HttpFetchResponse;
  };
  random?: {
    integerInRange: (min: number, max: number) => number;
  };
};

const GENERATIONS_BODY = {
  model: 'gpt-image-2',
  n: 1,
  size: '1536x1024',
  quality: 'medium',
} as const;

function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return binary;
}

function binaryToBase64(binary: string): string {
  return base64Encode(binary);
}

/** Always store durable data URLs — never ephemeral OpenAI HTTPS links. */
function parseImageResponse(
  ctx: HttpCtx,
  response: { json: () => unknown }
): string {
  const data = response.json() as {
    data?: { url?: string; b64_json?: string }[];
  };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  if (item?.url) {
    const resolved = fetchRemoteImageBytes(ctx, item.url);
    if (!resolved) {
      throw new SenderError('Failed to fetch OpenAI image URL');
    }
    const b64 = binaryToBase64(resolved.bytes);
    return `data:${resolved.mime};base64,${b64}`;
  }
  throw new SenderError('Failed to parse OpenAI image response');
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: string } {
  const trimmed = dataUrl.trim();
  const comma = trimmed.indexOf(',');
  if (comma < 0 || !trimmed.startsWith('data:')) {
    throw new SenderError('Invalid image data URL');
  }
  const header = trimmed.slice(5, comma);
  const mime = header.replace(/;base64$/i, '');
  const b64 = trimmed.slice(comma + 1);
  const binary = base64Decode(b64);
  return { mime: mime || 'image/png', bytes: binary };
}

function fetchRemoteImageBytes(
  ctx: HttpCtx,
  url: string
): { mime: string; bytes: string } | null {
  try {
    const response = ctx.http.fetch(url, {
      method: 'GET',
      timeout: TimeDuration.fromMillis(60_000),
    });
    if (response.status !== 200) {
      return null;
    }
    const rawBytes = response.bytes?.();
    if (!rawBytes || rawBytes.length === 0) {
      return null;
    }
    return { mime: 'image/png', bytes: bytesToBinaryString(rawBytes) };
  } catch {
    return null;
  }
}

function resolveReferenceBytes(
  ctx: HttpCtx,
  url: string
): { mime: string; bytes: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    try {
      return decodeDataUrl(trimmed);
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return fetchRemoteImageBytes(ctx, trimmed);
  }

  return null;
}

function buildMultipartBody(
  ctx: HttpCtx,
  fields: Record<string, string>,
  files: { field: string; filename: string; mime: string; bytes: string }[]
): { body: string; boundary: string } {
  const nonce = ctx.random?.integerInRange(0, 999_999) ?? Date.now() % 1_000_000;
  const boundary = `----Inkwell${Date.now()}${nonce}`;
  let body = '';

  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
    body += `${value}\r\n`;
  }

  for (const file of files) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n`;
    body += `Content-Type: ${file.mime}\r\n\r\n`;
    body += file.bytes;
    body += '\r\n';
  }

  body += `--${boundary}--\r\n`;
  return { body, boundary };
}

export function callOpenAI(ctx: HttpCtx, fullPrompt: string): string {
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
        ...GENERATIONS_BODY,
        prompt: fullPrompt,
      }),
      timeout: TimeDuration.fromMillis(180_000),
    }
  );

  if (response.status !== 200) {
    throw new SenderError(
      `OpenAI API returned status ${response.status}: ${response.text()}`
    );
  }

  return parseImageResponse(ctx, response);
}

/** Generate a page using character reference sheets and optional prior scene page. */
export function callOpenAIWithReferences(
  ctx: HttpCtx,
  fullPrompt: string,
  referenceImageUrls: string[]
): string {
  const refs = referenceImageUrls.map(u => u.trim()).filter(Boolean);
  if (refs.length === 0) {
    return callOpenAI(ctx, fullPrompt);
  }

  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    throw new SenderError('OPENAI_API_KEY is not configured');
  }

  const files = refs
    .map((url, index) => {
      const resolved = resolveReferenceBytes(ctx, url);
      if (!resolved) return null;
      return {
        field: 'image[]',
        filename: `ref-${index + 1}.png`,
        mime: resolved.mime,
        bytes: resolved.bytes,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);

  if (files.length === 0) {
    console.error(
      'No usable reference images — falling back to text-only generation'
    );
    return callOpenAI(ctx, fullPrompt);
  }

  const { body, boundary } = buildMultipartBody(
    ctx,
    {
      model: 'gpt-image-2',
      prompt: fullPrompt,
      size: '1536x1024',
      quality: 'medium',
    },
    files
  );

  const response = ctx.http.fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    timeout: TimeDuration.fromMillis(240_000),
  });

  if (response.status !== 200) {
    console.error(
      `OpenAI edits API failed (${response.status}), falling back to generations:`,
      response.text().slice(0, 200)
    );
    return callOpenAI(ctx, fullPrompt);
  }

  return parseImageResponse(ctx, response);
}

/** Normalize legacy https refs to data URLs when possible. */
export function normalizeStoredImageUrl(
  ctx: HttpCtx,
  url: string | undefined
): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const resolved = fetchRemoteImageBytes(ctx, trimmed);
    if (!resolved) return trimmed;
    const b64 = binaryToBase64(resolved.bytes);
    return `data:${resolved.mime};base64,${b64}`;
  }

  return trimmed;
}
