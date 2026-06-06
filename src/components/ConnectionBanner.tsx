import { useSpacetimeDB } from 'spacetimedb/react';
import { HOST, DB_NAME } from '../lib/stdb';

type ConnectionBannerProps = {
  error?: string | null;
  onGoHome?: () => void;
};

export default function ConnectionBanner({ error, onGoHome }: ConnectionBannerProps) {
  const { isActive, identity } = useSpacetimeDB();
  const connected = isActive;

  return (
    <div
      className={`inkwell-page-bg shrink-0 border-b border-ink px-6 py-1.5 font-label text-[10px] uppercase tracking-widest md:px-10 ${
        connected ? 'text-ink/70' : 'text-accent'
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 truncate">
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              className="shrink-0 font-display text-sm uppercase tracking-wide text-ink transition-colors hover:text-accent"
            >
              Inkwell
            </button>
          ) : (
            <span className="shrink-0 font-display text-sm uppercase tracking-wide text-ink">
              Inkwell
            </span>
          )}
          <span
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              connected ? 'bg-green-700' : 'animate-pulse bg-accent'
            }`}
          />
          <span className="truncate">{connected ? 'Connected' : 'Connecting…'}</span>
        </span>
        <span className="hidden min-w-0 truncate normal-case tracking-normal text-ink/45 sm:inline">
          {HOST} · {DB_NAME}
          {identity ? ` · ${identity.toHexString().slice(0, 8)}…` : ''}
        </span>
        {error && (
          <span className="min-w-0 truncate normal-case text-accent" title={error}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
