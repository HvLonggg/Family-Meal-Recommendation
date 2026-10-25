import { speakableText } from '@/features/assistant/useSpeech';
import { splitIntoChunks } from '@/features/narration/recipeScript';

/**
 * Đọc một đoạn dài thành nhiều câu ngắn nối tiếp (giọng Chrome hay tự dừng khi câu dài) và
 * luôn gọi `onDone` đúng một lần — kể cả khi trình duyệt quên phát sự kiện kết thúc.
 */
export function speakSequence(
  text: string,
  lang: string,
  onDone: () => void,
  /**
   * Gọi ở đầu mỗi từ được đọc: `length` độ dài từ (0 = bắt đầu một câu), `charIndex` vị trí
   * tuyệt đối trong văn bản đọc (các câu nối bằng một dấu cách). Dùng để rồng khớp khẩu hình.
   */
  onWord?: (length: number, charIndex: number) => void,
  /** Gọi một lần trước khi đọc, kèm đúng văn bản sẽ đọc (để dựng khẩu hình theo âm tiết). */
  onStart?: (spokenText: string) => void,
) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let finished = false;
  let watchdog = 0;
  const done = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(watchdog);
    onDone();
  };
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    done();
    return () => undefined;
  }
  const chunks = splitIntoChunks(speakableText(text, lang.slice(0, 2)));
  synth.cancel();
  const voice = synth
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  onStart?.(chunks.join(' '));
  let offset = 0;
  chunks.forEach((chunk, index) => {
    const start = offset;
    offset += chunk.length + 1;
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    if (onWord) {
      // Giọng không phát boundary (Google tiếng Việt trên Chrome) vẫn căn được theo đầu câu.
      utterance.onstart = () => onWord(0, start);
      utterance.onboundary = (event) => {
        if (event.name === 'word' || event.name === undefined) {
          onWord(event.charLength || 3, start + (event.charIndex || 0));
        }
      };
    }
    if (index === chunks.length - 1) {
      utterance.onend = done;
      utterance.onerror = done;
    }
    synth.speak(utterance);
  });
  if (!chunks.length) done();
  // Ước lượng thời gian đọc (~10 ký tự/giây) cộng dư 4 giây làm chốt an toàn.
  watchdog = window.setTimeout(done, (text.length / 10) * 1000 + 4000);
  return () => {
    finished = true;
    window.clearTimeout(watchdog);
    synth.cancel();
  };
}
