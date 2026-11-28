import type { CSSProperties } from 'react';

interface TypewriterProps {
  text: string;
  /** Chờ bao lâu (ms) trước khi bắt đầu hiện chữ. */
  delay?: number;
  /** Khoảng cách (ms) giữa hai ký tự. */
  speed?: number;
  className?: string;
}

/**
 * Chữ hiện dần từng ký tự, mỗi ký tự mờ dần sang rõ, nhích nhẹ lên và hết nhòe (không có con trỏ).
 * Hoàn toàn bằng CSS: mỗi ký tự dựng một lần, trễ theo `--i` (animation-delay) nên React không
 * render lại theo từng chữ và trình duyệt tự chạy hoạt ảnh trên compositor, không giật khi máy bận.
 * Ký tự gom theo từ (không ngắt giữa từ khi xuống dòng) và luôn giữ chỗ nên khối không nhảy;
 * trình đọc màn hình đọc nguyên câu ngay. Giảm chuyển động: hiện đủ chữ, không hoạt ảnh.
 */
/** Tách câu thành từ/khoảng trắng kèm nhịp (số ký tự đứng trước) để tính trễ mà không đổi biến khi render. */
function splitWords(text: string) {
  let start = 0;
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((word) => {
      const characters = Array.from(word);
      const token = { characters, isSpace: /^\s+$/.test(word), start, word };
      start += characters.length;
      return token;
    });
}

export function Typewriter({ className, delay = 0, speed = 38, text }: TypewriterProps) {
  return (
    <span
      className={`typewriter${className ? ` ${className}` : ''}`}
      style={{ '--tw-delay': `${delay}ms`, '--tw-speed': `${speed}ms` } as CSSProperties}
    >
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {splitWords(text).map(({ characters, isSpace, start, word }, wordIndex) =>
          // Khoảng trắng nằm ngoài từ để trình duyệt xuống dòng ở đây; vẫn chiếm một nhịp.
          isSpace ? (
            word
          ) : (
            <span className="typewriter__word" key={wordIndex}>
              {characters.map((character, characterIndex) => (
                <span
                  className="typewriter__char"
                  key={characterIndex}
                  style={{ '--i': start + characterIndex } as CSSProperties}
                >
                  {character}
                </span>
              ))}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
