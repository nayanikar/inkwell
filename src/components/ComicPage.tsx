import Panel, { type PanelProps } from './Panel';
import { getComicGridClass, getComicGridPlacements } from '../lib/comicGrid';

type ComicPageProps = {
  panels: PanelProps[];
  sceneNum?: number;
  title?: string;
  summary?: string;
  activePanelNum?: number | null;
};

export default function ComicPage({
  panels,
  sceneNum,
  title,
  summary,
  activePanelNum = null,
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
    </section>
  );
}
