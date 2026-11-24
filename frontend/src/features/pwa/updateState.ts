const KEY = 'bep-viet.update-in-progress';
const MAX_AGE = 10 * 60_000;

export function beginUpdate(build: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ build, at: Date.now() }));
}

export function updateInProgress() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const value = JSON.parse(raw) as { at?: number };
    return typeof value.at === 'number' && Date.now() - value.at < MAX_AGE;
  } catch {
    return false;
  }
}

export function finishUpdate(currentBuild: string): 'success' | 'failed' | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const value = JSON.parse(raw) as { build?: string; at?: number };
    if (!value.build || !value.at || Date.now() - value.at > MAX_AGE) return null;
    return value.build === currentBuild ? 'failed' : 'success';
  } catch {
    return null;
  }
}

export function cancelUpdate() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Storage unavailable. */
  }
}
