import { useSpacetimeDB } from 'spacetimedb/react';
import { useSelfPresence } from '../lib/hooks';

type ConnectionStatusProps = {
  /** When true, only a status dot (no role or identity). */
  minimal?: boolean;
};

export default function ConnectionStatus({ minimal = false }: ConnectionStatusProps) {
  const { isActive } = useSpacetimeDB();
  const selfPresence = useSelfPresence();
  const connected = isActive;
  const online = connected && selfPresence?.online === true;

  if (minimal) {
    return (
      <span
        className="inline-flex h-2 w-2 shrink-0 rounded-full"
        title={
          connected
            ? online
              ? 'Connected'
              : 'Connected'
            : 'Connecting…'
        }
        aria-label={
          connected
            ? online
              ? 'Connected'
              : 'Connected'
            : 'Connecting'
        }
      >
        <span
          className={`inline-flex h-2 w-2 rounded-full ${
            connected ? 'bg-green-700' : 'animate-pulse bg-accent'
          }`}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 font-label text-[10px] uppercase tracking-widest ${
        connected ? 'text-ink/45' : 'text-accent'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          connected ? 'bg-green-700' : 'animate-pulse bg-accent'
        }`}
      />
      {connected ? 'Connected' : 'Connecting…'}
    </span>
  );
}
