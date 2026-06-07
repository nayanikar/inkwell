let narrationAudioUnlocked = false;

/** Prime browser audio from a user gesture so later auto-narration can play. */
export function unlockNarrationAudio(): void {
  if (narrationAudioUnlocked || typeof window === 'undefined') return;

  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      void ctx.resume();
    }
  } catch {
    // Ignore — silent play below may still succeed.
  }

  const silent = new Audio(
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
  );
  silent.volume = 0;
  void silent.play().then(() => {
    narrationAudioUnlocked = true;
  }).catch(() => {
    // User gesture may still allow a later explicit play().
  });
}
