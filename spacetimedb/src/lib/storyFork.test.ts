// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  effectiveRootSessionId,
  getForkPreconditionError,
} from './storyForkValidation.js';

function makeTx(options: {
  session?: Record<string, unknown> | null;
  scenes?: Record<string, unknown>[];
  generation?: Record<string, unknown> | null;
  activityEvents?: Record<string, unknown>[];
}) {
  const {
    session = null,
    scenes = [],
    generation = null,
    activityEvents = [],
  } = options;

  return {
    db: {
      session: {
        session_id: {
          find: (id: bigint) =>
            session && session.session_id === id ? session : undefined,
        },
      },
      scene: {
        session_id: {
          filter: () => scenes,
        },
      },
      sceneGeneration: {
        generation_id: {
          find: (id: bigint) =>
            generation && generation.generation_id === id
              ? generation
              : undefined,
        },
      },
      activityEvent: {
        session_id: {
          filter: () => activityEvents,
        },
      },
    },
  };
}

describe('getForkPreconditionError', () => {
  const sessionId = 1n;
  const baseSession = {
    session_id: sessionId,
    generating_scene: 0,
    current_scene: 3,
  };

  it('rejects when session is missing', () => {
    const tx = makeTx({ session: null });
    expect(getForkPreconditionError(tx, sessionId, 2, 0n)).toBe(
      'Session not found'
    );
  });

  it('rejects fork while generating', () => {
    const tx = makeTx({
      session: { ...baseSession, generating_scene: 2 },
      scenes: [{ scene_num: 2, status: 'done', scene_id: 10n }],
    });
    expect(getForkPreconditionError(tx, sessionId, 2, 0n)).toMatch(
      /generating/i
    );
  });

  it('rejects scene beyond current head', () => {
    const tx = makeTx({
      session: baseSession,
      scenes: [{ scene_num: 2, status: 'done', scene_id: 10n }],
    });
    expect(getForkPreconditionError(tx, sessionId, 4, 0n)).toMatch(
      /completed act/i
    );
  });

  it('rejects incomplete canonical scene', () => {
    const tx = makeTx({
      session: baseSession,
      scenes: [
        { scene_num: 1, status: 'done', scene_id: 9n },
        { scene_num: 2, status: 'error', scene_id: 10n },
      ],
    });
    expect(getForkPreconditionError(tx, sessionId, 2, 0n)).toMatch(
      /Finish or retry/i
    );
  });

  it('rejects unknown generation snapshot', () => {
    const tx = makeTx({
      session: baseSession,
      scenes: [{ scene_num: 2, status: 'done', scene_id: 10n }],
      generation: {
        generation_id: 99n,
        session_id: 2n,
        scene_num: 2,
      },
    });
    expect(getForkPreconditionError(tx, sessionId, 2, 99n)).toMatch(
      /Generation not found/i
    );
  });

  it('allows fork at completed scene with canonical content', () => {
    const tx = makeTx({
      session: baseSession,
      scenes: [
        { scene_num: 1, status: 'done', scene_id: 9n },
        { scene_num: 2, status: 'done', scene_id: 10n },
      ],
    });
    expect(getForkPreconditionError(tx, sessionId, 2, 0n)).toBeNull();
  });

  it('allows fork with valid generation snapshot', () => {
    const tx = makeTx({
      session: baseSession,
      scenes: [{ scene_num: 2, status: 'done', scene_id: 10n }],
      generation: {
        generation_id: 99n,
        session_id: sessionId,
        scene_num: 2,
      },
    });
    expect(getForkPreconditionError(tx, sessionId, 2, 99n)).toBeNull();
  });
});

describe('effectiveRootSessionId', () => {
  it('uses session_id when root is unset', () => {
    expect(
      effectiveRootSessionId({ session_id: 5n, root_session_id: 0n })
    ).toBe(5n);
  });

  it('uses root_session_id when set', () => {
    expect(
      effectiveRootSessionId({ session_id: 8n, root_session_id: 3n })
    ).toBe(3n);
  });
});
