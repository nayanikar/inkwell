import { SenderError, type Random } from 'spacetimedb/server';
import { logActivity } from './activityLog.js';
import {
  assertSessionDirector,
  pickCanonicalScene,
  generateInviteCode,
} from './sessionGuards.js';
import {
  panelsFromJson,
  nextGenerationNum,
  supersedeAllCurrentForAct,
} from './generationArchive.js';
import {
  effectiveRootSessionId,
  getForkPreconditionError,
} from './storyForkValidation.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

type ForkCtx = {
  sender: { toHexString(): string };
  timestamp: { microsSinceUnixEpoch: bigint };
  random: Random;
};

function effectiveRootId(sessionRow: AnyTx): bigint {
  return effectiveRootSessionId(sessionRow);
}

function timestampMicros(tx: AnyTx): bigint {
  return tx.timestamp.microsSinceUnixEpoch;
}

export function validateForkPreconditions(
  tx: AnyTx,
  sessionId: bigint,
  sceneNum: number,
  generationId: bigint
): void {
  const error = getForkPreconditionError(tx, sessionId, sceneNum, generationId);
  if (error) {
    throw new SenderError(error);
  }
}

function copyCharacters(
  tx: AnyTx,
  oldSessionId: bigint,
  newSessionId: bigint
): Map<string, bigint> {
  const charMap = new Map<string, bigint>();
  const characters = [...tx.db.character.session_id.filter(oldSessionId)];

  for (const c of characters) {
    const newChar = tx.db.character.insert({
      char_id: 0n,
      session_id: newSessionId,
      name: c.name,
      archetype: c.archetype,
      personality: c.personality,
      current_mood: c.current_mood,
      visual_description: c.visual_description ?? '',
      reference_image_url: c.reference_image_url ?? '',
    });
    charMap.set(c.char_id.toString(), newChar.char_id);

    const secret = tx.db.characterSecret.char_id.find(c.char_id);
    if (secret) {
      tx.db.characterSecret.insert({
        char_id: newChar.char_id,
        session_id: newSessionId,
        secret: secret.secret,
      });
    }
  }

  return charMap;
}

function copyMemories(
  tx: AnyTx,
  oldSessionId: bigint,
  newSessionId: bigint,
  charMap: Map<string, bigint>,
  maxSceneNum: number
): void {
  for (const mem of [...tx.db.memory.session_id.filter(oldSessionId)]) {
    if (mem.scene_num > maxSceneNum) continue;
    const newCharId = charMap.get(mem.char_id.toString());
    if (!newCharId) continue;
    tx.db.memory.insert({
      memory_id: 0n,
      char_id: newCharId,
      session_id: newSessionId,
      scene_num: mem.scene_num,
      panel_num: mem.panel_num,
      event_text: mem.event_text,
    });
  }
}

const EMPTY_NARRATION = {
  narration_audio_url: '',
  narration_segments_json: '',
  narration_status: '',
};

function copySceneAndPanels(
  tx: AnyTx,
  oldScene: AnyTx,
  newSessionId: bigint
): bigint {
  const newScene = tx.db.scene.insert({
    scene_id: 0n,
    session_id: newSessionId,
    scene_num: oldScene.scene_num,
    title: oldScene.title,
    scene_summary: oldScene.scene_summary ?? '',
    page_image_url: oldScene.page_image_url ?? '',
    ...EMPTY_NARRATION,
    current_generation_id: 0n,
    status: 'done',
    created_at: oldScene.created_at,
  });

  for (const panel of [...tx.db.panel.scene_id.filter(oldScene.scene_id)]) {
    tx.db.panel.insert({
      panel_id: 0n,
      scene_id: newScene.scene_id,
      session_id: newSessionId,
      scene_num: panel.scene_num,
      panel_num: panel.panel_num,
      caption: panel.caption,
      speaker: panel.speaker,
      dialogue: panel.dialogue,
      image_prompt: panel.image_prompt,
      image_url: panel.image_url ?? '',
      layout_hint: panel.layout_hint,
      status: panel.status === 'generating' ? 'done' : panel.status,
    });
  }

  return newScene.scene_id;
}

function copySceneGenerations(
  tx: AnyTx,
  oldSessionId: bigint,
  newSessionId: bigint,
  sceneIdByNum: Map<number, bigint>,
  maxSceneNum: number
): Map<string, bigint> {
  const genMap = new Map<string, bigint>();
  const gens = [...tx.db.sceneGeneration.session_id.filter(oldSessionId)]
    .filter((g: AnyTx) => g.scene_num <= maxSceneNum)
    .sort(
      (a: AnyTx, b: AnyTx) =>
        a.scene_num - b.scene_num || a.generation_num - b.generation_num
    );

  for (const gen of gens) {
    const newSceneId = sceneIdByNum.get(gen.scene_num);
    if (!newSceneId) continue;

    const inserted = tx.db.sceneGeneration.insert({
      generation_id: 0n,
      session_id: newSessionId,
      scene_num: gen.scene_num,
      source_scene_id: newSceneId,
      generation_num: gen.generation_num,
      kind: gen.kind,
      reason: gen.reason ?? '',
      title: gen.title,
      scene_summary: gen.scene_summary ?? '',
      page_image_url: gen.page_image_url ?? '',
      ...EMPTY_NARRATION,
      panels_json: gen.panels_json ?? '[]',
      status: gen.status,
      is_current: gen.is_current,
      created_at: gen.created_at,
      superseded_at: gen.superseded_at ?? 0n,
    });
    genMap.set(gen.generation_id.toString(), inserted.generation_id);

    if (gen.is_current) {
      const sceneRow = tx.db.scene.scene_id.find(newSceneId);
      if (sceneRow) {
        tx.db.scene.scene_id.update({
          ...sceneRow,
          current_generation_id: inserted.generation_id,
        });
      }
    }
  }

  return genMap;
}

function applyGenerationSnapshot(
  tx: AnyTx,
  newSessionId: bigint,
  newSceneId: bigint,
  sceneNum: number,
  sourceGen: AnyTx
): bigint {
  const sceneRow = tx.db.scene.scene_id.find(newSceneId);
  if (!sceneRow) {
    throw new SenderError('Fork scene not found');
  }

  supersedeAllCurrentForAct(tx, newSessionId, sceneNum);

  tx.db.scene.scene_id.update({
    ...sceneRow,
    title: sourceGen.title,
    scene_summary: sourceGen.scene_summary ?? '',
    page_image_url: sourceGen.page_image_url ?? '',
    ...EMPTY_NARRATION,
    status: 'done',
  });

  panelsFromJson(
    tx,
    newSceneId,
    newSessionId,
    sceneNum,
    sourceGen.panels_json ?? '[]'
  );

  const now = timestampMicros(tx);
  const generationNum = nextGenerationNum(tx, newSessionId, sceneNum);
  const forkGen = tx.db.sceneGeneration.insert({
    generation_id: 0n,
    session_id: newSessionId,
    scene_num: sceneNum,
    source_scene_id: newSceneId,
    generation_num: generationNum,
    kind: 'fork_origin',
    reason: `Forked from v${sourceGen.generation_num}`,
    title: sourceGen.title,
    scene_summary: sourceGen.scene_summary ?? '',
    page_image_url: sourceGen.page_image_url ?? '',
    ...EMPTY_NARRATION,
    panels_json: sourceGen.panels_json ?? '[]',
    status: 'done',
    is_current: true,
    created_at: now,
    superseded_at: 0n,
  });

  tx.db.scene.scene_id.update({
    ...tx.db.scene.scene_id.find(newSceneId)!,
    current_generation_id: forkGen.generation_id,
  });

  return forkGen.generation_id;
}

function copyCoDirectors(
  tx: AnyTx,
  oldSessionId: bigint,
  newSessionId: bigint
): void {
  for (const co of [...tx.db.coDirector.session_id.filter(oldSessionId)]) {
    tx.db.coDirector.insert({
      co_director_id: 0n,
      session_id: newSessionId,
      identity: co.identity,
      display_name: co.display_name,
      joined_at: co.joined_at,
    });
  }
}

export function copySessionFork(
  tx: AnyTx,
  ctx: ForkCtx,
  sessionId: bigint,
  sceneNum: number,
  generationId: bigint,
  branchLabel: string
): bigint {
  validateForkPreconditions(tx, sessionId, sceneNum, generationId);

  const parentSession = tx.db.session.session_id.find(sessionId)!;
  const rootId = effectiveRootId(parentSession);
  const now = timestampMicros(tx);
  const label =
    branchLabel.trim() ||
    `Fork at Scene ${sceneNum}`;

  const newSession = tx.db.session.insert({
    session_id: 0n,
    owner_identity: parentSession.owner_identity,
    invite_code: generateInviteCode(ctx),
    genre: parentSession.genre,
    setting: parentSession.setting,
    style_bible: parentSession.style_bible,
    total_scenes: parentSession.total_scenes,
    current_scene: sceneNum,
    generating_scene: 0,
    status: 'running',
    created_at: now,
    root_session_id: rootId,
    parent_session_id: sessionId,
    fork_scene_num: sceneNum,
    fork_generation_id: generationId,
    branch_label: label,
    forked_at: now,
  });

  const newSessionId = newSession.session_id;
  const charMap = copyCharacters(tx, sessionId, newSessionId);
  copyMemories(tx, sessionId, newSessionId, charMap, sceneNum);

  const parentScenes = [...tx.db.scene.session_id.filter(sessionId)];
  const sceneIdByNum = new Map<number, bigint>();

  for (let s = 1; s <= sceneNum; s++) {
    const canonical = pickCanonicalScene(parentScenes, s);
    if (!canonical) {
      throw new SenderError(`Missing scene ${s} for fork`);
    }
    const newSceneId = copySceneAndPanels(tx, canonical, newSessionId);
    sceneIdByNum.set(s, newSceneId);
  }

  copySceneGenerations(tx, sessionId, newSessionId, sceneIdByNum, sceneNum);

  let appliedGenId = generationId;
  if (generationId !== 0n) {
    const sourceGen = tx.db.sceneGeneration.generation_id.find(generationId)!;
    const newSceneId = sceneIdByNum.get(sceneNum)!;
    appliedGenId = applyGenerationSnapshot(
      tx,
      newSessionId,
      newSceneId,
      sceneNum,
      sourceGen
    );
    tx.db.session.session_id.update({
      ...tx.db.session.session_id.find(newSessionId)!,
      fork_generation_id: appliedGenId,
    });
  }

  copyCoDirectors(tx, sessionId, newSessionId);

  logActivity(
    tx,
    sessionId,
    sceneNum,
    'story_fork_created',
    'Story fork created',
    `new session ${newSessionId.toString()} · ${label}`,
    { done: true }
  );

  logActivity(
    tx,
    newSessionId,
    sceneNum,
    'story_fork_created',
    'Story fork started',
    `forked from session ${sessionId.toString()} at scene ${sceneNum}`,
    { done: true }
  );

  return newSessionId;
}

export function forkStoryAtScene(
  tx: AnyTx,
  ctx: ForkCtx,
  sessionId: bigint,
  sceneNum: number,
  generationId: bigint,
  branchLabel: string,
  actorName: string
): bigint {
  logActivity(
    tx,
    sessionId,
    sceneNum,
    'story_fork_requested',
    'Story fork requested',
    `${actorName} · scene ${sceneNum}${generationId !== 0n ? ` · gen ${generationId.toString()}` : ''}`,
    { done: true }
  );

  return copySessionFork(
    tx,
    ctx,
    sessionId,
    sceneNum,
    generationId,
    branchLabel
  );
}
