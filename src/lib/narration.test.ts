import { describe, expect, it } from 'vitest';
import type { PanelProps } from '../components/Panel';
import {
  buildNarrationSegments,
  buildPanelNarrationText,
  findActiveSegment,
  parseNarrationSegments,
} from './narration';

function panel(partial: Partial<PanelProps> & Pick<PanelProps, 'panelNum' | 'status'>): PanelProps {
  return {
    caption: '',
    speaker: '',
    dialogue: '',
    imageUrl: '',
    layoutHint: 'wide',
    ...partial,
  };
}

describe('buildPanelNarrationText', () => {
  it('formats caption and quoted dialogue', () => {
    const text = buildPanelNarrationText(
      panel({
        panelNum: 1,
        status: 'done',
        caption: 'Rain fell on the street',
        dialogue: 'We should go',
      })
    );
    expect(text).toContain('Rain fell on the street.');
    expect(text).toContain('"We should go".');
  });

  it('preserves dialogue that already has quotes', () => {
    const text = buildPanelNarrationText(
      panel({
        panelNum: 2,
        status: 'done',
        dialogue: '"Already quoted"',
      })
    );
    expect(text).toBe('"Already quoted".');
  });
});

describe('parseNarrationSegments', () => {
  it('parses valid segment json', () => {
    const json = JSON.stringify([
      { panelNum: 1, text: 'Hello', startRatio: 0, audioUrl: 'data:audio/mp3;base64,abc' },
      { panelNum: 2, text: 'World', startRatio: 0.5 },
    ]);
    const segments = parseNarrationSegments(json);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.audioUrl).toBe('data:audio/mp3;base64,abc');
  });

  it('returns empty array for invalid json', () => {
    expect(parseNarrationSegments('not json')).toEqual([]);
    expect(parseNarrationSegments(null)).toEqual([]);
  });
});

describe('buildNarrationSegments', () => {
  it('only includes done panels in panel order', () => {
    const segments = buildNarrationSegments(
      [
        panel({ panelNum: 2, status: 'generating', caption: 'Skip me' }),
        panel({ panelNum: 1, status: 'done', caption: 'First' }),
        panel({ panelNum: 3, status: 'done', dialogue: 'Second line' }),
      ],
      []
    );
    expect(segments.map(s => s.panelNum)).toEqual([1, 3]);
    expect(segments[0]?.text).toBe('First.');
  });
});

describe('findActiveSegment', () => {
  const segments = [
    { panelNum: 1, text: 'A', startRatio: 0 },
    { panelNum: 2, text: 'B', startRatio: 0.4 },
    { panelNum: 3, text: 'C', startRatio: 0.8 },
  ];

  it('returns the latest segment at or before the progress ratio', () => {
    expect(findActiveSegment(segments, 0)?.panelNum).toBe(1);
    expect(findActiveSegment(segments, 0.39)?.panelNum).toBe(1);
    expect(findActiveSegment(segments, 0.4)?.panelNum).toBe(2);
    expect(findActiveSegment(segments, 0.99)?.panelNum).toBe(3);
  });
});
