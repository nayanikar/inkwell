import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../components/Panel';
import {
  buildNarrationSegments,
  speakWithWebSpeech,
  stopWebSpeech,
  type NarrationCharacter,
} from '../lib/narration';

type UseSceneNarrationOptions = {
  panels: PanelProps[];
  characters: NarrationCharacter[];
  enabled: boolean;
};

export function useSceneNarration({
  panels,
  characters,
  enabled,
}: UseSceneNarrationOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePanelNum, setActivePanelNum] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const stopRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cleanup = useCallback(() => {
    stopRef.current = true;
    stopWebSpeech();
    utteranceRef.current = null;
    setIsPlaying(false);
    setActivePanelNum(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
    }
    return cleanup;
  }, [enabled, cleanup]);

  useEffect(() => {
    cleanup();
  }, [panels, cleanup]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const playSegment = useCallback(
    (index: number, segments: ReturnType<typeof buildNarrationSegments>) => {
      if (stopRef.current || index >= segments.length) {
        setIsPlaying(false);
        setActivePanelNum(null);
        return;
      }

      const seg = segments[index];
      setActivePanelNum(seg.panelNum);

      const advance = () => {
        if (stopRef.current) return;
        playSegment(index + 1, segments);
      };

      const utterance = speakWithWebSpeech(seg.text, advance);
      utteranceRef.current = utterance;
      if (!utterance) advance();
    },
    []
  );

  const play = useCallback(() => {
    if (muted) return;

    const segments = buildNarrationSegments(panels, characters);
    if (segments.length === 0) return;

    cleanup();
    stopRef.current = false;
    setIsPlaying(true);
    playSegment(0, segments);
  }, [muted, panels, characters, cleanup, playSegment]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      if (!prev) cleanup();
      return !prev;
    });
  }, [cleanup]);

  return {
    play,
    stop,
    isPlaying,
    activePanelNum,
    muted,
    toggleMute,
  };
}
