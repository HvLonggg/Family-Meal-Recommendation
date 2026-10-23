import { useCallback, useEffect, useRef, useState } from 'react';

import { spokenUnits, toSpokenLang } from '@/features/assistant/spokenUnits';

/** Kiểu tối thiểu của Web Speech API (Chrome/Edge/Safari dùng tiền tố webkit). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export type RecognitionError = 'not-allowed' | 'no-speech' | 'network' | 'other';

interface RecognitionOptions {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (error: RecognitionError) => void;
  onEnd?: () => void;
}

export function useSpeechRecognition() {
  const supported = Boolean(recognitionCtor());
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const abort = useCallback(() => {
    const current = recognitionRef.current;
    recognitionRef.current = null;
    if (current) {
      current.onend = null;
      current.abort();
    }
    setListening(false);
  }, []);

  const start = useCallback(
    ({ lang, onEnd, onError, onFinal, onInterim }: RecognitionOptions) => {
      const Ctor = recognitionCtor();
      if (!Ctor) return false;
      abort();
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      let finalText = '';
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript ?? '';
          if (result?.isFinal) finalText += text;
          else interim += text;
        }
        onInterim?.((finalText + interim).trim());
      };
      recognition.onerror = (event) => {
        onError?.(
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'not-allowed'
            : event.error === 'no-speech'
              ? 'no-speech'
              : event.error === 'network'
                ? 'network'
                : 'other',
        );
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
        if (finalText.trim()) onFinal(finalText.trim());
        onEnd?.();
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
        return true;
      } catch {
        recognitionRef.current = null;
        setListening(false);
        return false;
      }
    },
    [abort],
  );

  useEffect(() => abort, [abort]);

  return { supported, listening, start, stop, abort };
}

/**
 * Bỏ ký hiệu định dạng và đọc đơn vị/số thành lời (250g → 250 gam) để máy đọc tự nhiên.
 * `lang` nhận 'vi' | 'en' hoặc dạng 'vi-VN', 'en-US'.
 */
export function speakableText(markdown: string, lang = 'vi') {
  const plain = markdown
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^\s*-\s+/gm, '')
    .replace(/[#>`_]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '');
  return spokenUnits(plain, toSpokenLang(lang)).replace(/\s+/g, ' ').trim();
}

export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string, lang: string, onEnd?: () => void) => {
      if (!supported) {
        onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speakableText(text, lang));
      utterance.lang = lang;
      const voice = window.speechSynthesis
        .getVoices()
        .find((item) => item.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.pitch = 1.08;
      const finish = () => {
        setSpeakingId((current) => (current === id ? null : current));
        onEnd?.();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  useEffect(() => cancel, [cancel]);

  return { supported, speakingId, speak, cancel };
}
