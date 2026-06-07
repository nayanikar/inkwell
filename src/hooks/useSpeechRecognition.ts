import { useCallback, useEffect, useRef, useState } from 'react';

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

type UseSpeechRecognitionOptions = {
  onFinalTranscript?: (text: string) => void;
  interimResults?: boolean;
  lang?: string;
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { onFinalTranscript, interimResults = true, lang = 'en-US' } = options;
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const supported = getSpeechRecognitionCtor() != null;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result?.[0]?.transcript?.trim() ?? '';
        if (!text) continue;
        if (result.isFinal) finalText = text;
        else interim = text;
      }

      if (interim) setInterimTranscript(interim);
      if (finalText) {
        setTranscript(finalText);
        setInterimTranscript('');
        onFinalRef.current?.(finalText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted') {
        setError(
          event.error === 'not-allowed'
            ? 'Microphone access denied'
            : event.error === 'no-speech'
              ? 'No speech detected'
              : event.error
        );
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [interimResults, lang]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    start,
    stop,
    supported,
    error,
    clearTranscript,
  };
}
