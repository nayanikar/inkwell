import Panel, { type PanelProps } from './Panel';
import { getComicGridClass, getComicGridPlacements } from '../lib/comicGrid';

type ComicPageProps = {
  panels: PanelProps[];
  sceneNum?: number;
  title?: string;
  summary?: string;
  activePanelNum?: number | null;
  activeNarrationText?: string | null;
  isNarrating?: boolean;
  pageImageUrl?: string;
  isPageGenerating?: boolean;
  onRetryPage?: () => void;
  retryDisabled?: boolean;
};

export default function ComicPage({
  panels,
  sceneNum,
  title,
  summary,
  activePanelNum = null,
  activeNarrationText = null,
  isNarrating = false,
  pageImageUrl,
  isPageGenerating = false,
  onRetryPage,
  retryDisabled = false,
}: ComicPageProps) {
  const placements = getComicGridPlacements(panels);
  const gridClass = getComicGridClass(panels.length);
  const label =
    sceneNum != null && title
      ? `Scene ${sceneNum}: ${title}`
      : title
        ? title
        : sceneNum != null
          ? `Scene ${sceneNum}`
          : null;

  const trimmedPageUrl = pageImageUrl?.trim();
  const showPageImage = !!trimmedPageUrl;

  return (
    <section className="flex h-full min-h-0 flex-col">
      {label && (
        <div className="mb-2 shrink-0">
          <h2 className="truncate font-label text-xs uppercase tracking-widest text-ink">
            {label}
          </h2>
          {summary && (
            <p className="truncate font-dialogue text-sm italic text-ink/55">
              {summary}
            </p>
          )}
        </div>
      )}

      {showPageImage ? (
        <div className="relative min-h-0 flex-1 overflow-hidden border border-ink bg-paper">
          <img
            src={trimmedPageUrl}
            alt={label ?? 'Comic page'}
            className="h-full w-full object-contain"
          />
          {activeNarrationText?.trim() && (
            <div
              className={`absolute inset-x-0 bottom-0 border-t border-ink/20 bg-paper/90 px-4 py-3 backdrop-blur-sm ${
                isNarrating ? 'animate-pulse' : ''
              }`}
            >
              {activePanelNum != null && (
                <span className="mb-1 block font-label text-[9px] uppercase tracking-widest text-ink/45">
                  Panel {String(activePanelNum).padStart(2, '0')}
                </span>
              )}
              <p className="font-dialogue text-sm italic leading-relaxed text-ink">
                {activeNarrationText}
              </p>
            </div>
          )}
        </div>
      ) : isPageGenerating ? (
        <div className="flex min-h-0 flex-1 items-center justify-center border border-ink bg-paper">
          <p className="animate-pulse font-label text-[10px] uppercase tracking-widest text-ink/50">
            Drawing…
          </p>
        </div>
      ) : onRetryPage ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border border-ink bg-paper">
          <p className="font-label text-[10px] uppercase tracking-widest text-accent">
            Page image failed
          </p>
          <button
            type="button"
            onClick={onRetryPage}
            disabled={retryDisabled}
            className="border border-ink bg-paper px-4 py-2 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retry page
          </button>
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 auto-rows-fr gap-1.5 ${gridClass}`}
          style={{ gridAutoFlow: 'dense' }}
        >
          {placements.map(({ panel, className }) => (
            <div
              key={panel.panelId?.toString() ?? panel.panelNum}
              className={className}
            >
              <Panel {...panel} isActive={activePanelNum === panel.panelNum} />
            </div>
          ))}
          {placements.length === 0 && (
            <div className="col-span-full flex flex-1 items-center justify-center font-label text-[10px] uppercase tracking-widest text-ink/40">
              Waiting for panels…
            </div>
          )}
        </div>
      )}
    </section>
  );
}
