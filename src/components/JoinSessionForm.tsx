import { useState } from 'react';

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

  return (
    <form
      className="mt-8 flex w-full max-w-md flex-col gap-2 border border-ink/20 bg-paper/50 p-4"
      onSubmit={e => {
        e.preventDefault();
        if (!sessionId.trim() || !inviteCode.trim()) return;
        onJoin(sessionId.trim(), inviteCode.trim());
      }}
    >
      <p className="font-label text-[10px] uppercase tracking-widest text-ink/70">
        Join a friend&apos;s story
      </p>
      <input
        value={sessionId}
        onChange={e => setSessionId(e.target.value)}
        placeholder="Session ID"
        disabled={!connected || isJoining}
        className="border border-ink bg-paper px-2 py-1.5 font-label text-xs outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
      />
      <input
        value={inviteCode}
        onChange={e => setInviteCode(e.target.value)}
        placeholder="Invite code"
        disabled={!connected || isJoining}
        className="border border-ink bg-paper px-2 py-1.5 font-label text-xs outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={!connected || isJoining || !sessionId.trim() || !inviteCode.trim()}
        className="mt-1 border border-ink bg-paper py-2 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isJoining ? 'Joining…' : 'Join as co-director →'}
      </button>
    </form>
  );
}
