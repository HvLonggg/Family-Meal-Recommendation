import { useEffect, useState } from 'react';

interface TypewriterProps {
  text: string;
  /** Chờ bao lâu (ms) trước khi bắt đầu gõ. */
  delay?: number;
  /** Thời gian gõ mỗi ký tự (ms). */
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
 * Chữ hiện dần như đang gõ phím. Phần chưa gõ vẫn giữ chỗ (ẩn) nên khối không bị nhảy khi chạy;
 * trình đọc màn hình đọc nguyên câu ngay. Người dùng tắt chuyển động thì hiện đủ câu luôn.
 */
export function Typewriter({ className, delay = 0, speed = 38, text }: TypewriterProps) {
  const characters = Array.from(text);
  const [count, setCount] = useState(() => (prefersReducedMotion() ? characters.length : 0));
  const total = characters.length;

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let timer: number | undefined;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        setCount((current) => {
          if (current + 1 >= total && timer !== undefined) window.clearInterval(timer);
          return Math.min(total, current + 1);
        });
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [delay, speed, total]);

  const typing = count > 0 && count < total;
  return (
    <span className={`typewriter${className ? ` ${className}` : ''}`}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {characters.slice(0, count).join('')}
        {typing ? <span className="typewriter__caret" /> : null}
        <span className="typewriter__rest">{characters.slice(count).join('')}</span>
      </span>
    </span>
  );
}
