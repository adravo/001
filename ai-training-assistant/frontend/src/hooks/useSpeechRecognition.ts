import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
}

/**
 * Wraps the browser's Web Speech API (SpeechRecognition) for trainee voice
 * input. Falls back gracefully (isSupported=false) on browsers that lack it
 * (e.g. Firefox), where the UI should rely on typed questions instead.
 */
export function useSpeechRecognition(onFinalTranscript: (text: string) => void): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const SpeechRecognitionCtor =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  const isSupported = Boolean(SpeechRecognitionCtor);

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim);
      if (final.trim()) {
        onFinalRef.current(final.trim());
        setInterimTranscript('');
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setInterimTranscript('');
    recognitionRef.current.start();
    setIsListening(true);
  }, [isListening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, interimTranscript, start, stop };
}
