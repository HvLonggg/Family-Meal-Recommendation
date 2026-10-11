import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthContext';

/** Áp dụng thiết lập hiển thị của tài khoản (cỡ chữ, giảm chuyển động) cho toàn ứng dụng. */
export function PreferenceEffects() {
  const { user } = useAuth();
  const textSize = user?.preferences?.text_size ?? 'normal';
  const reduceMotion = user?.preferences?.reduce_motion ?? false;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = textSize;
    root.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion, textSize]);

  return null;
}
