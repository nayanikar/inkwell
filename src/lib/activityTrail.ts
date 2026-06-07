import type { PanelProps } from '../components/Panel';
import type { ActivityEventRow, SceneDirective } from './hooks';

export type { ActivityEventRow };

export type TrailEventKind =
  | 'connected'
  | 'directive'
  | 'nudge_shift'
  | 'claude'
  | 'script_ready'
  | 'panel_script'
  | 'page_draw'
  | 'scene_done'
  | 'synced'
  | 'generate_start'
  | 'claude_start'
  | 'claude_done'
  | 'page_image_start'
  | 'page_image_done'
  | 'page_image_error'
  | 'page_retry_requested'
  | 'page_retry_start'
  | 'page_retry_done'
  | 'page_retry_failed'
  | 'narration'
  | 'narration_start'
  | 'narration_done'
  | 'narration_error'
  | 'generation_restored'
  | 'co_director_joined'
  | 'co_director_left'
  | 'co_director_revoked'
  | 'nudge_applied'
  | 'nudge_submitted'
  | 'nudge_consumed'
  | 'nudge_rejected_race'
  | 'nudge_superseded'
  | 'session_created'
  | 'story_complete'
  | string;

export type TrailEvent = {
  id: string;
  kind: TrailEventKind;
  label: string;
  detail?: string;
  active: boolean;
  done: boolean;
  startedAt?: number;
  createdAt?: bigint;
  /** SpacetimeDB native surface (reducer, procedure, withTx, scheduler, subscription). */
  stdbPrimitive?: StdbPrimitive | null;
  /** SpacetimeDB function or table subscription name, e.g. advance_and_generate. */
  stdbCall?: string | null;
};

export type StdbPrimitive =
  | 'reducer'
  | 'procedure'
  | 'transaction'
  | 'scheduled'
  | 'subscription';

export type StdbClassification = {
  primitive: StdbPrimitive | null;
  call: string | null;
};

const PRIMITIVE_META: Record<
  StdbPrimitive,
  { label: string; short: string; rail: string; badge: string }
> = {
  reducer: {
    label: 'Reducer',
    short: 'RDC',
    rail: 'bg-accent',
    badge: 'border-accent bg-accent/12 text-accent',
  },
  procedure: {
    label: 'Procedure',
    short: 'PRC',
    rail: 'bg-ink',
    badge: 'border-ink bg-ink text-paper',
  },
  transaction: {
    label: 'Transaction',
    short: 'TX',
    rail: 'bg-gold',
    badge: 'border-gold/70 bg-gold/15 text-ink',
  },
  scheduled: {
    label: 'Scheduled',
    short: 'SCH',
    rail: 'bg-ink/40',
    badge: 'border-dashed border-ink/45 bg-paper text-ink/70',
  },
  subscription: {
    label: 'Subscription',
    short: 'SUB',
    rail: 'bg-green-800',
    badge: 'border-green-900/35 bg-green-950/5 text-green-950',
  },
};

export function stdbPrimitiveMeta(primitive: StdbPrimitive) {
  return PRIMITIVE_META[primitive];
}

export function formatTrailAge(createdAt: bigint | undefined): string | null {
  if (createdAt == null || createdAt === 0n) return null;
  const ms = Number(createdAt / 1000n);
  const diff = Date.now() - ms;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

function extractCallFromLabel(label: string): string | null {
  const dotCall = label.match(/^([a-z_]+)\s·/);
  if (dotCall) return dotCall[1];
  const procedureCall = label.match(/([a-z_]+)\s+procedure\b/);
  if (procedureCall) return procedureCall[1];
  const reducerCall = label.match(/([a-z_]+)\s+reducer\b/);
  if (reducerCall) return reducerCall[1];
  return null;
}

/** Map activity_event rows to SpacetimeDB-native surfaces for the trail UI. */
export function classifyStdbEvent(
  kind: string,
  label: string,
  detail?: string
): StdbClassification {
  const detailLower = detail?.toLowerCase() ?? '';
  const labelLower = label.toLowerCase();

  if (kind === 'synced' || labelLower.includes('subscription update')) {
    return { primitive: 'subscription', call: 'useTable' };
  }

  if (kind === 'panel_retry_scheduled') {
    return { primitive: 'scheduled', call: 'retry_panel_image' };
  }

  const reducerByKind: Record<string, string> = {
    story_fork_requested: 'fork_story_at_scene',
    story_fork_created: 'fork_story_at_scene',
    nudge_submitted: 'submit_nudge',
    nudge_superseded: 'submit_nudge',
    co_director_joined: 'join_session',
    co_director_left: 'leave_session',
    co_director_revoked: 'revoke_co_director',
    generation_restored: 'restore_generation',
    panel_retry_requested: 'retry_panel_now',
  };
  if (kind in reducerByKind) {
    return { primitive: 'reducer', call: reducerByKind[kind] };
  }

  if (kind === 'session_created') {
    if (labelLower.includes('create_session')) {
      return { primitive: 'reducer', call: 'create_session' };
    }
    if (labelLower.includes('start_story')) {
      return { primitive: 'procedure', call: 'start_story' };
    }
  }

  if (kind === 'page_retry_requested') {
    return { primitive: 'procedure', call: 'retry_page_now' };
  }

  if (kind === 'generate_start') {
    return { primitive: 'procedure', call: 'generate_scene' };
  }
  if (kind === 'generation_resume') {
    return { primitive: 'procedure', call: 'resume_generation' };
  }

  if (labelLower.startsWith('advance_and_generate')) {
    return { primitive: 'transaction', call: 'advance_and_generate' };
  }
  if (
    labelLower.startsWith('generate_scene') ||
    labelLower.includes('generate_scene ·') ||
    labelLower.includes('generate_scene procedure')
  ) {
    return {
      primitive: labelLower.includes('procedure started')
        ? 'procedure'
        : 'transaction',
      call: 'generate_scene',
    };
  }
  if (
    kind.startsWith('page_retry_') ||
    labelLower.includes('page image retry') ||
    labelLower.includes('page_retry')
  ) {
    return { primitive: 'transaction', call: 'retry_page_now' };
  }
  if (kind.startsWith('page_image') || kind === 'page_draw') {
    return { primitive: 'transaction', call: 'generate_scene' };
  }

  const transactionKinds = new Set([
    'claude_start',
    'claude_done',
    'claude_error',
    'script_ready',
    'scene_done',
    'page_image_start',
    'page_image_done',
    'page_image_error',
    'page_image_skipped',
    'narration_start',
    'narration_done',
    'narration_error',
    'character_refs_start',
    'character_refs_done',
    'nudge_applied',
    'scene_advanced',
    'nudge_consumed',
    'nudge_rejected_race',
    'page_retry_start',
    'page_retry_done',
    'page_retry_failed',
    'page_retry_skipped',
  ]);
  if (transactionKinds.has(kind)) {
    return {
      primitive: 'transaction',
      call: extractCallFromLabel(label) ?? 'generate_scene',
    };
  }

  if (kind === 'directive' || kind === 'nudge_shift') {
    return { primitive: 'subscription', call: 'narrative_directive' };
  }
  if (kind === 'panel_script') {
    return { primitive: 'subscription', call: 'panel' };
  }
  if (kind === 'claude' || kind === 'script_ready' || kind === 'page_draw' || kind === 'narration') {
    const call = extractCallFromLabel(label) ?? 'generate_scene';
    const primitive =
      labelLower.includes('procedure started') ? 'procedure' : 'transaction';
    return { primitive, call };
  }

  return { primitive: null, call: extractCallFromLabel(label) };
}

function withClassification(
  event: Omit<TrailEvent, 'stdbPrimitive' | 'stdbCall'>,
  serverKind?: string
): TrailEvent {
  const kindKey = serverKind ?? event.kind;
  const { primitive, call } = classifyStdbEvent(
    kindKey,
    event.label,
    event.detail
  );
  return { ...event, stdbPrimitive: primitive, stdbCall: call };
}

export function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function panelBadge(num: number): string {
  return String(num).padStart(2, '0');
}

export function formatPanelScript(panel: PanelProps): string {
  if (panel.dialogue?.trim()) {
    const who = panel.speaker?.trim();
    return who
      ? `${who}: "${truncate(panel.dialogue, 72)}"`
      : `"${truncate(panel.dialogue, 72)}"`;
  }
  if (panel.caption?.trim()) {
    return `"${truncate(panel.caption, 72)}"`;
  }
  return 'Silent panel';
}

export function buildTrailEvents({
  sceneNum,
  sceneTitle,
  sceneSummary,
  panels,
  isGenerating,
  sceneStatus,
  directives,
  pageImageUrl,
  pageDrawStartedAt,
  narrationStatus,
}: {
  sceneNum: number;
  sceneTitle?: string;
  sceneSummary?: string | null;
  panels: PanelProps[];
  isGenerating: boolean;
  sceneStatus?: string;
  directives: SceneDirective[];
  pageImageUrl?: string;
  pageDrawStartedAt?: number;
  narrationStatus?: string;
}): TrailEvent[] {
  const events: TrailEvent[] = [];
  const sortedPanels = [...panels].sort((a, b) => a.panelNum - b.panelNum);
  const totalPanels = sortedPanels.length;
  const hasPageImage = !!pageImageUrl?.trim();
  const sceneComplete =
    sceneStatus === 'done' || (!isGenerating && hasPageImage);

  for (const directive of directives) {
    const actor = directive.appliedBy?.trim();
    const actorPrefix = actor ? `${actor} · ` : '';
    events.push(
      withClassification({
        id: `directive-${directive.directiveId}`,
        kind: 'directive',
        label: 'narrative_directive row inserted',
        detail: `${actorPrefix}[${directive.type}] ${truncate(directive.content, 56)}`,
        active: false,
        done: true,
      })
    );
    events.push(
      withClassification({
        id: `nudge-shift-${directive.directiveId}`,
        kind: 'nudge_shift',
        label: `Directive bound to scene ${directive.appliedAtScene}`,
        detail: `applied_at_scene=${directive.appliedAtScene} · feeds generate_scene prompt`,
        active: false,
        done: true,
      })
    );
  }

  const claudeActive = isGenerating && totalPanels === 0;
  events.push(
    withClassification({
      id: 'claude',
      kind: 'claude',
      label: claudeActive
        ? 'generate_scene procedure · calling Claude'
        : totalPanels > 0
          ? 'generate_scene · Claude response received'
          : 'generate_scene procedure',
      detail: claudeActive
        ? 'Module awaiting scene JSON (no DB rows yet)'
        : totalPanels > 0
          ? 'Parsing panels JSON in module'
          : undefined,
      active: claudeActive,
      done: totalPanels > 0,
    })
  );

  if (totalPanels > 0) {
    const titlePart = sceneTitle ? `"${truncate(sceneTitle, 40)}"` : 'Untitled';
    const summaryPart = sceneSummary?.trim()
      ? ` · ${truncate(sceneSummary.trim(), 72)}`
      : '';
    events.push(
      withClassification({
        id: 'script-ready',
        kind: 'script_ready',
        label: 'scene + panel rows inserted',
        detail: `scene.status=generating · ${titlePart} · ${totalPanels} panel row${totalPanels === 1 ? '' : 's'}${summaryPart}`,
        active: false,
        done: true,
      })
    );
  }

  for (const panel of sortedPanels) {
    const badge = panelBadge(panel.panelNum);
    const scriptDetail = formatPanelScript(panel);
    const hasScript =
      panel.caption?.trim() || panel.dialogue?.trim() || panel.speaker?.trim();

    events.push(
      withClassification({
        id: `script-${panel.panelNum}`,
        kind: 'panel_script',
        label: `panel row synced · #${badge}`,
        detail: hasScript
          ? `${panel.layoutHint || 'square'} · ${scriptDetail}`
          : `${panel.layoutHint || 'square'} · visual only`,
        active: false,
        done: true,
      })
    );
  }

  const pageDrawing =
    sceneStatus === 'generating' && !hasPageImage && totalPanels > 0;
  if (pageDrawing) {
    const elapsed =
      pageDrawStartedAt != null
        ? ` · ${Math.floor((Date.now() - pageDrawStartedAt) / 1000)}s`
        : '';
    events.push(
      withClassification({
        id: 'page-draw',
        kind: 'page_draw',
        label: `generate_scene · OpenAI page image call${elapsed}`,
        detail: 'gpt-image-2 · full comic page layout',
        active: true,
        done: false,
        startedAt: pageDrawStartedAt,
      })
    );
  } else if (hasPageImage) {
    events.push(
      withClassification({
        id: 'page-draw',
        kind: 'page_draw',
        label: 'scene page image generated',
        detail: 'page_image_url set · subscription push',
        active: false,
        done: true,
      })
    );
  } else if (sceneStatus === 'error' && totalPanels > 0) {
    events.push(
      withClassification({
        id: 'page-draw',
        kind: 'page_draw',
        label: 'scene page image failed',
        detail: 'OpenAI page image call failed · status=error',
        active: false,
        done: false,
      })
    );
  }

  if (narrationStatus === 'generating' && totalPanels > 0) {
    events.push(
      withClassification({
        id: 'narration-draw',
        kind: 'narration',
        label: 'generate_scene · OpenAI TTS',
        detail: 'gpt-4o-mini-tts · scene narration audio',
        active: true,
        done: false,
      })
    );
  } else if (narrationStatus === 'done') {
    events.push(
      withClassification({
        id: 'narration-draw',
        kind: 'narration',
        label: 'scene narration generated',
        detail: 'narration_audio_url set · subscription push',
        active: false,
        done: true,
      })
    );
  } else if (narrationStatus === 'error' && totalPanels > 0) {
    events.push(
      withClassification({
        id: 'narration-draw',
        kind: 'narration',
        label: 'scene narration failed',
        detail: 'OpenAI TTS failed · Web Speech fallback on client',
        active: false,
        done: false,
      })
    );
  }

  if (sceneStatus === 'error') {
    events.push(
      withClassification({
        id: 'scene-error',
        kind: 'scene_done',
        label: 'scene row updated',
        detail: 'status=error · page image generation failed',
        active: false,
        done: false,
      })
    );
  } else if (sceneComplete && totalPanels > 0) {
    events.push(
      withClassification({
        id: 'scene-done',
        kind: 'scene_done',
        label: 'scene row updated',
        detail: `status=done · character mood + memory rows written · ${totalPanels} panel script row(s)`,
        active: false,
        done: true,
      })
    );
    events.push(
      withClassification({
        id: 'synced',
        kind: 'synced',
        label: 'Subscription update received',
        detail: 'Scene page image + panel rows synced to browser',
        active: false,
        done: true,
      })
    );
  }

  void sceneNum;
  return events;
}

const PAGE_IMAGE_KINDS = new Set([
  'page_image_start',
  'page_image_done',
  'page_image_error',
  'page_retry_start',
  'page_retry_done',
  'page_retry_failed',
]);

const NARRATION_KINDS = new Set([
  'narration_start',
  'narration_done',
  'narration_error',
]);

function parseAppliedByFromDetail(detail: string): string | null {
  const match = detail.match(/^([^·]+)\s*·\s*\[/);
  return match?.[1]?.trim() || null;
}

function mapServerEvent(row: ActivityEventRow): TrailEvent {
  let detail = row.detail.trim() || undefined;
  if (row.kind === 'nudge_applied' && detail) {
    const actor = parseAppliedByFromDetail(detail);
    if (actor && !detail.startsWith(`${actor} ·`)) {
      detail = `${actor} · ${detail}`;
    }
  }
  const kind =
    row.kind === 'page_image_start' ||
    row.kind === 'page_image_done' ||
    row.kind === 'page_image_error'
      ? 'page_draw'
      : row.kind === 'narration_start' ||
          row.kind === 'narration_done' ||
          row.kind === 'narration_error'
        ? 'narration'
        : row.kind;
  return withClassification(
    {
      id: String(row.eventId),
      kind,
      label: row.label,
      detail,
      done: row.done,
      active: row.active,
      createdAt: row.createdAt,
    },
    row.kind
  );
}

function hasServerPageImageEvent(serverEvents: ActivityEventRow[]): boolean {
  return serverEvents.some(event => PAGE_IMAGE_KINDS.has(event.kind));
}

function hasServerNarrationEvent(serverEvents: ActivityEventRow[]): boolean {
  return serverEvents.some(event => NARRATION_KINDS.has(event.kind));
}

/** Server activity_event rows drive the trail; client page draw fills gaps only. */
export function mergeTrailEvents(
  serverEvents: ActivityEventRow[],
  panels: PanelProps[],
  isGenerating: boolean,
  sceneStatus: string | undefined,
  directives: SceneDirective[],
  pageImageUrl?: string,
  pageDrawStartedAt?: number,
  narrationStatus?: string
): TrailEvent[] {
  const mapped = serverEvents.map(mapServerEvent);
  const hasServerNudgeApplied = serverEvents.some(e => e.kind === 'nudge_applied');

  const supplemental = buildTrailEvents({
    sceneNum: 0,
    panels,
    isGenerating,
    sceneStatus,
    directives: hasServerNudgeApplied ? [] : directives,
    pageImageUrl,
    pageDrawStartedAt,
    narrationStatus,
  }).filter(event => {
    if (event.kind === 'page_draw') {
      return !hasServerPageImageEvent(serverEvents);
    }
    if (event.kind === 'narration') {
      return !hasServerNarrationEvent(serverEvents);
    }
    return false;
  });

  return [...mapped, ...supplemental];
}
