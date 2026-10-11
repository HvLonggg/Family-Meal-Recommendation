import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Language } from '@/features/auth/types';
import {
  NarrationController,
  pickVoice,
  type NarrationState,
  type NarrationVoices,
} from '@/features/narration/narrationController';
import type { NarrationLang, NarrationSegment } from '@/features/narration/recipeScript';

const SETTINGS_KEY = 'bep-viet:narration';
const IDLE_STATE: NarrationState = { status: 'idle', index: 0, rate: 1, volume: 1, error: false };
const noopSubscribe = () => () => {};

function speechSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

function readSettings(): { rate?: number; volume?: number } {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const { rate, volume } = parsed as Record<string, unknown>;
    return {
      rate: typeof rate === 'number' ? rate : undefined,
      volume: typeof volume === 'number' ? volume : undefined,
    };
  } catch {
    return {};
  }
}

function subscribeVoices(onChange: () => void) {
  const synth = window.speechSynthesis;
  synth.addEventListener?.('voiceschanged', onChange);
  return () => synth.removeEventListener?.('voiceschanged', onChange);
}

const LANGS: NarrationLang[] = ['vi-VN', 'en-US'];

/**
 * Giọng đã chọn cho từng ngôn ngữ, mã hóa thành chuỗi để `useSyncExternalStore` so sánh được.
 * `null`: trình duyệt chưa nạp xong danh sách giọng.
 */
function voiceSnapshot() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return JSON.stringify(
    Object.fromEntries(LANGS.map((lang) => [lang, pickVoice(voices, lang)?.voiceURI ?? ''])),
  );
}

export function useNarration(segments: NarrationSegment[], language: Language) {
  const [controller] = useState(() =>
    speechSupported()
      ? new NarrationController(
          window.speechSynthesis,
          (text) => new window.SpeechSynthesisUtterance(text),
          readSettings(),
        )
      : null,
  );
  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? (() => IDLE_STATE),
  );
  const voiceKey = useSyncExternalStore(
    controller ? subscribeVoices : noopSubscribe,
    controller ? voiceSnapshot : () => null,
  );
  const voiceURIs = voiceKey ? (JSON.parse(voiceKey) as Record<NarrationLang, string>) : null;

  useEffect(() => {
    controller?.setSegments(segments);
  }, [controller, segments]);

  useEffect(() => {
    if (!controller || !voiceKey) return;
    const uris = JSON.parse(voiceKey) as Record<NarrationLang, string>;
    const available = window.speechSynthesis.getVoices();
    const voices: NarrationVoices = {};
    for (const lang of LANGS) {
      const voice = available.find((item) => item.voiceURI === uris[lang]);
      if (voice) voices[lang] = voice;
    }
    controller.setVoices(voices);
  }, [controller, voiceKey]);

  // Rời trang, chuyển món hoặc đổi ngôn ngữ thì dừng đọc: kịch bản cũ không còn khớp màn hình.
  useEffect(() => () => controller?.stop(), [controller, language]);

  useEffect(() => {
    if (!controller) return;
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ rate: state.rate, volume: state.volume }),
      );
    } catch {
      // Trình duyệt chặn lưu trữ: chỉ mất phần ghi nhớ cài đặt, không ảnh hưởng việc đọc.
    }
  }, [controller, state.rate, state.volume]);

  const current = state.status === 'idle' ? null : (segments[state.index] ?? null);
  // Chỉ báo thiếu giọng khi đã nạp xong danh sách và kịch bản thực sự cần ngôn ngữ đó.
  const missingVoices = voiceURIs
    ? LANGS.filter((lang) => !voiceURIs[lang] && segments.some((item) => item.lang === lang))
    : [];

  return { controller, state, current, missingVoices };
}

export type Narration = ReturnType<typeof useNarration>;
