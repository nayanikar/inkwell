import { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from './Panel';
import type { SceneDirective } from '../lib/hooks';
import {
  formatTrailAge,
  mergeTrailEvents,
  stdbPrimitiveMeta,
  type ActivityEventRow,
  type StdbPrimitive,
  type TrailEvent,
} from '../lib/activityTrail';

type ActivityTrailProps = {
  sceneNum: number;
  sceneTitle?: string;
  sceneSummary?: string | null;
  sceneStatus?: string;
  narrationStatus?: string;
  pageImageUrl?: string;
  panels: PanelProps[];
  directives?: SceneDirective[];
  isGenerating: boolean;
  serverEvents?: ActivityEventRow[];
  collapsed: boolean;
  onToggle: () => void;
};

const HEADER_LABEL = 'SpacetimeDB trail';
const PRIMITIVE_ORDER: StdbPrimitive[] = [
  'reducer',
  'procedure',
  'transaction',
  'scheduled',
  'subscription',
];

function StatusDot({ event }: { event: TrailEvent }) {
  if (event.active) {
    return (
      <span
        className="relative mt-1 inline-flex h-2 w-2 shrink-0"
        aria-hidden
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  }
  if (event.done) {
    return (
      <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-ink/35" />
    );
  }
  return (
    <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full border border-ink/25 bg-paper" />
  );
}

function StdbBadge({
  primitive,
  call,
  compact = false,
}: {
  primitive: StdbPrimitive;
  call?: string | null;
  compact?: boolean;
}) {
  const meta = stdbPrimitiveMeta(primitive);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 border px-1 py-px font-label uppercase tracking-wider ${meta.badge} ${
        compact ? 'text-[8px]' : 'text-[9px]'
      }`}
      title={`SpacetimeDB ${meta.label}${call ? ` · ${call}` : ''}`}
    >
      <span className="shrink-0">{meta.short}</span>
      {call && (
        <span className="truncate normal-case tracking-normal opacity-90">
          {call}()
        </span>
      )}
    </span>
  );
}

function TrailLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}
      aria-label="SpacetimeDB primitive legend"
    >
      {PRIMITIVE_ORDER.map(primitive => {
        const meta = stdbPrimitiveMeta(primitive);
        return (
          <span
            key={primitive}
            className={`inline-flex items-center gap-1 font-label uppercase tracking-wider text-ink/45 ${
              compact ? 'text-[8px]' : 'text-[9px]'
            }`}
          >
            <span className={`h-2 w-0.5 shrink-0 ${meta.rail}`} />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

function TrailRow({ event }: { event: TrailEvent }) {
  const age = formatTrailAge(event.createdAt);
  const isNative = event.stdbPrimitive != null;
  const meta = event.stdbPrimitive
    ? stdbPrimitiveMeta(event.stdbPrimitive)
    : null;
  const isNudge =
    event.kind === 'nudge_shift' || event.kind === 'nudge_applied';

  return (
    <li className="relative flex gap-2 pl-0.5">
      {meta && (
        <span
          className={`absolute bottom-0 left-0 top-0 w-0.5 ${meta.rail} ${
            event.active ? 'opacity-100' : 'opacity-55'
          }`}
          aria-hidden
        />
      )}
      <div className="flex w-3 shrink-0 justify-center">
        <StatusDot event={event} />
      </div>
      <div
        className={`min-w-0 flex-1 pb-2 ${
          isNudge ? 'border border-accent/20 bg-accent/[0.04] px-2 py-1.5' : ''
        } ${isNative && !isNudge ? 'border-l border-ink/10 pl-2' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {event.stdbPrimitive && (
              <StdbBadge
                primitive={event.stdbPrimitive}
                call={event.stdbCall}
              />
            )}
            {age && (
              <span className="font-label text-[8px] uppercase tracking-widest text-ink/35">
                {age}
              </span>
            )}
          </div>
        </div>
        <p
          className={`mt-1 font-label text-[10px] leading-snug ${
            event.active
              ? 'animate-pulse font-medium text-accent'
              : event.done
                ? 'text-ink/75'
                : 'text-ink/40'
          }`}
        >
          {event.label}
        </p>
        {event.detail && (
          <p className="mt-0.5 font-label text-[9px] leading-snug text-ink/45">
            {event.detail}
          </p>
        )}
      </div>
    </li>
  );
}

export default function ActivityTrail({
  sceneNum,
  sceneTitle,
  sceneSummary,
  sceneStatus,
  narrationStatus,
  pageImageUrl,
  panels,
  directives = [],
  isGenerating,
  serverEvents = [],
  collapsed,
  onToggle,
}: ActivityTrailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageDrawStartedAtRef = useRef<number | undefined>(undefined);
  const [, setTick] = useState(0);

  useEffect(() => {
    pageDrawStartedAtRef.current = undefined;
  }, [sceneNum]);

  const pageDrawing =
    sceneStatus === 'generating' && !pageImageUrl?.trim() && panels.length > 0;

  useEffect(() => {
    if (pageDrawing && pageDrawStartedAtRef.current == null) {
      pageDrawStartedAtRef.current = Date.now();
    }
  }, [pageDrawing]);

  useEffect(() => {
    if (!pageDrawing) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [pageDrawing]);

  const events = mergeTrailEvents(
    serverEvents,
    panels,
    isGenerating,
    sceneStatus,
    directives,
    pageImageUrl,
    pageDrawStartedAtRef.current,
    narrationStatus
  );
  const displayEvents = [...events].reverse();

  const latestNative = useMemo(
    () => displayEvents.find(e => e.stdbPrimitive != null),
    [displayEvents]
  );

  const nativeCount = useMemo(
    () => displayEvents.filter(e => e.stdbPrimitive != null).length,
    [displayEvents]
  );

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [displayEvents.length, collapsed, pageDrawing]);

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-ink bg-surface/40 p-2">
        <button
          type="button"
          onClick={onToggle}
          className="w-full border border-ink/40 bg-paper px-2 py-2 text-left transition-colors hover:border-accent hover:bg-paper"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-label text-[10px] uppercase tracking-widest text-ink/70">
              {HEADER_LABEL} ▸
            </span>
            {nativeCount > 0 && (
              <span className="font-label text-[9px] uppercase tracking-widest text-ink/40">
                {nativeCount} native
              </span>
            )}
          </div>
          {latestNative?.stdbPrimitive && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StdbBadge
                primitive={latestNative.stdbPrimitive}
                call={latestNative.stdbCall}
                compact
              />
              <span className="truncate font-label text-[9px] text-ink/50">
                {latestNative.label}
              </span>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-ink bg-surface/20">
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 border-b border-ink bg-paper/80 px-3 py-2.5 text-left transition-colors hover:bg-surface/50"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-label text-[10px] uppercase tracking-wider text-ink/80">
            {HEADER_LABEL} ▾
          </span>
          <span className="font-label text-[9px] uppercase tracking-widest text-ink/40">
            {displayEvents.length} events
          </span>
        </div>
        <p className="mt-0.5 font-label text-[9px] normal-case leading-relaxed tracking-normal text-ink/45">
          Module calls & subscription pushes — badges mark native SpacetimeDB
          surfaces
        </p>
        <TrailLegend compact />
      </button>
      <div
        ref={scrollRef}
        className="inkwell-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
      >
        {displayEvents.length === 0 ? (
          <p className="px-2 py-4 text-center font-label text-[10px] text-ink/40">
            Waiting for module activity…
          </p>
        ) : (
          <ol className="relative space-y-0.5 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-ink/10">
            {displayEvents.map(event => (
              <TrailRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
