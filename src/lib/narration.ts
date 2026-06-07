import type { PanelProps } from '../components/Panel';

export type NarrationCharacter = {
  name: string;
  archetype: string;
};

export type NarrationSegment = {
  panelNum: number;
  text: string;
};

export type NarrationSegmentWithRatio = NarrationSegment & {
  startRatio: number;
  audioUrl?: string;
};

const SEGMENT_GAP_MS = 450;

let activeAudio: HTMLAudioElement | null = null;
let segmentPlaybackToken = 0;

function trailingPause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function formatCaptionForSpeech(caption: string): string {
  return trailingPause(caption.trim());
}

function formatDialogueForSpeech(dialogue: string): string {
  const line = dialogue.trim();
  if (!line) return '';
  if (/^["']/.test(line)) return trailingPause(line);
  return trailingPause(`"${line}"`);
}

export function buildPanelNarrationText(panel: PanelProps): string {
  const parts: string[] = [];
  if (panel.caption?.trim()) {
    parts.push(formatCaptionForSpeech(panel.caption));
  }
  if (panel.dialogue?.trim()) {
    const spoken = formatDialogueForSpeech(panel.dialogue);
    if (spoken) parts.push(spoken);
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
    .flatMap(panel => {
      const segments: NarrationSegment[] = [];
      if (panel.caption?.trim()) {
        segments.push({
          panelNum: panel.panelNum,
          text: formatCaptionForSpeech(panel.caption),
        });
      }
      if (panel.dialogue?.trim()) {
        const spoken = formatDialogueForSpeech(panel.dialogue);
        if (spoken) {
          segments.push({
            panelNum: panel.panelNum,
            text: spoken,
          });
        }
      }
      return segments;
    })
    .filter(seg => seg.text.length > 0);
}

export function parseNarrationSegments(
  json: string | null | undefined
): NarrationSegmentWithRatio[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as NarrationSegmentWithRatio[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      seg =>
        typeof seg.panelNum === 'number' &&
        typeof seg.text === 'string' &&
        typeof seg.startRatio === 'number'
    );
  } catch {
    return [];
  }
}

let webSpeechVoicesPrimed = false;

function primeWebSpeechVoices() {
  if (webSpeechVoicesPrimed || typeof window === 'undefined') return;
  if (!window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
  webSpeechVoicesPrimed = true;
}

function pickNeutralVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  primeWebSpeechVoices();
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter(v => v.lang.startsWith('en'));
  return (
    en.find(v =>
      /samantha|karen|moira|google us english|natural|premium/i.test(v.name)
    ) ??
    en.find(v => !/compact|robot|fred/i.test(v.name)) ??
    en[0] ??
    voices[0] ??
    null
  );
}

export function speakWithWebSpeech(
  text: string,
  onEnd?: () => void
): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1;
  const voice = pickNeutralVoice();
  if (voice) utterance.voice = voice;
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

export function stopSceneNarration() {
  segmentPlaybackToken++;
  stopWebSpeech();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
}

export function findActiveSegment(
  segments: NarrationSegmentWithRatio[],
  progressRatio: number
): NarrationSegmentWithRatio | null {
  if (segments.length === 0) return null;
  let active = segments[0]!;
  for (const seg of segments) {
    if (seg.startRatio <= progressRatio) {
      active = seg;
    } else {
      break;
    }
  }
  return active;
}

function playSegmentSequence(
  segments: NarrationSegmentWithRatio[],
  index: number,
  token: number,
  onSegment?: (segment: NarrationSegmentWithRatio | null) => void,
  onEnd?: () => void,
  onError?: (err: unknown) => void
): void {
  if (token !== segmentPlaybackToken) return;

  if (index >= segments.length) {
    onSegment?.(null);
    onEnd?.();
    if (activeAudio) activeAudio = null;
    return;
  }

  const seg = segments[index]!;
  const url = seg.audioUrl?.trim();
  if (!url) {
    playSegmentSequence(segments, index + 1, token, onSegment, onEnd, onError);
    return;
  }

  const audio = new Audio(url);
  activeAudio = audio;
  onSegment?.(seg);

  const advance = () => {
    if (token !== segmentPlaybackToken) return;
    window.setTimeout(
      () => playSegmentSequence(segments, index + 1, token, onSegment, onEnd, onError),
      SEGMENT_GAP_MS
    );
  };

  audio.addEventListener('ended', advance);

  let failed = false;
  const failSegment = (err: unknown) => {
    if (failed || token !== segmentPlaybackToken) return;
    failed = true;
    segmentPlaybackToken++;
    if (activeAudio === audio) activeAudio = null;
    onError?.(err);
  };

  audio.addEventListener('error', () => {
    failSegment(new Error('Segment audio playback failed'));
  });

  void audio.play().catch(err => {
    failSegment(err);
  });
}

type PlaySceneNarrationOptions = {
  audioUrl: string;
  segments: NarrationSegmentWithRatio[];
  onSegment?: (segment: NarrationSegmentWithRatio | null) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
};

export function playSceneNarration({
  audioUrl,
  segments,
  onSegment,
  onEnd,
  onError,
}: PlaySceneNarrationOptions): HTMLAudioElement | null {
  stopSceneNarration();
  if (typeof window === 'undefined') return null;

  const segmentsWithAudio = segments.filter(s => s.audioUrl?.trim());
  if (segmentsWithAudio.length > 0) {
    const token = segmentPlaybackToken;
    playSegmentSequence(segmentsWithAudio, 0, token, onSegment, onEnd, onError);
    return null;
  }

  const audio = new Audio(audioUrl);
  activeAudio = audio;

  const handleTimeUpdate = () => {
    if (!audio.duration || !Number.isFinite(audio.duration)) return;
    const ratio = audio.currentTime / audio.duration;
    onSegment?.(findActiveSegment(segments, ratio));
  };

  let failed = false;
  const failPlayback = (err: unknown) => {
    if (failed) return;
    failed = true;
    if (activeAudio === audio) activeAudio = null;
    onError?.(err);
  };

  audio.addEventListener('timeupdate', handleTimeUpdate);
  audio.addEventListener('ended', () => {
    onSegment?.(null);
    onEnd?.();
    if (activeAudio === audio) activeAudio = null;
  });
  audio.addEventListener('error', () => {
    failPlayback(new Error('Audio playback failed'));
  });

  void audio.play().catch(err => {
    failPlayback(err);
  });

  if (segments.length > 0) {
    onSegment?.(segments[0]!);
  }

  return audio;
}
