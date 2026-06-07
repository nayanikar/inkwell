import type { DirectorOnline } from '../lib/hooks';

type DirectorsOnlineProps = {
  directors: DirectorOnline[];
  sessionRole?: 'owner' | 'co-director' | null;
};

export default function DirectorsOnline({
  directors,
  sessionRole,
}: DirectorsOnlineProps) {
  if (directors.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      {sessionRole && (
        <span className="shrink-0 border border-ink/30 px-1.5 py-0.5 font-label text-[10px] uppercase tracking-widest text-ink/55">
          {sessionRole === 'owner' ? 'Owner' : 'Co-director'}
        </span>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {directors.map(d => (
          <span
            key={d.identityHex}
            className="inline-flex max-w-[8rem] items-center gap-1 truncate border border-ink/25 px-1.5 py-0.5 font-label text-[10px] normal-case tracking-normal text-ink/70"
            title={d.identityHex}
          >
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                d.online ? 'bg-green-700' : 'bg-ink/25'
              }`}
            />
            <span className="truncate">
              {d.displayName}
              {d.isSelf ? ' (you)' : ''}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
