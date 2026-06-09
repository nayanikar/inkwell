import { schema, t, table, SenderError } from 'spacetimedb/server';
import { buildStyleBible } from './lib/style.js';
import { runGenerateScene, runRetryPageImage, runRetryPanelImage, runPageImageGeneration } from './lib/generateSceneCore.js';
import { runSceneNarration } from './lib/sceneNarration.js';
import { planGenerationResume, logGenerationResume, isPageImageInFlight } from './lib/generationRecovery.js';
import { logActivity } from './lib/activityLog.js';
import {
  assertSessionOwner,
  assertSessionDirector,
  assertCurrentSceneComplete,
  directorDisplayName,
  findCoDirectorRow,
  inviteCodesMatch,
  generateInviteCode,
  isSessionOwner,
  pickCanonicalScene,
} from './lib/sessionGuards.js';
import {
  assertSchedulerCaller,
  enqueuePanelRetry,
  cancelPanelRetriesForPanel,
} from './lib/panelRetry.js';
import {
  targetSceneForNudge,
  replaceDirectiveForScene,
  upsertPendingNudge,
  resolveAdvanceNudge,
  claimGenerationLock,
  consumePendingNudge,
  queuePendingOnRace,
  assertGenerateSceneAllowed,
} from './lib/nudgeCoordination.js';
import { restoreGeneration, pruneSceneGenerationHistory } from './lib/generationArchive.js';
import { buildStoryLibrary, buildStoryBranches } from './lib/storyLibrary.js';
import { forkStoryAtScene } from './lib/storyFork.js';

const CharacterInput = t.object('CharacterInput', {
  name: t.string(),
  archetype: t.string(),
  personality: t.string(),
  current_mood: t.string(),
  secret: t.string(),
  visual_description: t.string(),
});

const StoryLibraryEntry = t.object('StoryLibraryEntry', {
  session_id: t.u64(),
  genre: t.string(),
  setting: t.string(),
  status: t.string(),
  current_scene: t.u32(),
  total_scenes: t.u32(),
  generating_scene: t.u32(),
  resume_scene: t.u32(),
  scenes_done: t.u32(),
  is_complete: t.bool(),
  is_generating: t.bool(),
  role: t.string(),
  cover_page_image_url: t.string(),
  created_at: t.u64(),
  root_session_id: t.u64(),
  parent_session_id: t.u64(),
  fork_scene_num: t.u32(),
  branch_label: t.string(),
  forked_at: t.u64(),
  is_fork: t.bool(),
  branch_count: t.u32(),
});

const StoryBranchEntry = t.object('StoryBranchEntry', {
  session_id: t.u64(),
  root_session_id: t.u64(),
  parent_session_id: t.u64(),
  fork_scene_num: t.u32(),
  fork_generation_id: t.u64(),
  branch_label: t.string(),
  forked_at: t.u64(),
  current_scene: t.u32(),
  total_scenes: t.u32(),
  generating_scene: t.u32(),
  is_root: t.bool(),
  role: t.string(),
  genre: t.string(),
  setting: t.string(),
  created_at: t.u64(),
});

const session = table(
  { name: 'session', public: true },
  {
    session_id: t.u64().primaryKey().autoInc(),
    owner_identity: t.identity().index('btree'),
    invite_code: t.string(),
    genre: t.string(),
    setting: t.string(),
    style_bible: t.string(),
    total_scenes: t.u32(),
    current_scene: t.u32(),
    generating_scene: t.u32().default(0),
    status: t.string(),
    created_at: t.u64(),
    root_session_id: t.u64().default(0n).index('btree'),
    parent_session_id: t.u64().default(0n).index('btree'),
    fork_scene_num: t.u32().default(0),
    fork_generation_id: t.u64().default(0n),
    branch_label: t.string().default(''),
    forked_at: t.u64().default(0n),
  }
);

const character = table(
  { name: 'character', public: true },
  {
    char_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    name: t.string(),
    archetype: t.string(),
    personality: t.string(),
    current_mood: t.string(),
    visual_description: t.string().default(''),
    reference_image_url: t.string().default(''),
    current_outfit: t.string().default(''),
  }
);

/** Private — secrets used only inside generate_scene procedure prompts. */
const characterSecret = table(
  { name: 'character_secret' },
  {
    char_id: t.u64().primaryKey(),
    session_id: t.u64().index('btree'),
    secret: t.string(),
  }
);

const coDirector = table(
  { name: 'co_director', public: true },
  {
    co_director_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    display_name: t.string(),
    joined_at: t.u64(),
  }
);

const memory = table(
  { name: 'memory', public: true },
  {
    memory_id: t.u64().primaryKey().autoInc(),
    char_id: t.u64().index('btree'),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    panel_num: t.u32(),
    event_text: t.string(),
  }
);

const narrativeDirective = table(
  {
    name: 'narrative_directive',
    public: true,
    indexes: [
      {
        accessor: 'session_scene',
        algorithm: 'btree',
        columns: ['session_id', 'applied_at_scene'] as const,
      },
    ],
  },
  {
    directive_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    type: t.string(),
    content: t.string(),
    applied_at_scene: t.u32(),
    applied_by: t.string(),
  }
);

const scene = table(
  {
    name: 'scene',
    public: true,
    indexes: [
      {
        accessor: 'session_scene',
        algorithm: 'btree',
        columns: ['session_id', 'scene_num'] as const,
      },
    ],
  },
  {
    scene_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    title: t.string(),
    status: t.string(),
    created_at: t.u64(),
    scene_summary: t.string().default(''),
    page_image_url: t.string().default(''),
    narration_audio_url: t.string().default(''),
    narration_segments_json: t.string().default(''),
    narration_status: t.string().default(''),
    current_generation_id: t.u64().default(0n),
  }
);

const panel = table(
  {
    name: 'panel',
    public: true,
    indexes: [
      {
        accessor: 'session_scene',
        algorithm: 'btree',
        columns: ['session_id', 'scene_num'] as const,
      },
    ],
  },
  {
    panel_id: t.u64().primaryKey().autoInc(),
    scene_id: t.u64().index('btree'),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    panel_num: t.u32(),
    caption: t.string(),
    speaker: t.string(),
    dialogue: t.string(),
    image_prompt: t.string(),
    image_url: t.string(),
    layout_hint: t.string(),
    status: t.string(),
  }
);

/** Server-authored pipeline events — subscribed by the activity trail UI. */
const activityEvent = table(
  { name: 'activity_event', public: true },
  {
    event_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    kind: t.string(),
    label: t.string(),
    detail: t.string(),
    done: t.bool(),
    active: t.bool(),
    created_at: t.u64(),
    generation_id: t.u64().default(0n),
  }
);

/** Immutable archive of scene generations — supports preview and restore. */
const sceneGeneration = table(
  {
    name: 'scene_generation',
    public: true,
    indexes: [
      {
        accessor: 'session_scene',
        algorithm: 'btree',
        columns: ['session_id', 'scene_num'] as const,
      },
    ],
  },
  {
    generation_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    source_scene_id: t.u64(),
    generation_num: t.u32(),
    kind: t.string(),
    reason: t.string().default(''),
    title: t.string(),
    scene_summary: t.string().default(''),
    page_image_url: t.string().default(''),
    narration_audio_url: t.string().default(''),
    narration_segments_json: t.string().default(''),
    narration_status: t.string().default(''),
    panels_json: t.string().default('[]'),
    status: t.string(),
    is_current: t.bool().default(false),
    created_at: t.u64(),
    superseded_at: t.u64().default(0n),
  }
);

const pendingNudge = table(
  { name: 'pending_nudge', public: true },
  {
    session_id: t.u64().primaryKey(),
    target_scene: t.u32(),
    type: t.string(),
    content: t.string(),
    submitted_by: t.identity(),
    submitted_by_name: t.string(),
    submitted_at: t.u64(),
  }
);

const nudgeEvent = table(
  { name: 'nudge_event', public: true },
  {
    event_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    target_scene: t.u32(),
    kind: t.string(),
    type: t.string(),
    content: t.string(),
    actor_name: t.string(),
    detail: t.string(),
    created_at: t.u64(),
  }
);

const directorPresence = table(
  { name: 'director_presence', public: true },
  {
    identity: t.identity().primaryKey(),
    display_name: t.string(),
    online: t.bool(),
    last_seen_at: t.u64(),
  }
);

const panelRetryQueue = table(
  {
    name: 'panel_retry_queue',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scheduled: (): any => retry_panel_image,
  },
  {
    retry_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
    session_id: t.u64().index('btree'),
    scene_id: t.u64().index('btree'),
    panel_id: t.u64().index('btree'),
    scene_num: t.u32(),
    panel_num: t.u32(),
    attempt: t.u32(),
    last_error: t.string(),
  }
);

const scenePendingFinalize = table(
  { name: 'scene_pending_finalize' },
  {
    scene_id: t.u64().primaryKey(),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    mood_updates_json: t.string(),
    memories_json: t.string(),
    visual_context_json: t.string().default(''),
  }
);

const spacetimedb = schema({
  session,
  character,
  characterSecret,
  coDirector,
  memory,
  narrativeDirective,
  scene,
  panel,
  activityEvent,
  pendingNudge,
  nudgeEvent,
  directorPresence,
  panelRetryQueue,
  scenePendingFinalize,
  sceneGeneration,
});
export default spacetimedb;

function timestampMicros(ctx: { timestamp: { microsSinceUnixEpoch: bigint } }): bigint {
  return ctx.timestamp.microsSinceUnixEpoch;
}

function validateCharacterInput(
  characters: { name: string; archetype: string }[]
): void {
  if (characters.length < 2 || characters.length > 4) {
    throw new SenderError('Sessions require 2–4 characters');
  }
  for (let i = 0; i < characters.length; i++) {
    const name = characters[i]!.name.trim();
    const archetype = characters[i]!.archetype.trim();
    if (!name) {
      throw new SenderError(`Character ${i + 1} needs a name`);
    }
    if (!archetype) {
      throw new SenderError(`Character ${i + 1} needs a role`);
    }
  }
}

function insertSessionWithCharacters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  {
    genre,
    setting,
    totalScenes,
    characters,
  }: {
    genre: string;
    setting: string;
    totalScenes: number;
    characters: {
      name: string;
      archetype: string;
      personality: string;
      current_mood: string;
      secret: string;
      visual_description?: string;
    }[];
  }
) {
  const style_bible = buildStyleBible(genre, setting);
  const inserted = tx.db.session.insert({
    session_id: 0n,
    owner_identity: ctx.sender,
    invite_code: generateInviteCode(ctx),
    genre,
    setting,
    style_bible,
    total_scenes: totalScenes,
    current_scene: 1,
    generating_scene: 0,
    status: 'setup',
    created_at: timestampMicros(tx),
    root_session_id: 0n,
    parent_session_id: 0n,
    fork_scene_num: 0,
    fork_generation_id: 0n,
    branch_label: '',
    forked_at: 0n,
  });

  tx.db.session.session_id.update({
    ...inserted,
    root_session_id: inserted.session_id,
  });
  const sessionRow = tx.db.session.session_id.find(inserted.session_id)!;

  for (const c of characters) {
    const charRow = tx.db.character.insert({
      char_id: 0n,
      session_id: sessionRow.session_id,
      name: c.name.trim(),
      archetype: c.archetype.trim(),
      personality: c.personality.trim(),
      current_mood: c.current_mood?.trim() || 'neutral',
      visual_description:
        c.visual_description?.trim() ||
        `Human adult, ink cartoon style, dressed fitting their role as ${c.archetype.trim() || 'story character'}`,
      current_outfit: '',
    });
    tx.db.characterSecret.insert({
      char_id: charRow.char_id,
      session_id: sessionRow.session_id,
      secret: c.secret?.trim() ?? '',
    });
  }

  return sessionRow;
}

export const create_session = spacetimedb.reducer(
  {
    genre: t.string(),
    setting: t.string(),
    totalScenes: t.u32(),
    characters: t.array(CharacterInput),
  },
  (ctx, { genre, setting, totalScenes, characters }) => {
    validateCharacterInput(characters);
    if (!setting.trim()) {
      throw new SenderError('Setting is required');
    }

    const inserted = insertSessionWithCharacters(ctx, ctx, {
      genre,
      setting: setting.trim(),
      totalScenes,
      characters,
    });

    logActivity(
      ctx,
      inserted.session_id,
      1,
      'session_created',
      'create_session reducer',
      `${genre} · ${characters.length} characters · owner=${ctx.sender.toHexString().slice(0, 8)}…`,
      { done: true }
    );
  }
);

export const submit_nudge = spacetimedb.reducer(
  {
    sessionId: t.u64(),
    type: t.string(),
    content: t.string(),
  },
  (ctx, { sessionId, type, content }) => {
    const sessionRow = assertSessionDirector(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender,
      ctx.db
    );
    assertCurrentSceneComplete(ctx, sessionId, sessionRow.current_scene);

    if (sessionRow.current_scene >= sessionRow.total_scenes) {
      throw new SenderError(
        'NUDGE_BLOCKED:COMPLETE|Story is complete — no more scenes to nudge'
      );
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new SenderError('Nudge content required');
    }

    const targetScene = targetSceneForNudge(sessionRow);
    const displayName = directorDisplayName(ctx, ctx.sender);
    upsertPendingNudge(
      ctx,
      sessionId,
      targetScene,
      ctx.sender,
      type || 'custom',
      trimmed,
      displayName
    );
  }
);

export const apply_nudge = spacetimedb.reducer(
  {
    sessionId: t.u64(),
    type: t.string(),
    content: t.string(),
  },
  (_ctx, _args) => {
    throw new SenderError(
      'Use submit_nudge or advance_and_generate — apply_nudge is deprecated'
    );
  }
);

export const advance_scene = spacetimedb.reducer(
  { sessionId: t.u64() },
  (_ctx, _args) => {
    throw new SenderError(
      'Use advance_and_generate — advance_scene is deprecated'
    );
  }
);

export const update_character_mood = spacetimedb.reducer(
  { charId: t.u64(), newMood: t.string() },
  (ctx, { charId, newMood }) => {
    const row = ctx.db.character.char_id.find(charId);
    if (!row) {
      throw new SenderError('Character not found');
    }
    assertSessionDirector(
      ctx.db.session.session_id.find(row.session_id),
      ctx.sender,
      ctx.db
    );
    ctx.db.character.char_id.update({ ...row, current_mood: newMood });
  }
);

export const append_memory = spacetimedb.reducer(
  {
    charId: t.u64(),
    sessionId: t.u64(),
    sceneNum: t.u32(),
    panelNum: t.u32(),
    eventText: t.string(),
  },
  (ctx, { charId, sessionId, sceneNum, panelNum, eventText }) => {
    assertSessionDirector(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender,
      ctx.db
    );
    ctx.db.memory.insert({
      memory_id: 0n,
      char_id: charId,
      session_id: sessionId,
      scene_num: sceneNum,
      panel_num: panelNum,
      event_text: eventText,
    });
  }
);

export const join_session = spacetimedb.reducer(
  { sessionId: t.u64(), inviteCode: t.string() },
  (ctx, { sessionId, inviteCode }) => {
    const sessionRow = ctx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }
    if (sessionRow.status === 'done') {
      throw new SenderError('Story is complete');
    }

    if (!isSessionOwner(sessionRow, ctx.sender)) {
      const existing = findCoDirectorRow(ctx.db, sessionId, ctx.sender);
      if (existing) {
        return;
      }
      if (!inviteCodesMatch(sessionRow.invite_code, inviteCode)) {
        throw new SenderError('Invalid invite code');
      }
      ctx.db.coDirector.insert({
        co_director_id: 0n,
        session_id: sessionId,
        identity: ctx.sender,
        display_name: directorDisplayName(ctx, ctx.sender),
        joined_at: timestampMicros(ctx),
      });
      logActivity(
        ctx,
        sessionId,
        sessionRow.current_scene,
        'co_director_joined',
        'join_session · co-director joined',
        directorDisplayName(ctx, ctx.sender),
        { done: true }
      );
    }
  }
);

export const leave_session = spacetimedb.reducer(
  { sessionId: t.u64() },
  (ctx, { sessionId }) => {
    const sessionRow = ctx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }
    if (isSessionOwner(sessionRow, ctx.sender)) {
      throw new SenderError('Owner cannot leave — transfer or end the story');
    }
    const row = findCoDirectorRow(ctx.db, sessionId, ctx.sender);
    if (!row) {
      return;
    }
    ctx.db.coDirector.delete(row);
    logActivity(
      ctx,
      sessionId,
      sessionRow.current_scene,
      'co_director_left',
      'leave_session · co-director left',
      directorDisplayName(ctx, ctx.sender),
      { done: true }
    );
  }
);

export const revoke_co_director = spacetimedb.reducer(
  { sessionId: t.u64(), targetIdentityHex: t.string() },
  (ctx, { sessionId, targetIdentityHex }) => {
    const sessionRow = assertSessionOwner(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender
    );
    for (const row of ctx.db.coDirector.session_id.filter(sessionId)) {
      if (row.identity.toHexString() === targetIdentityHex) {
        ctx.db.coDirector.delete(row);
        logActivity(
          ctx,
          sessionId,
          sessionRow.current_scene,
          'co_director_revoked',
          'revoke_co_director',
          row.display_name || targetIdentityHex.slice(0, 8),
          { done: true }
        );
        return;
      }
    }
    throw new SenderError('Co-director not found');
  }
);

export const set_display_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) {
      throw new SenderError('Display name required');
    }
    const presence = ctx.db.directorPresence.identity.find(ctx.sender);
    if (presence) {
      ctx.db.directorPresence.identity.update({
        ...presence,
        display_name: trimmed,
      });
    }
    for (const row of ctx.db.coDirector.identity.filter(ctx.sender)) {
      ctx.db.coDirector.co_director_id.update({
        ...row,
        display_name: trimmed,
      });
    }
  }
);

export const regenerate_invite_code = spacetimedb.reducer(
  { sessionId: t.u64() },
  (ctx, { sessionId }) => {
    const sessionRow = assertSessionOwner(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender
    );
    ctx.db.session.session_id.update({
      ...sessionRow,
      invite_code: generateInviteCode(ctx),
    });
  }
);

export const retry_page_now = spacetimedb.procedure(
  { sessionId: t.u64(), sceneId: t.u64() },
  t.unit(),
  (ctx, { sessionId, sceneId }) => {
    const sceneNum = ctx.withTx(tx => {
      assertSessionDirector(
        tx.db.session.session_id.find(sessionId) ?? null,
        ctx.sender,
        tx.db
      );

      const sceneRow = tx.db.scene.scene_id.find(sceneId);
      if (!sceneRow || sceneRow.session_id !== sessionId) {
        throw new SenderError('Scene not found');
      }
      if (sceneRow.status !== 'error' && sceneRow.status !== 'generating') {
        throw new SenderError('Scene is not in error or generating state');
      }
      if (sceneRow.status === 'generating' && sceneRow.page_image_url?.trim()) {
        throw new SenderError('Scene page is already drawn');
      }
      if (isPageImageInFlight(tx, sessionId, sceneRow.scene_num)) {
        throw new SenderError('Page image is already being generated');
      }

      const now = tx.timestamp.microsSinceUnixEpoch;
      const cooldownMicros = 15_000_000n;
      const recentRetry = [...tx.db.activityEvent.session_id.filter(sessionId)]
        .filter(
          (e: { scene_num: number; kind: string; created_at: bigint }) =>
            e.scene_num === sceneRow.scene_num &&
            e.kind === 'page_retry_requested'
        )
        .sort(
          (a: { created_at: bigint }, b: { created_at: bigint }) =>
            Number(b.created_at - a.created_at)
        )[0];
      if (
        recentRetry &&
        now - recentRetry.created_at < cooldownMicros
      ) {
        throw new SenderError('Please wait a few seconds before retrying again');
      }

      pruneSceneGenerationHistory(tx, sessionId, sceneRow.scene_num);

      tx.db.scene.scene_id.update({ ...sceneRow, status: 'generating' });

      logActivity(
        tx,
        sessionId,
        sceneRow.scene_num,
        'page_retry_requested',
        'page image · manual retry',
        directorDisplayName(tx, ctx.sender),
        { done: true }
      );

      return sceneRow.scene_num;
    });

    runRetryPageImage(ctx, sessionId, sceneId, sceneNum);
    return {};
  }
);

export const fork_story_at_scene = spacetimedb.reducer(
  {
    sessionId: t.u64(),
    sceneNum: t.u32(),
    generationId: t.u64(),
    branchLabel: t.string(),
  },
  (ctx, { sessionId, sceneNum, generationId, branchLabel }) => {
    assertSessionDirector(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender,
      ctx.db
    );

    forkStoryAtScene(
      ctx,
      ctx,
      sessionId,
      sceneNum,
      generationId,
      branchLabel,
      directorDisplayName(ctx, ctx.sender)
    );
  }
);

/** Fork a timeline and return the new session id (preferred client entry point). */
export const fork_story_branch = spacetimedb.procedure(
  {
    sessionId: t.u64(),
    sceneNum: t.u32(),
    generationId: t.u64(),
    branchLabel: t.string(),
  },
  t.u64(),
  (ctx, { sessionId, sceneNum, generationId, branchLabel }) => {
    return ctx.withTx(tx => {
      assertSessionDirector(
        tx.db.session.session_id.find(sessionId) ?? null,
        ctx.sender,
        tx.db
      );
      return forkStoryAtScene(
        tx,
        ctx,
        sessionId,
        sceneNum,
        generationId,
        branchLabel,
        directorDisplayName(tx, ctx.sender)
      );
    });
  }
);

export const restore_generation = spacetimedb.reducer(
  { sessionId: t.u64(), generationId: t.u64() },
  (ctx, { sessionId, generationId }) => {
    assertSessionDirector(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender,
      ctx.db
    );

    restoreGeneration(
      ctx,
      sessionId,
      generationId,
      directorDisplayName(ctx, ctx.sender)
    );
  }
);

export const retry_panel_now = spacetimedb.reducer(
  { sessionId: t.u64(), panelId: t.u64() },
  (ctx, { sessionId, panelId }) => {
    const sessionRow = assertSessionDirector(
      ctx.db.session.session_id.find(sessionId) ?? null,
      ctx.sender,
      ctx.db
    );
    void sessionRow;

    const panelRow = ctx.db.panel.panel_id.find(panelId);
    if (!panelRow || panelRow.session_id !== sessionId) {
      throw new SenderError('Panel not found');
    }
    if (panelRow.status !== 'error') {
      throw new SenderError('Panel is not in error state');
    }

    cancelPanelRetriesForPanel(ctx, panelId);

    logActivity(
      ctx,
      sessionId,
      panelRow.scene_num,
      'panel_retry_requested',
      `panel #${String(panelRow.panel_num).padStart(2, '0')} · manual retry`,
      directorDisplayName(ctx, ctx.sender),
      { done: true }
    );

    ctx.db.panel.panel_id.update({ ...panelRow, status: 'generating' });

    enqueuePanelRetry(ctx, {
      sessionId,
      sceneId: panelRow.scene_id,
      panelId,
      sceneNum: panelRow.scene_num,
      panelNum: panelRow.panel_num,
      attempt: 1,
      lastError: 'Manual retry requested',
      delayMicros: 0n,
    });
  }
);

/** Create a story and generate scene 1 — single module entry point. */
export const start_story = spacetimedb.procedure(
  {
    genre: t.string(),
    setting: t.string(),
    totalScenes: t.u32(),
    characters: t.array(CharacterInput),
  },
  t.u64(),
  (ctx, { genre, setting, totalScenes, characters }) => {
    validateCharacterInput(characters);
    if (!setting.trim()) {
      throw new SenderError('Setting is required');
    }

    const sessionId = ctx.withTx(tx => {
      const inserted = insertSessionWithCharacters(ctx, tx, {
        genre,
        setting: setting.trim(),
        totalScenes,
        characters,
      });

      logActivity(
        tx,
        inserted.session_id,
        1,
        'session_created',
        'start_story procedure · session created',
        `${genre} · ${characters.length} characters`,
        { done: true }
      );

      claimGenerationLock(tx, inserted, 1);
      tx.db.scene.insert({
        scene_id: 0n,
        session_id: inserted.session_id,
        scene_num: 1,
        title: '',
        scene_summary: '',
        page_image_url: '',
        narration_audio_url: '',
        narration_segments_json: '',
        narration_status: '',
        current_generation_id: 0n,
        status: 'generating',
        created_at: timestampMicros(tx),
      });
      tx.db.session.session_id.update({
        ...inserted,
        generating_scene: 1,
        status: 'running',
      });

      return inserted.session_id;
    });

    runGenerateScene(ctx, sessionId, 1);
    return sessionId;
  }
);

/** Advance to the next scene and generate it — optional nudge in one atomic workflow. */
export const advance_and_generate = spacetimedb.procedure(
  {
    sessionId: t.u64(),
    nudgeType: t.string(),
    nudgeContent: t.string(),
  },
  t.unit(),
  (ctx, { sessionId, nudgeType, nudgeContent }) => {
    const inlineTrimmed = nudgeContent.trim();
    let nextScene: number;
    let displayName = '';

    try {
      nextScene = ctx.withTx(tx => {
        displayName = directorDisplayName(tx, ctx.sender);
        const sessionRow = assertSessionDirector(
          tx.db.session.session_id.find(sessionId) ?? null,
          ctx.sender,
          tx.db
        );
        assertCurrentSceneComplete(tx, sessionId, sessionRow.current_scene);

        if (sessionRow.current_scene >= sessionRow.total_scenes) {
          throw new SenderError(
            'NUDGE_BLOCKED:COMPLETE|Story is complete'
          );
        }

        const next = targetSceneForNudge(sessionRow);
        claimGenerationLock(tx, sessionRow, next);

        const inlineUsed = inlineTrimmed.length > 0;
        const directive = resolveAdvanceNudge(
          tx,
          sessionId,
          next,
          nudgeType,
          nudgeContent,
          ctx.sender,
          displayName
        );

        if (directive) {
          replaceDirectiveForScene(tx, sessionId, next, directive);
          logActivity(
            tx,
            sessionId,
            next,
            'nudge_applied',
            'advance_and_generate · narrative_directive applied',
            `${directive.appliedBy} · [${directive.type}] ${directive.content.slice(0, 80)}`,
            { done: true }
          );
        }

        consumePendingNudge(tx, sessionId, next, directive, inlineUsed);

        tx.db.scene.insert({
          scene_id: 0n,
          session_id: sessionId,
          scene_num: next,
          title: '',
          scene_summary: '',
          page_image_url: '',
          narration_audio_url: '',
          narration_segments_json: '',
          narration_status: '',
          current_generation_id: 0n,
          status: 'generating',
          created_at: timestampMicros(tx),
        });

        tx.db.session.session_id.update({
          ...sessionRow,
          current_scene: next,
          generating_scene: next,
          status: sessionRow.status === 'setup' ? 'running' : sessionRow.status,
        });

        logActivity(
          tx,
          sessionId,
          next,
          'scene_advanced',
          'advance_and_generate · scene advanced',
          `current_scene=${next}`,
          { done: true }
        );

        return next;
      });
    } catch (err) {
      const msg = String(err);
      const isRace =
        msg.includes('NUDGE_LOST:GENERATING') ||
        msg.includes('just advanced') ||
        msg.includes('still generating');
      if (isRace && inlineTrimmed.length > 0) {
        ctx.withTx(tx => {
          const raceDisplayName =
            displayName || directorDisplayName(tx, ctx.sender);
          const sessionRow = tx.db.session.session_id.find(sessionId);
          if (sessionRow) {
            queuePendingOnRace(
              tx,
              sessionId,
              targetSceneForNudge(sessionRow),
              ctx.sender,
              nudgeType || 'custom',
              inlineTrimmed,
              raceDisplayName
            );
          }
        });
      }
      if (isRace) {
        throw new SenderError(
          'NUDGE_LOST:RACE|Another director just advanced'
        );
      }
      throw err;
    }

    runGenerateScene(ctx, sessionId, nextScene);
    return {};
  }
);

export const generate_scene = spacetimedb.procedure(
  { sessionId: t.u64(), sceneNum: t.u32() },
  t.unit(),
  (ctx, { sessionId, sceneNum }) => {
    ctx.withTx(tx => {
      assertGenerateSceneAllowed(tx, sessionId, sceneNum);
    });
    runGenerateScene(ctx, sessionId, sceneNum);
    return {};
  }
);

/** Continue or recover in-flight generation — safe to call after reconnect. */
export const resume_generation = spacetimedb.procedure(
  { sessionId: t.u64() },
  t.unit(),
  (ctx, { sessionId }) => {
    const plan = ctx.withTx(tx => {
      assertSessionDirector(
        tx.db.session.session_id.find(sessionId) ?? null,
        ctx.sender,
        tx.db
      );
      return planGenerationResume(tx, sessionId);
    });

    logGenerationResume(ctx, sessionId, plan);

    if (plan.action === 'full') {
      runGenerateScene(ctx, sessionId, plan.sceneNum);
    } else if (plan.action === 'page_only') {
      const pageOk = runPageImageGeneration(
        ctx,
        sessionId,
        plan.sceneId,
        plan.sceneNum,
        'resume_generation'
      );
      if (pageOk) {
        const title = ctx.withTx(tx => {
          const row = tx.db.scene.scene_id.find(plan.sceneId);
          return row?.title ?? '';
        });
        runSceneNarration(
          ctx,
          sessionId,
          plan.sceneId,
          plan.sceneNum,
          title,
          'resume_generation'
        );
      }
    } else if (plan.action === 'page_retry') {
      runRetryPageImage(ctx, sessionId, plan.sceneId, plan.sceneNum);
    }

    return {};
  }
);

/** Regenerate TTS for a completed scene (e.g. after fork copies visuals without audio). */
export const regenerate_scene_narration = spacetimedb.procedure(
  { sessionId: t.u64(), sceneNum: t.u32() },
  t.unit(),
  (ctx, { sessionId, sceneNum }) => {
    const sceneMeta = ctx.withTx(tx => {
      assertSessionDirector(
        tx.db.session.session_id.find(sessionId) ?? null,
        ctx.sender,
        tx.db
      );
      const scenes = [...tx.db.scene.session_id.filter(sessionId)];
      const canonical = pickCanonicalScene(scenes, sceneNum);
      if (!canonical) {
        throw new SenderError(`Scene ${sceneNum} not found`);
      }
      if (canonical.status !== 'done') {
        throw new SenderError(`Scene ${sceneNum} is not ready for narration`);
      }
      return { sceneId: canonical.scene_id, title: canonical.title ?? '' };
    });

    runSceneNarration(
      ctx,
      sessionId,
      sceneMeta.sceneId,
      sceneNum,
      sceneMeta.title,
      'regenerate_narration'
    );

    return {};
  }
);

export const retry_panel_image = spacetimedb.procedure(
  { arg: panelRetryQueue.rowType },
  t.unit(),
  (ctx, { arg }) => {
    assertSchedulerCaller(ctx);
    runRetryPanelImage(ctx, arg);
    return {};
  }
);

/** Public view — only sessions owned by the connected director. */
export const my_sessions = spacetimedb.view(
  { name: 'my_sessions', public: true },
  t.array(session.rowType),
  ctx => [...ctx.db.session.owner_identity.filter(ctx.sender)]
);

/** Sessions the connected director owns or co-directs. */
export const accessible_sessions = spacetimedb.view(
  { name: 'accessible_sessions', public: true },
  t.array(session.rowType),
  ctx => {
    const owned = [...ctx.db.session.owner_identity.filter(ctx.sender)];
    const coRows = [...ctx.db.coDirector.identity.filter(ctx.sender)];
    const coSessions = coRows
      .map(r => ctx.db.session.session_id.find(r.session_id))
      .filter((s): s is NonNullable<typeof s> => s != null);

    const seen = new Set<string>();
    const result = [];
    for (const row of [...owned, ...coSessions]) {
      const key = row.session_id.toString();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      }
    }
    return result;
  }
);

/** Story summaries for every session the director can access — resume from DB. */
export const story_library = spacetimedb.view(
  { name: 'story_library', public: true },
  t.array(StoryLibraryEntry),
  ctx => buildStoryLibrary(ctx)
);

/** Branch lineage for accessible sessions — filter client-side by root_session_id. */
export const story_branches = spacetimedb.view(
  { name: 'story_branches', public: true },
  t.array(StoryBranchEntry),
  ctx => buildStoryBranches(ctx)
);

export const init = spacetimedb.init(_ctx => {});

spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.directorPresence.identity.find(ctx.sender);
  if (existing) {
    ctx.db.directorPresence.identity.update({
      ...existing,
      online: true,
      last_seen_at: timestampMicros(ctx),
    });
  } else {
    ctx.db.directorPresence.insert({
      identity: ctx.sender,
      display_name: ctx.sender.toHexString().slice(0, 8),
      online: true,
      last_seen_at: timestampMicros(ctx),
    });
  }
});

spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.directorPresence.identity.find(ctx.sender);
  if (existing) {
    ctx.db.directorPresence.identity.update({
      ...existing,
      online: false,
      last_seen_at: timestampMicros(ctx),
    });
  }
});
