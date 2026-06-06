import type { PanelProps } from '../components/Panel';

export type NarrationCharacter = {
  name: string;
  archetype: string;
};

export type NarrationSegment = {
  panelNum: number;
  text: string;
};

export function buildPanelNarrationText(panel: PanelProps): string {
  const parts: string[] = [];
  if (panel.caption?.trim()) {
    parts.push(panel.caption.trim());
  }
  if (panel.dialogue?.trim()) {
    const who = panel.speaker?.trim();
    parts.push(who ? `${who}: ${panel.dialogue.trim()}` : panel.dialogue.trim());
  }
  return parts.join(' ');
}

export function buildNarrationSegments(
  panels: PanelProps[],
  _characters: NarrationCharacter[]
): NarrationSegment[] {
  return panels
    .filter(p => p.status === 'done')
    .sort((a, b) => a.panelNum - b.panelNum)
    .map(panel => ({
      panelNum: panel.panelNum,
      text: buildPanelNarrationText(panel),
    }))
    .filter(seg => seg.text.length > 0);
}

export function speakWithWebSpeech(
  text: string,
  onEnd?: () => void
): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopWebSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
