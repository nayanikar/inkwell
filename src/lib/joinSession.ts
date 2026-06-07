export type JoinCredentials = {
  sessionId: bigint;
  inviteCode: string;
};

export type JoinParseError = {
  error: string;
};

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function parseSessionId(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

function extractFromUrlLike(input: string): { session?: string; code?: string } {
  const trimmed = input.trim();
  if (!trimmed) return {};

  try {
    const url = trimmed.startsWith('http')
      ? new URL(trimmed)
      : new URL(
          trimmed.startsWith('?')
            ? `https://inkwell.local/${trimmed}`
            : `https://inkwell.local/?${trimmed}`
        );
    return {
      session: url.searchParams.get('session') ?? undefined,
      code: url.searchParams.get('code') ?? undefined,
    };
  } catch {
    return {};
  }
}

export function parseJoinCredentials(
  sessionInput: string,
  codeInput: string
): JoinCredentials | JoinParseError {
  let sessionRaw = sessionInput.trim();
  let codeRaw = codeInput.trim();

  if (!sessionRaw && codeRaw) {
    const fromCodeField = extractFromUrlLike(codeRaw);
    if (fromCodeField.session) {
      sessionRaw = fromCodeField.session;
      codeRaw = fromCodeField.code ?? '';
    }
  }

  if (
    sessionRaw.includes('session=') ||
    sessionRaw.startsWith('http://') ||
    sessionRaw.startsWith('https://') ||
    sessionRaw.startsWith('?')
  ) {
    const fromUrl = extractFromUrlLike(sessionRaw);
    if (fromUrl.session) sessionRaw = fromUrl.session;
    if (fromUrl.code && !codeRaw) codeRaw = fromUrl.code;
  }

  const sessionId = parseSessionId(sessionRaw);
  if (sessionId == null) {
    return {
      error:
        'Enter the session number from the invite link, or paste the full link above.',
    };
  }

  const inviteCode = normalizeInviteCode(codeRaw);
  if (!inviteCode) {
    return {
      error:
        'Enter the invite code from the link — it’s the 8-character code after “code=”.',
    };
  }

  return { sessionId, inviteCode };
}
