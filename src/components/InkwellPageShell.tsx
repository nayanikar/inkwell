import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import type { DirectorOnline } from '../lib/hooks';

type InkwellPageShellProps = {
  headerRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  onLogoClick?: () => void;
  showConnection?: boolean;
  directorsOnline?: DirectorOnline[];
  sessionRole?: 'owner' | 'co-director' | null;
  error?: string | null;
  children: ReactNode;
};

export default function InkwellPageShell({
  headerRight,
  footerLeft,
  footerRight,
  onLogoClick,
  showConnection = false,
  directorsOnline = [],
  sessionRole = null,
  error = null,
  children,
}: InkwellPageShellProps) {
  return (
    <div className="paper-grain flex h-full min-h-0 flex-col overflow-hidden">
      <AppHeader
        onLogoClick={onLogoClick}
        headerRight={headerRight}
        showConnection={showConnection}
        directorsOnline={directorsOnline}
        sessionRole={sessionRole}
        error={error}
      />

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {(footerLeft || footerRight) && (
        <footer className="shrink-0 border-t border-hairline px-8 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            {footerLeft && (
              <div className="flex min-w-0 items-center gap-2 truncate font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
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
