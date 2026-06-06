import { schema, t, table, SenderError } from 'spacetimedb/server';
import { buildStyleBible } from './lib/style.js';
import { buildScenePrompt, buildPanelImagePrompt } from './lib/prompts.js';
import { callAnthropic } from './lib/anthropic.js';
import { callOpenAI } from './lib/openai.js';

const CharacterInput = t.object('CharacterInput', {
  name: t.string(),
  archetype: t.string(),
  personality: t.string(),
  current_mood: t.string(),
  secret: t.string(),
});

const session = table(
  { name: 'session', public: true },
  {
    session_id: t.u64().primaryKey().autoInc(),
    genre: t.string(),
    setting: t.string(),
    style_bible: t.string(),
    total_scenes: t.u32(),
    current_scene: t.u32(),
    status: t.string(),
    created_at: t.u64(),
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
    secret: t.string(),
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
  { name: 'narrative_directive', public: true },
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
  { name: 'scene', public: true },
  {
    scene_id: t.u64().primaryKey().autoInc(),
    session_id: t.u64().index('btree'),
    scene_num: t.u32(),
    title: t.string(),
    status: t.string(),
    created_at: t.u64(),
    scene_summary: t.string().default(''),
  }
);

const panel = table(
  { name: 'panel', public: true },
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

const spacetimedb = schema({
  session,
  character,
  memory,
  narrativeDirective,
  scene,
  panel,
});
export default spacetimedb;

function timestampMicros(ctx: { timestamp: { microsSinceUnixEpoch: bigint } }): bigint {
  return ctx.timestamp.microsSinceUnixEpoch;
}

export const create_session = spacetimedb.reducer(
  {
    genre: t.string(),
    setting: t.string(),
    totalScenes: t.u32(),
    characters: t.array(CharacterInput),
  },
  (ctx, { genre, setting, totalScenes, characters }) => {
    if (characters.length < 2 || characters.length > 4) {
      throw new SenderError('Sessions require 2–4 characters');
    }

    const style_bible = buildStyleBible(genre, setting);
    const inserted = ctx.db.session.insert({
      session_id: 0n,
      genre,
      setting,
      style_bible,
      total_scenes: totalScenes,
      current_scene: 1,
      status: 'setup',
      created_at: timestampMicros(ctx),
    });

    for (const c of characters) {
      ctx.db.character.insert({
        char_id: 0n,
        session_id: inserted.session_id,
        name: c.name,
        archetype: c.archetype,
        personality: c.personality,
        current_mood: c.current_mood || 'neutral',
        secret: c.secret,
      });
    }
  }
);

export const apply_nudge = spacetimedb.reducer(
  {
    sessionId: t.u64(),
    type: t.string(),
    content: t.string(),
  },
  (ctx, { sessionId, type, content }) => {
    const sessionRow = ctx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }

    ctx.db.narrativeDirective.insert({
      directive_id: 0n,
      session_id: sessionId,
      type,
      content,
      // Target the upcoming scene — user nudges while reading the current one.
      applied_at_scene: sessionRow.current_scene + 1,
      applied_by: 'user',
    });
  }
);

export const advance_scene = spacetimedb.reducer(
  { sessionId: t.u64() },
  (ctx, { sessionId }) => {
    const sessionRow = ctx.db.session.session_id.find(sessionId);
    if (!sessionRow) {
      throw new SenderError('Session not found');
    }

    if (sessionRow.current_scene >= sessionRow.total_scenes) {
      ctx.db.session.session_id.update({
        ...sessionRow,
        status: 'done',
      });
      return;
    }

    ctx.db.session.session_id.update({
      ...sessionRow,
      current_scene: sessionRow.current_scene + 1,
      status: sessionRow.status === 'setup' ? 'running' : sessionRow.status,
    });
  }
);

export const update_character_mood = spacetimedb.reducer(
  { charId: t.u64(), newMood: t.string() },
  (ctx, { charId, newMood }) => {
    const row = ctx.db.character.char_id.find(charId);
    if (!row) {
      throw new SenderError('Character not found');
    }
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

export const generate_scene = spacetimedb.procedure(
  { sessionId: t.u64(), sceneNum: t.u32() },
  t.unit(),
  (ctx, { sessionId, sceneNum }) => {
    const ctxData = ctx.withTx(tx => {
      const sessionRow = tx.db.session.session_id.find(sessionId);
      if (!sessionRow) {
        throw new SenderError('Session not found');
      }

      const characters = [...tx.db.character.session_id.filter(sessionId)];
      const memories = [...tx.db.memory.session_id.filter(sessionId)].filter(
        m => m.scene_num >= sceneNum - 2
      );
      const directives = [
        ...tx.db.narrativeDirective.session_id.filter(sessionId),
      ].filter(d => d.applied_at_scene === sceneNum);

      return { session: sessionRow, characters, memories, directives };
    });

    const sceneJson = callAnthropic(
      ctx,
      buildScenePrompt({ ...ctxData, scene_num: sceneNum })
    );

    const insertResult = ctx.withTx(tx => {
      const staleScenes = [
        ...tx.db.scene.session_id.filter(sessionId),
      ].filter(s => s.scene_num === sceneNum);
      for (const stale of staleScenes) {
        for (const panel of [...tx.db.panel.scene_id.filter(stale.scene_id)]) {
          tx.db.panel.delete(panel);
        }
        tx.db.scene.delete(stale);
      }

      const sceneRow = tx.db.scene.insert({
        scene_id: 0n,
        session_id: sessionId,
        scene_num: sceneNum,
        title: sceneJson.title,
        scene_summary: sceneJson.scene_summary ?? '',
        status: 'generating',
        created_at: timestampMicros(tx),
      });

      const panelIds: bigint[] = sceneJson.panels.map((p, i) => {
        const inserted = tx.db.panel.insert({
          panel_id: 0n,
          scene_id: sceneRow.scene_id,
          session_id: sessionId,
          scene_num: sceneNum,
          panel_num: p.panel_num ?? i + 1,
          caption: p.caption ?? '',
          speaker: p.speaker ?? '',
          dialogue: p.dialogue ?? '',
          image_prompt: p.image_prompt,
          image_url: '',
          layout_hint: p.layout_hint ?? 'square',
          status: 'generating',
        });
        return inserted.panel_id;
      });

      return { scene_id: sceneRow.scene_id, panel_ids: panelIds };
    });

    for (let i = 0; i < sceneJson.panels.length; i++) {
      const panelDef = sceneJson.panels[i];
      const panelId = insertResult.panel_ids[i];
      try {
        const fullPrompt = buildPanelImagePrompt({
          session: {
            genre: ctxData.session.genre,
            setting: ctxData.session.setting,
            style_bible: ctxData.session.style_bible,
          },
          sceneNum,
          panel: panelDef,
        });
        const image_url = callOpenAI(ctx, fullPrompt);

        ctx.withTx(tx => {
          const row = tx.db.panel.panel_id.find(panelId);
          if (!row) {
            throw new SenderError(`Panel ${panelId} not found`);
          }
          tx.db.panel.panel_id.update({
            ...row,
            image_url,
            status: 'done',
          });
        });
      } catch (err) {
        ctx.withTx(tx => {
          const sceneRow = tx.db.scene.scene_id.find(insertResult.scene_id);
          if (sceneRow) {
            tx.db.scene.scene_id.update({ ...sceneRow, status: 'error' });
          }
          const row = tx.db.panel.panel_id.find(panelId);
          if (row) {
            tx.db.panel.panel_id.update({ ...row, status: 'error' });
          }
        });
        console.error(
          `generate_scene panel ${panelDef.panel_num ?? i + 1} image failed:`,
          String(err)
        );
        throw err;
      }
    }

    ctx.withTx(tx => {
      const sceneRow = tx.db.scene.scene_id.find(insertResult.scene_id);
      if (sceneRow) {
        tx.db.scene.scene_id.update({ ...sceneRow, status: 'done' });
      }

      for (const update of sceneJson.character_updates ?? []) {
        const charId = BigInt(update.char_id);
        const row = tx.db.character.char_id.find(charId);
        if (row) {
          tx.db.character.char_id.update({
            ...row,
            current_mood: update.new_mood,
          });
        }
      }

      for (const mem of sceneJson.new_memories ?? []) {
        tx.db.memory.insert({
          memory_id: 0n,
          char_id: BigInt(mem.char_id),
          session_id: sessionId,
          scene_num: sceneNum,
          panel_num: mem.panel_num,
          event_text: mem.event_text,
        });
      }

      const sessionRow = tx.db.session.session_id.find(sessionId);
      if (sessionRow && sessionRow.status === 'setup') {
        tx.db.session.session_id.update({
          ...sessionRow,
          status: 'running',
        });
      }
    });

    return {};
  }
);

export const init = spacetimedb.init(_ctx => {});
