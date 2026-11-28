import { useEffect, useState } from 'react';

interface TypewriterProps {
  text: string;
  /** Chờ bao lâu (ms) trước khi bắt đầu hiện chữ. */
  delay?: number;
  /** Khoảng cách (ms) giữa hai ký tự. */
  speed?: number;
  className?: string;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

/**
 * Chữ hiện dần từng ký tự, mỗi ký tự mờ dần sang rõ và nhích nhẹ lên (không có con trỏ nháy).
 * Nhịp tính theo thời gian thực bằng requestAnimationFrame nên đều tay kể cả khi máy bận.
 * Ký tự chưa hiện vẫn giữ chỗ nên khối không nhảy; trình đọc màn hình đọc nguyên câu ngay.
 */
export function Typewriter({ className, delay = 0, speed = 38, text }: TypewriterProps) {
  const characters = Array.from(text);
  const total = characters.length;
  const [count, setCount] = useState(() => (prefersReducedMotion() ? total : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let frame = 0;
    let startedAt: number | null = null;
    const tick = (time: number) => {
      startedAt ??= time;
      const elapsed = time - startedAt - delay;
      const next = elapsed <= 0 ? 0 : Math.min(total, Math.floor(elapsed / speed) + 1);
      setCount((current) => (current === next ? current : next));
      if (next < total) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [delay, speed, total]);

  return (
    <span className={`typewriter${className ? ` ${className}` : ''}`}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {characters.map((character, index) => (
          <span
            className={index < count ? 'typewriter__char is-shown' : 'typewriter__char'}
            key={index}
          >
            {character}
          </span>
        ))}
      </span>
    </span>
  );
}
