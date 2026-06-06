import { DB_NAME } from './stdb';

const STORAGE_KEY = `${DB_NAME}/saved_session`;

export type SavedSession = {
  sessionId: string;
  sceneNum: number;
  genre: string;
  setting: string;
  savedAt: number;
};

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (!parsed.sessionId || !parsed.sceneNum) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionProgress(data: Omit<SavedSession, 'savedAt'>): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...data, savedAt: Date.now() } satisfies SavedSession)
  );
}

export function clearSavedSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
