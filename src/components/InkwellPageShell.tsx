import type { ReactNode } from 'react';

type InkwellPageShellProps = {
  headerRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  onLogoClick?: () => void;
  children: ReactNode;
};

export default function InkwellPageShell({
  headerRight,
  footerLeft,
  footerRight,
  onLogoClick,
  children,
}: InkwellPageShellProps) {
  const logo = (
    <span className="font-display text-lg font-medium tracking-tight text-ink">
      Inkwell
    </span>
  );

  return (
    <div className="paper-grain flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-hairline px-8 py-3">
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            className="text-left transition-colors hover:text-accent"
          >
            {logo}
          </button>
        ) : (
          logo
        )}
        {headerRight && (
          <div className="min-w-0 shrink-0 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            {headerRight}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {(footerLeft || footerRight) && (
        <footer className="shrink-0 border-t border-hairline px-8 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            {footerLeft && (
              <div className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
                {footerLeft}
              </div>
            )}
            {footerRight}
          </div>
        </footer>
      )}
    </div>
  );
}
