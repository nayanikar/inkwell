/** Auto-increment session IDs start at 1; 0 is never stored. */
export const NO_SESSION_ID = 0n;

export function sessionIdForFilter(sessionId: bigint | null): bigint {
  return sessionId ?? NO_SESSION_ID;
}
