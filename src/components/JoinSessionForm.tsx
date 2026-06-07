import { useEffect, useState } from 'react';

type JoinSessionFormProps = {
  connected: boolean;
  isJoining?: boolean;
  onJoin: (sessionId: string, inviteCode: string) => void;
};

export default function JoinSessionForm({
  connected,
  isJoining = false,
  onJoin,
}: JoinSessionFormProps) {
  const [sessionId, setSessionId] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const codeParam = params.get('code');
    if (sessionParam) setSessionId(sessionParam);
    if (codeParam) setInviteCode(codeParam);
  }, []);

  return (
    <form
      className="mt-8 flex w-full max-w-md flex-col gap-2 border border-ink/20 bg-paper/50 p-4"
      onSubmit={e => {
        e.preventDefault();
        if (!sessionId.trim() && !inviteCode.trim()) return;
        onJoin(sessionId, inviteCode);
      }}
    >
      <p className="font-label text-[10px] uppercase tracking-widest text-ink/70">
        Join a friend&apos;s story
      </p>
      <p className="text-sm leading-snug text-ink-muted">
        Paste the full invite link, or enter the session number and invite code
        from the owner&apos;s Share button.
      </p>
      <input
        value={sessionId}
        onChange={e => setSessionId(e.target.value)}
        placeholder="Paste invite link or session number"
        disabled={!connected || isJoining}
        aria-label="Invite link or session number"
        className="border border-ink bg-paper px-2 py-1.5 font-label text-xs outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
      />
      <input
        value={inviteCode}
        onChange={e => setInviteCode(e.target.value)}
        placeholder="Invite code — 8 letters/numbers"
        disabled={!connected || isJoining}
        aria-label="Invite code"
        className="border border-ink bg-paper px-2 py-1.5 font-label text-xs outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={
          !connected ||
          isJoining ||
          (!sessionId.trim() && !inviteCode.trim())
        }
        className="mt-1 border border-ink bg-paper py-2 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isJoining ? 'Joining…' : 'Join as co-director →'}
      </button>
    </form>
  );
}
