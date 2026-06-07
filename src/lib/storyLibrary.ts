import type { StoryLibraryEntry } from '../module_bindings/types';
import { formatStoryHeader } from './resumeLabel';

export type StoryLibraryCard = StoryLibraryEntry;

export function mapStoryLibraryRow(row: StoryLibraryEntry): StoryLibraryCard {
  return row;
}

export function storyLibraryHeader(card: StoryLibraryCard): string {
  return formatStoryHeader(card.genre, card.setting);
}

export function storyProgressLabel(card: StoryLibraryCard): string {
  return `Scene ${card.currentScene} / ${card.totalScenes}`;
}

export function storyStatusLabel(card: StoryLibraryCard): string {
  if (card.isGenerating) return 'Generating';
  if (card.isComplete) return 'Complete';
  return 'In progress';
}

export function storyResumeLabel(card: StoryLibraryCard): string {
  if (card.isComplete) return 'Browse comic';
  if (card.isGenerating) return 'Continue';
  return 'Resume';
}

export function formatStoryCreatedAt(createdAt: bigint): string {
  const ms = Number(createdAt / 1000n);
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function roleLabel(role: string): string {
  return role === 'owner' ? 'Owner' : 'Co-director';
}
