import { useState } from 'react';

import { apiUrl } from '@/lib/api/client';

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'B';
  const last = words.at(-1)!;
  return (
    words.length > 1 ? `${words[0]!.charAt(0)}${last.charAt(0)}` : last.charAt(0)
  ).toUpperCase();
}

export function UserAvatar({ className = '', name, size = 40, src }: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = apiUrl(src);
  const showImage = resolved && failedSrc !== resolved;
  return (
    <span
      aria-hidden="true"
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {showImage ? (
        <img alt="" decoding="async" onError={() => setFailedSrc(resolved)} src={resolved} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
