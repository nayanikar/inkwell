import type { PanelProps } from '../components/Panel';
import type { SceneDirective } from './hooks';

export type TrailEventKind =
  | 'connected'
  | 'directive'
  | 'nudge_shift'
  | 'claude'
  | 'script_ready'
  | 'panel_script'
  | 'panel_draw'
  | 'panel_done'
  | 'panel_queued'
  | 'scene_done'
  | 'synced';

export type TrailEvent = {
  id: string;
  kind: TrailEventKind;
  label: string;
  detail?: string;
  active: boolean;
  done: boolean;
  startedAt?: number;
};

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

export function formatPanelDraw(panel: PanelProps): string {
  const layout = panel.layoutHint || 'square';
  const prompt = panel.imagePrompt?.trim();
  const parts = [layout];
  if (panel.speaker?.trim() && panel.dialogue?.trim()) {
    parts.push(`${panel.speaker.split(' ')[0]} speaks`);
  }
  parts.push('gpt-image-2');
  if (prompt) {
    return `${parts.join(' · ')} — ${truncate(prompt, 80)}`;
  }
  return parts.join(' · ');
}

export function buildTrailEvents({
  sceneNum,
  sceneTitle,
  sceneSummary,
  panels,
  isGenerating,
  sceneStatus,
  directives,
  drawStartedAt,
}: {
  sceneNum: number;
  sceneTitle?: string;
  sceneSummary?: string | null;
  panels: PanelProps[];
  isGenerating: boolean;
  sceneStatus?: string;
  directives: SceneDirective[];
  drawStartedAt?: Map<number, number>;
}): TrailEvent[] {
  const events: TrailEvent[] = [];
  const sortedPanels = [...panels].sort((a, b) => a.panelNum - b.panelNum);
  const donePanels = sortedPanels.filter(p => p.status === 'done').length;
  const totalPanels = sortedPanels.length;
  const allPanelsDone = totalPanels > 0 && donePanels === totalPanels;
  const sceneComplete =
    sceneStatus === 'done' || (!isGenerating && allPanelsDone);

  events.push({
    id: 'connected',
    kind: 'connected',
    label: 'Subscription active',
    detail: 'Client connected to SpacetimeDB · session, scene, panel tables',
    active: false,
    done: true,
  });

  for (const directive of directives) {
    events.push({
      id: `directive-${directive.directiveId}`,
      kind: 'directive',
      label: 'narrative_directive row inserted',
      detail: `apply_nudge · [${directive.type}] ${truncate(directive.content, 56)}`,
      active: false,
      done: true,
    });
    events.push({
      id: `nudge-shift-${directive.directiveId}`,
      kind: 'nudge_shift',
      label: `Directive bound to scene ${directive.appliedAtScene}`,
      detail: `applied_at_scene=${directive.appliedAtScene} · feeds generate_scene prompt`,
      active: false,
      done: true,
    });
  }

  const claudeActive = isGenerating && totalPanels === 0;
  events.push({
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
  });

  if (totalPanels > 0) {
    const titlePart = sceneTitle ? `"${truncate(sceneTitle, 40)}"` : 'Untitled';
    const summaryPart = sceneSummary?.trim()
      ? ` · ${truncate(sceneSummary.trim(), 72)}`
      : '';
    events.push({
      id: 'script-ready',
      kind: 'script_ready',
      label: 'scene + panel rows inserted',
      detail: `scene.status=generating · ${titlePart} · ${totalPanels} panel row${totalPanels === 1 ? '' : 's'}${summaryPart}`,
      active: false,
      done: true,
    });
  }

  const drawingPanel = sortedPanels.find(p => p.status === 'generating');
  const drawingNum = drawingPanel?.panelNum;

  for (const panel of sortedPanels) {
    const badge = panelBadge(panel.panelNum);
    const scriptDetail = formatPanelScript(panel);
    const hasScript =
      panel.caption?.trim() || panel.dialogue?.trim() || panel.speaker?.trim();

    events.push({
      id: `script-${panel.panelNum}`,
      kind: 'panel_script',
      label: `panel row synced · #${badge}`,
      detail: hasScript
        ? `${panel.layoutHint || 'square'} · ${scriptDetail}`
        : `${panel.layoutHint || 'square'} · visual only`,
      active: false,
      done: true,
    });

    const isDrawing = panel.status === 'generating';
    const isDone = panel.status === 'done';
    const isFailed = panel.status === 'error';
    const isQueued =
      !isDone &&
      !isDrawing &&
      !isFailed &&
      drawingNum != null &&
      panel.panelNum > drawingNum;

    if (isFailed) {
      events.push({
        id: `draw-${panel.panelNum}`,
        kind: 'panel_draw',
        label: `panel #${badge} · image failed`,
        detail: 'OpenAI image call failed · status=error',
        active: false,
        done: false,
      });
    } else if (isDrawing) {
      const startedAt = drawStartedAt?.get(panel.panelNum);
      const elapsed =
        startedAt != null
          ? ` · ${Math.floor((Date.now() - startedAt) / 1000)}s`
          : '';
      events.push({
        id: `draw-${panel.panelNum}`,
        kind: 'panel_draw',
        label: `generate_scene · OpenAI image call${elapsed}`,
        detail: `panel #${badge} · ${formatPanelDraw(panel)}`,
        active: true,
        done: false,
        startedAt,
      });
    } else if (isDone) {
      events.push({
        id: `draw-${panel.panelNum}`,
        kind: 'panel_draw',
        label: `panel #${badge} · image generated`,
        detail: 'OpenAI returned image · module writing image_url',
        active: false,
        done: true,
      });
      events.push({
        id: `done-${panel.panelNum}`,
        kind: 'panel_done',
        label: `panel row updated · #${badge}`,
        detail: 'status=done · image_url set · subscription push',
        active: false,
        done: true,
      });
    } else if (isQueued) {
      events.push({
        id: `queued-${panel.panelNum}`,
        kind: 'panel_queued',
        label: `panel #${badge} · queued in module`,
        detail: panel.imagePrompt?.trim()
          ? `status=generating · ${truncate(panel.imagePrompt, 80)}`
          : 'status=generating · waiting for prior panel',
        active: false,
        done: false,
      });
    }
  }

  if (sceneStatus === 'error') {
    events.push({
      id: 'scene-error',
      kind: 'scene_done',
      label: 'scene row updated',
      detail: `status=error · ${donePanels}/${totalPanels} panels completed before failure`,
      active: false,
      done: false,
    });
  } else if (sceneComplete && totalPanels > 0) {
    events.push({
      id: 'scene-done',
      kind: 'scene_done',
      label: 'scene row updated',
      detail: `status=done · character mood + memory rows written · ${donePanels}/${totalPanels} panels`,
      active: false,
      done: true,
    });
    events.push({
      id: 'synced',
      kind: 'synced',
      label: 'Subscription update received',
      detail: 'All panel + scene rows synced to browser',
      active: false,
      done: true,
    });
  }

  return events;
}
