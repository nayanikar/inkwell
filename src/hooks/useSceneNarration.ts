import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../components/Panel';
import {
  buildNarrationSegments,
  parseNarrationSegments,
  playSceneNarration,
  speakWithWebSpeech,
  stopSceneNarration,
  type NarrationCharacter,
  type NarrationSegmentWithRatio,
} from '../lib/narration';
import { loadNarrationMuted, saveNarrationMuted } from '../lib/narrationPrefs';

type UseSceneNarrationOptions = {
  panels: PanelProps[];
  characters: NarrationCharacter[];
  audioUrl?: string;
  segmentsJson?: string | null;
  sceneKey: string;
  autoPlayRequestId?: number;
  canPlay: boolean;
};

export function useSceneNarration({
  panels,
  characters,
  audioUrl,
  segmentsJson,
  sceneKey,
  autoPlayRequestId = 0,
  canPlay,
}: UseSceneNarrationOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePanelNum, setActivePanelNum] = useState<number | null>(null);
  const [activeNarrationText, setActiveNarrationText] = useState<string | null>(
    null
  );
  const [muted, setMuted] = useState(() => loadNarrationMuted());
  const stopRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastAutoPlayRef = useRef(0);

  const parsedSegments = parseNarrationSegments(segmentsJson);
  const trimmedAudioUrl = audioUrl?.trim() || '';

  const cleanup = useCallback(() => {
    stopRef.current = true;
    stopSceneNarration();
    utteranceRef.current = null;
    setIsPlaying(false);
    setActivePanelNum(null);
    setActiveNarrationText(null);
  }, []);

  useEffect(() => {
    cleanup();
    stopRef.current = false;
  }, [sceneKey, cleanup]);

  const playWebSpeechFallback = useCallback(() => {
    const segments = buildNarrationSegments(panels, characters);
    if (segments.length === 0) return;

    stopRef.current = false;
    setIsPlaying(true);

    const playSegment = (index: number) => {
      if (stopRef.current || index >= segments.length) {
        setIsPlaying(false);
        setActivePanelNum(null);
        setActiveNarrationText(null);
        return;
      }

      const seg = segments[index]!;
      setActivePanelNum(seg.panelNum);
      setActiveNarrationText(seg.text);

      const advance = () => {
        if (stopRef.current) return;
        window.setTimeout(() => playSegment(index + 1), 450);
      };

      utteranceRef.current = speakWithWebSpeech(seg.text, advance);
      if (!utteranceRef.current) advance();
    };

    playSegment(0);
  }, [panels, characters]);

  const play = useCallback(() => {
    if (muted || !canPlay) return;

    cleanup();
    stopRef.current = false;

    if (trimmedAudioUrl || parsedSegments.some(s => s.audioUrl?.trim())) {
      setIsPlaying(true);
      playSceneNarration({
        audioUrl: trimmedAudioUrl,
        segments: parsedSegments,
        onSegment: seg => {
          if (stopRef.current) return;
          setActivePanelNum(seg?.panelNum ?? null);
          setActiveNarrationText(seg?.text ?? null);
        },
        onEnd: () => {
          if (stopRef.current) return;
          setIsPlaying(false);
          setActivePanelNum(null);
          setActiveNarrationText(null);
        },
        onError: () => {
          if (stopRef.current) return;
          playWebSpeechFallback();
        },
      });
      return;
    }

    playWebSpeechFallback();
  }, [
    muted,
    canPlay,
    cleanup,
    trimmedAudioUrl,
    parsedSegments,
    playWebSpeechFallback,
  ]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      saveNarrationMuted(next);
      if (next) cleanup();
      return next;
    });
  }, [cleanup]);

  useEffect(() => {
    if (!canPlay || muted || autoPlayRequestId === 0) return;
    if (lastAutoPlayRef.current === autoPlayRequestId) return;
    lastAutoPlayRef.current = autoPlayRequestId;
    play();
  }, [autoPlayRequestId, canPlay, muted, play]);

  return {
    play,
    stop,
    isPlaying,
    activePanelNum,
    activeNarrationText,
    muted,
    toggleMute,
    canPlay: canPlay && !muted,
  };
}
