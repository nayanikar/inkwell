import type { ReactNode } from 'react';
import InkwellLogo from './InkwellLogo';
import ConnectionStatus from './ConnectionStatus';
import type { DirectorOnline } from '../lib/hooks';

type AppHeaderProps = {
  onLogoClick?: () => void;
  logoSize?: 'xs' | 'sm';
  label?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  headerRight?: ReactNode;
  showConnection?: boolean;
  /** @deprecated Connection chrome is minimal; kept for API compat */
  directorsOnline?: DirectorOnline[];
  sessionRole?: 'owner' | 'co-director' | null;
  error?: string | null;
  /** Scene: logo + actions only. Default: shell pages with optional meta. */
  variant?: 'scene' | 'default';
};

export default function AppHeader({
  onLogoClick,
  logoSize = 'sm',
  label,
  center,
  actions,
  headerRight,
  showConnection = false,
  error = null,
  variant = 'default',
}: AppHeaderProps) {
  const isScene = variant === 'scene';

  if (isScene) {
    return (
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-2.5 md:px-8">
        <InkwellLogo
          size="sm"
          onClick={onLogoClick}
          title="Back to home"
        />
        {actions != null && (
          <nav
            className="flex shrink-0 items-center gap-1 sm:gap-2"
            aria-label="Scene actions"
          >
            {actions}
          </nav>
        )}
      </header>
    );
  }

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-6 py-3 md:px-8">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <InkwellLogo size={logoSize} onClick={onLogoClick} title="Back to home" />
        {label != null && (
          <span className="font-label text-[10px] uppercase tracking-widest text-ink/40">
            {label}
          </span>
        )}
      </div>

      {center != null ? (
        <div
          className="min-w-0 flex-1 truncate px-2 text-center font-label text-[10px] uppercase tracking-[0.3em] text-ink-muted"
          title={typeof center === 'string' ? center : undefined}
        >
          {center}
        </div>
      ) : (
        <div className="min-w-0 flex-1" aria-hidden />
      )}

      <div className="flex shrink-0 items-center gap-3">
        {actions}
        {headerRight != null && (
          <div className="min-w-0 shrink-0 font-label text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            {headerRight}
          </div>
        )}
        {showConnection && <ConnectionStatus minimal />}
        {error && (
          <span
            className="max-w-[12rem] truncate font-label text-[10px] normal-case text-accent"
            title={error}
          >
            {error}
          </span>
        )}
      </div>
    </header>
  );
}
