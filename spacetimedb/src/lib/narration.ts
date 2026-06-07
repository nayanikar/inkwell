import {
  formatCaptionForSpeech,
  formatDialogueForSpeech,
  formatSceneTitleForSpeech,
} from './narrationStyle.js';

export type PanelForNarration = {
  panel_num: number;
  caption: string;
  speaker: string;
  dialogue: string;
  status: string;
};

export type NarrationSegmentMeta = {
  panelNum: number;
  text: string;
  startRatio: number;
  audioUrl?: string;
};

function panelSpeechSegments(
  panel: PanelForNarration
): Omit<NarrationSegmentMeta, 'startRatio' | 'audioUrl'>[] {
  const segments: Omit<NarrationSegmentMeta, 'startRatio' | 'audioUrl'>[] = [];

  if (panel.caption?.trim()) {
    segments.push({
      panelNum: panel.panel_num,
      text: formatCaptionForSpeech(panel.caption),
    });
  }

  if (panel.dialogue?.trim()) {
    const spoken = formatDialogueForSpeech(panel.dialogue);
    if (spoken) {
      segments.push({
        panelNum: panel.panel_num,
        text: spoken,
      });
    }
  }

  return segments;
}

export function buildSceneNarrationScript(
  panels: PanelForNarration[],
  sceneTitle?: string
): {
  fullScript: string;
  segments: Omit<NarrationSegmentMeta, 'startRatio' | 'audioUrl'>[];
} {
  const sorted = [...panels]
    .filter(p => p.status === 'done' || p.status === 'generating')
    .sort((a, b) => a.panel_num - b.panel_num);

  const segments: Omit<NarrationSegmentMeta, 'startRatio' | 'audioUrl'>[] = [];
  const scriptParts: string[] = [];

  const titleSpeech = formatSceneTitleForSpeech(sceneTitle ?? '');
  if (titleSpeech) {
    segments.push({ panelNum: sorted[0]?.panel_num ?? 1, text: titleSpeech });
    scriptParts.push(titleSpeech);
    scriptParts.push('');
  }

  for (const panel of sorted) {
    const panelSegments = panelSpeechSegments(panel);
    for (const seg of panelSegments) {
      segments.push(seg);
      scriptParts.push(seg.text);
      scriptParts.push('');
    }
  }

  return {
    fullScript: scriptParts.join('\n').trim(),
    segments,
  };
}

export function computeSegmentRatios(
  segments: Omit<NarrationSegmentMeta, 'startRatio' | 'audioUrl'>[],
  fullScript: string
): NarrationSegmentMeta[] {
  if (segments.length === 0) return [];

  const totalLen = Math.max(fullScript.length, 1);
  let cursor = 0;
  const withRatios: NarrationSegmentMeta[] = [];

  for (const seg of segments) {
    const idx = fullScript.indexOf(seg.text, cursor);
    const charOffset = idx >= 0 ? idx : cursor;
    withRatios.push({
      ...seg,
      startRatio: Math.min(1, charOffset / totalLen),
    });
    cursor = charOffset + seg.text.length + 1;
  }

  return withRatios;
}

export function buildNarrationPayload(
  panels: PanelForNarration[],
  sceneTitle?: string
): { fullScript: string; segmentsJson: string; segments: NarrationSegmentMeta[] } | null {
  const { fullScript, segments } = buildSceneNarrationScript(panels, sceneTitle);
  if (!fullScript || segments.length === 0) return null;

  const withRatios = computeSegmentRatios(segments, fullScript);
  return {
    fullScript,
    segments: withRatios,
    segmentsJson: JSON.stringify(withRatios),
  };
}
