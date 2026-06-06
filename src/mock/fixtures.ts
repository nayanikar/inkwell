import type { PanelData, SessionData } from '../lib/types';

export const mockSession: SessionData = {
  sessionId: 1n,
  genre: 'noir',
  setting: 'Rain-soaked 1950s Los Angeles',
  totalScenes: 6,
  currentScene: 1,
  status: 'running',
};

export const mockPanels: PanelData[] = [
  {
    panelNum: 1,
    caption: 'The rain never quits in this town.',
    speaker: '',
    dialogue: '',
    imageUrl: '',
    layoutHint: 'wide',
    status: 'done',
  },
  {
    panelNum: 2,
    caption: '',
    speaker: 'Detective Mara Cole',
    dialogue: 'You said you were home all night.',
    imageUrl: '',
    layoutHint: 'square',
    status: 'done',
  },
  {
    panelNum: 3,
    caption: '',
    speaker: 'Vincent Hale',
    dialogue: 'Home is a flexible word, detective.',
    imageUrl: '',
    layoutHint: 'close-up',
    status: 'generating',
  },
  {
    panelNum: 4,
    caption: 'Lightning splits the sky.',
    speaker: '',
    dialogue: '',
    imageUrl: '',
    layoutHint: 'wide',
    status: 'generating',
  },
  {
    panelNum: 5,
    caption: '',
    speaker: 'Detective Mara Cole',
    dialogue: 'Then explain the mud on your shoes.',
    imageUrl: '',
    layoutHint: 'tall',
    status: 'generating',
  },
  {
    panelNum: 6,
    caption: 'Some truths arrive like thunder.',
    speaker: 'Vincent Hale',
    dialogue: '...',
    imageUrl: '',
    layoutHint: 'close-up',
    status: 'generating',
  },
];

export const mockSceneTitle = 'The Rain Never Quits';
