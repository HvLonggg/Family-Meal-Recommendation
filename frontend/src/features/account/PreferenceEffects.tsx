import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthContext';

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
