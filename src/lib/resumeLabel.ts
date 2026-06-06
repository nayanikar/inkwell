import type { SavedSession } from './savedSession';

const MAX_STORY_NAME_LEN = 40;

export function storyDisplayName(genre?: string, setting?: string): string {
  const trimmed = setting?.trim();
  if (trimmed) return trimmed;
  if (genre?.trim()) return `${genre.trim()} story`;
  return 'Untitled story';
}

export function formatStoryHeader(genre?: string, setting?: string): string {
  const g = (genre ?? '').trim();
  const s = (setting ?? '').trim();
  if (g && s) return `${g} · ${s}`.toUpperCase();
  return storyDisplayName(g, s).toUpperCase();
}

export function formatResumeLabel(saved: SavedSession): string {
  const name = storyDisplayName(saved.genre, saved.setting);
  const truncated =
    name.length > MAX_STORY_NAME_LEN
      ? `${name.slice(0, MAX_STORY_NAME_LEN - 1)}…`
      : name;
  return `Resume ${truncated} · scene ${saved.sceneNum}`;
}
