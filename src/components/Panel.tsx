import type { PanelData } from '../lib/types';

type PanelProps = PanelData & {
  isActive?: boolean;
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
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-surface/50 px-4 text-center">
            <span className="animate-pulse font-label text-[10px] uppercase tracking-widest text-ink/45">
              {status === 'generating' ? 'Drawing…' : 'Waiting…'}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export type { PanelProps };
