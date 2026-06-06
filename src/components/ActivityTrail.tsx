import { useEffect, useRef, useState } from 'react';
import type { PanelProps } from './Panel';
import type { SceneDirective } from '../lib/hooks';
import {
  buildTrailEvents,
  type TrailEvent,
} from '../lib/activityTrail';

type ActivityTrailProps = {
  sceneNum: number;
  sceneTitle?: string;
  sceneSummary?: string | null;
  sceneStatus?: string;
  panels: PanelProps[];
  directives?: SceneDirective[];
  isGenerating: boolean;
  collapsed: boolean;
  onToggle: () => void;
};

function EventIcon({ event }: { event: TrailEvent }) {
  if (event.done) return <span className="mt-0.5 shrink-0">✓</span>;
  if (event.active) return <span className="mt-0.5 shrink-0">●</span>;
  return <span className="mt-0.5 shrink-0">○</span>;
}

function eventClass(event: TrailEvent): string {
  if (event.done) return 'text-ink/60';
  if (event.active) return 'text-accent';
  return 'text-ink/35';
}

const HEADER_LABEL = 'SpacetimeDB trail';
const HEADER_HINT = 'Behind the scenes · module + subscription';

export default function ActivityTrail({
  sceneNum,
  sceneTitle,
  sceneSummary,
  sceneStatus,
  panels,
  directives = [],
  isGenerating,
  collapsed,
  onToggle,
}: ActivityTrailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawStartedAtRef = useRef<Map<number, number>>(new Map());
  const [, setTick] = useState(0);

  useEffect(() => {
    drawStartedAtRef.current = new Map();
  }, [sceneNum]);

  const drawingPanel = panels.find(p => p.status === 'generating');
  useEffect(() => {
    if (drawingPanel) {
      const map = drawStartedAtRef.current;
      if (!map.has(drawingPanel.panelNum)) {
        map.set(drawingPanel.panelNum, Date.now());
      }
    }
  }, [drawingPanel?.panelNum]);

  useEffect(() => {
    if (!isGenerating || !drawingPanel) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isGenerating, drawingPanel?.panelNum]);

  const events = buildTrailEvents({
    sceneNum,
    sceneTitle,
    sceneSummary,
    panels,
    isGenerating,
    sceneStatus,
    directives,
    drawStartedAt: drawStartedAtRef.current,
  });
  const displayEvents = [...events].reverse();

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [displayEvents.length, collapsed, drawingPanel?.panelNum]);

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-ink p-2">
        <button
          type="button"
          onClick={onToggle}
          className="w-full border border-ink bg-paper px-2 py-1.5 text-left font-label text-[10px] uppercase tracking-widest text-ink/70 hover:border-accent hover:text-accent"
        >
          {HEADER_LABEL} ▸
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-ink">
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 border-b border-ink px-3 py-2 text-left hover:text-accent"
      >
        <span className="block font-label text-[10px] uppercase tracking-wider text-ink/70">
          {HEADER_LABEL} ▾
        </span>
        <span className="block font-label text-[9px] normal-case tracking-normal text-ink/40">
          {HEADER_HINT}
        </span>
      </button>
      <div
        ref={scrollRef}
        className="inkwell-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
      >
        <ol className="space-y-2">
          {displayEvents.map(event => (
            <li
              key={event.id}
              className={`flex items-start gap-1.5 font-label text-[10px] leading-snug ${eventClass(event)} ${
                event.kind === 'nudge_shift' ? 'bg-accent/5 px-1.5 py-1' : ''
              }`}
            >
              <EventIcon event={event} />
              <div className="min-w-0 flex-1">
                <p className={event.active ? 'animate-pulse font-medium' : ''}>
                  {event.label}
                </p>
                {event.detail && (
                  <p className="mt-0.5 text-[9px] leading-snug text-ink/45">
                    {event.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
