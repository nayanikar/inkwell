import { useCallback, useState } from 'react';
import type { NudgePreset } from '../lib/nudgePresets';
import {
  describeVoiceNudgeResult,
  parseVoiceNudgeCommand,
  type ParsedVoiceNudge,
} from '../lib/voiceCommands';
import { useSpeechRecognition } from './useSpeechRecognition';

type UseVoiceNudgeOptions = {
  presets: NudgePreset[];
  disabled?: boolean;
  onNudge?: (type: string, content: string) => void;
  onSubmitNudge?: (type: string, content: string) => void;
};

export function useVoiceNudge({
  presets,
  disabled = false,
  onNudge,
  onSubmitNudge,
}: UseVoiceNudgeOptions) {
  const [lastCommand, setLastCommand] = useState<ParsedVoiceNudge | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFinalTranscript = useCallback(
    (raw: string) => {
      if (disabled) return;

      const parsed = parseVoiceNudgeCommand(raw, presets);
      if (!parsed) {
        setStatusMessage('Could not understand command');
        return;
      }

      setLastCommand(parsed);
      setStatusMessage(describeVoiceNudgeResult(parsed));

      if (parsed.applyImmediately) {
        onNudge?.(parsed.type, parsed.content);
      } else {
        onSubmitNudge?.(parsed.type, parsed.content);
      }
    },
    [disabled, onNudge, onSubmitNudge, presets]
  );

  const {
    isListening,
    interimTranscript,
    start,
    stop,
    supported,
    error,
    clearTranscript,
  } = useSpeechRecognition({ onFinalTranscript: handleFinalTranscript });

  const toggleListening = useCallback(() => {
    if (disabled) return;
    if (isListening) {
      stop();
      return;
    }
    setStatusMessage(null);
    setLastCommand(null);
    clearTranscript();
    start();
  }, [clearTranscript, disabled, isListening, start, stop]);

  return {
    isListening,
    interimTranscript,
    lastCommand,
    statusMessage,
    speechError: error,
    supported,
    toggleListening,
    stopListening: stop,
  };
}
