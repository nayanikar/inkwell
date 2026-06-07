import type { PanelData } from '../lib/types';

type PanelProps = PanelData & {
  isActive?: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
};

function panelBadge(num: number): string {
  return String(num).padStart(2, '0');
}

export default function Panel({
  panelNum,
  caption,
  speaker,
  dialogue,
  imageUrl,
  layoutHint,
  status,
  isActive = false,
  onRetry,
  retryDisabled = false,
}: PanelProps) {
  const hasImage = status === 'done' && imageUrl;
  const isCloseUp = layoutHint === 'close-up';

  return (
    <article className="flex h-full min-h-0 flex-col">
      <div
        className={`relative flex h-full min-h-0 flex-col overflow-hidden border bg-paper ${
          isActive ? 'border-accent' : 'border-ink'
        } ${isCloseUp && !isActive ? 'ring-1 ring-ink/15' : ''}`}
      >
        <span className="absolute left-1.5 top-1.5 z-10 font-label text-[10px] text-ink/50">
          {panelBadge(panelNum)}
        </span>
        {hasImage ? (
          <img
            src={imageUrl}
            alt={
              dialogue ||
              caption ||
              (speaker ? `${speaker} speaks` : `Panel ${panelNum}`)
            }
            className={`h-full w-full ${isCloseUp ? 'object-cover' : 'object-contain'}`}
          />
        ) : (
          <button
            type="button"
            disabled={status !== 'error' || retryDisabled || !onRetry}
            onClick={status === 'error' ? onRetry : undefined}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-surface/50 px-4 text-center ${
              status === 'error' && onRetry && !retryDisabled
                ? 'cursor-pointer hover:bg-surface/80'
                : ''
            }`}
          >
            <span
              className={`font-label text-[10px] uppercase tracking-widest ${
                status === 'error'
                  ? 'text-accent'
                  : 'animate-pulse text-ink/45'
              }`}
            >
              {status === 'generating'
                ? 'Drawing…'
                : status === 'error'
                  ? 'Image failed'
                  : 'Waiting…'}
            </span>
            {status === 'error' && onRetry && !retryDisabled && (
              <span className="font-label text-[9px] uppercase tracking-widest text-ink/45">
                Tap to retry
              </span>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

export type { PanelProps };
