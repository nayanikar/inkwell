// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyStdbEvent } from './activityTrail.js';

describe('classifyStdbEvent', () => {
  it('classifies reducers', () => {
    expect(
      classifyStdbEvent(
        'nudge_submitted',
        'submit_nudge · pending nudge queued',
        'alice · [plot] twist'
      )
    ).toEqual({ primitive: 'reducer', call: 'submit_nudge' });

    expect(
      classifyStdbEvent(
        'story_fork_requested',
        'Story fork requested',
        'scene 2'
      )
    ).toEqual({ primitive: 'reducer', call: 'fork_story_at_scene' });
  });

  it('classifies procedures', () => {
    expect(
      classifyStdbEvent(
        'generate_start',
        'generate_scene procedure started',
        'scene 2'
      )
    ).toEqual({ primitive: 'procedure', call: 'generate_scene' });

    expect(
      classifyStdbEvent(
        'generation_resume',
        'resume_generation · continuing server work',
        'full'
      )
    ).toEqual({ primitive: 'procedure', call: 'resume_generation' });
  });

  it('classifies withTx checkpoints', () => {
    expect(
      classifyStdbEvent(
        'script_ready',
        'scene + panel rows inserted',
        '7 panel row(s) · subscription push'
      )
    ).toEqual({ primitive: 'transaction', call: 'generate_scene' });

    expect(
      classifyStdbEvent(
        'scene_advanced',
        'advance_and_generate · scene advanced',
        'current_scene=3'
      )
    ).toEqual({ primitive: 'transaction', call: 'advance_and_generate' });
  });

  it('classifies scheduler and subscription', () => {
    expect(
      classifyStdbEvent(
        'panel_retry_scheduled',
        'panel #03 · retry scheduled',
        'attempt 1/3'
      )
    ).toEqual({ primitive: 'scheduled', call: 'retry_panel_image' });

    expect(
      classifyStdbEvent(
        'synced',
        'Subscription update received',
        'Scene page image synced'
      )
    ).toEqual({ primitive: 'subscription', call: 'useTable' });
  });
});
