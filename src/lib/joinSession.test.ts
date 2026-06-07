import { describe, expect, it } from 'vitest';
import {
  normalizeInviteCode,
  parseJoinCredentials,
  parseSessionId,
} from './joinSession';

describe('parseSessionId', () => {
  it('parses numeric session ids', () => {
    expect(parseSessionId('42')).toBe(42n);
  });

  it('rejects non-numeric values', () => {
    expect(parseSessionId('abc')).toBeNull();
    expect(parseSessionId('https://x/?session=1')).toBeNull();
  });
});

describe('normalizeInviteCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeInviteCode(' abcd1234 ')).toBe('ABCD1234');
  });
});

describe('parseJoinCredentials', () => {
  it('parses separate session id and code', () => {
    const result = parseJoinCredentials('99', 'abcd1234');
    expect(result).toEqual({ sessionId: 99n, inviteCode: 'ABCD1234' });
  });

  it('parses a full invite URL pasted in the session field', () => {
    const result = parseJoinCredentials(
      'https://inkwell-opal.vercel.app/?session=123&code=xyz789ab',
      ''
    );
    expect(result).toEqual({ sessionId: 123n, inviteCode: 'XYZ789AB' });
  });

  it('returns a helpful error for invalid session input', () => {
    const result = parseJoinCredentials('not-a-link', 'ABCD1234');
    expect(result).toHaveProperty('error');
  });
});
