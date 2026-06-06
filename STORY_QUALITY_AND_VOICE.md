# INKWELL — Story Quality & Voice Narration Guide

---

## Part 1: Story Quality Improvements

### The Core Problem

The current pipeline produces coherent scenes but they describe *what is happening*
rather than *what it means*. Great noir lives in subtext — the gap between what
characters say and what they mean. The fix is structural: give Claude more
narrative context and tighter constraints.

---

### Fix 1: Scene Dramatic Function

Every scene in a story has a job. Right now Claude only knows "scene 3 of 6".
Add a dramatic function so it knows what the scene must *accomplish*, not just
where it sits.

Add this to `buildScenePrompt`:

```typescript
function getSceneDramaticFunction(sceneNum: number, totalScenes: number): string {
  const position = sceneNum / totalScenes

  if (sceneNum === 1) return `
    OPENING SCENE. Establish the world and the wound.
    Introduce the protagonist in their ordinary state — but something is already wrong.
    The inciting incident arrives at the last panel. End on a question, not an answer.
    DO NOT resolve anything. DO NOT explain the premise.`

  if (sceneNum === 2) return `
    COMPLICATION. The protagonist takes the case / makes the choice.
    They think they understand the situation. They are wrong.
    Introduce the second major character if not yet seen.
    End on a revelation that reframes scene 1.`

  if (position <= 0.4) return `
    DEEPENING. The protagonist gets deeper in.
    A small victory followed by a larger problem.
    Something from the past surfaces. Trust is tested.
    End on a moment of doubt.`

  if (position <= 0.6) return `
    MIDPOINT TURN. Everything the protagonist believed is wrong.
    The real stakes become clear. Someone betrays or is betrayed.
    The protagonist cannot go back to who they were.
    This is the point of no return. End with them choosing to continue anyway.`

  if (position <= 0.8) return `
    DESCENT. The protagonist is losing.
    Strip away allies, resources, certainty.
    The antagonist's full plan becomes visible.
    End at the lowest point — the protagonist alone, everything gone wrong.`

  if (sceneNum === totalScenes - 1) return `
    CONFRONTATION. The protagonist faces the truth directly.
    Not just the antagonist — the truth about themselves.
    Violence or revelation or both. Nothing is resolved yet.
    End on a cliffhanger or a sacrifice.`

  return `
    RESOLUTION. The protagonist wins — but at a cost.
    What they lost matters as much as what they gained.
    The world is changed. They are changed.
    The last panel should echo the first scene visually. End with one line that lands.`
}
```

---

### Fix 2: Subtext Constraint

Add this block to the system prompt:

```typescript
const SUBTEXT_RULES = `
DIALOGUE RULES — non-negotiable:
- Characters NEVER state the theme directly ("trust is everything", "nobody's innocent")
- Characters speak about CONCRETE things (keys, weather, money, names, times, places)
  and let the abstract bleed through
- Every line of dialogue should be doing two things at once — the surface thing
  and the real thing underneath
- Silence is an option. A panel with no dialogue and a strong visual IS a panel.
- Maximum 2 lines of dialogue per speech balloon. If it needs more, split the panels.
- The best line in each scene should be the LAST line spoken. Build to it.

CAPTION RULES:
- Captions are the protagonist's internal voice — first person, present tense
- Captions observe, they do not explain
- "The rain never stopped in this city" is good. 
  "I knew something was wrong" is bad — show us, don't tell us.
- Max one caption per panel. Many panels should have none.

VISUAL RULES:
- Each panel should be describable in one strong image
- If two panels have the same composition (two people talking at a desk),
  change the angle, distance, or staging of one
- Use the environment as a character — rain, light, reflections, shadows
  should reflect the emotional state of the scene
`
```

---

### Fix 3: Character Voice Differentiation

Currently all characters risk sounding like the same narrator. Add voice cards:

```typescript
function buildCharacterVoiceCards(characters: Character[]): string {
  return characters.map(c => `
CHARACTER VOICE — ${c.name} (${c.archetype}):
  Personality: ${c.personality}
  Current mood: ${c.current_mood}
  Speech pattern: ${getArchetypeSpeechPattern(c.archetype)}
  What they want in this scene: unknown to them, drive it from their archetype
  What they are hiding: ${c.secret || 'unknown — let it show in what they avoid saying'}
  `).join('\n')
}

function getArchetypeSpeechPattern(archetype: string): string {
  const patterns: Record<string, string> = {
    'detective':        'Short declarative sentences. Questions that aren\'t really questions. Observations delivered flat.',
    'femme fatale':     'Never answers directly. Deflects with compliments or redirections. Says more with less.',
    'corrupt official': 'Formal language that slips when threatened. Uses "we" when he means "I".',
    'witness':          'Over-explains. Nervous tangents. The important detail buried in the middle.',
    'antagonist':       'Calm. Almost warm. The threat is in what they don\'t need to say.',
    'ally':             'Direct, loyal, slightly behind — they understand less than the protagonist but feel more.',
  }
  return patterns[archetype.toLowerCase()] 
    || 'Speak from their archetype. Be specific to who they are, not what they represent.'
}
```

---

### Fix 4: Visual Continuity Instruction

Add this to the image prompt builder so panels feel like they belong together:

```typescript
function buildImagePrompt(panel: ScriptPanel, session: Session, sceneNum: number): string {
  return `
${session.style_bible}

SCENE CONTEXT: ${session.genre} story, ${session.setting}, scene ${sceneNum}.
This is a comic panel — it must work as a standalone image but belong to a sequence.

CONTINUITY RULES:
- Character appearances must stay consistent with their established look
- The environment is: ${session.setting}
- Lighting should be: ${getLightingForGenre(session.genre)}
- Camera: ${panel.layout_hint === 'close-up' ? 'extreme close-up, face fills frame' 
           : panel.layout_hint === 'wide' ? 'wide establishing shot, figures small in environment'
           : panel.layout_hint === 'tall' ? 'vertical composition, use height for drama'
           : 'medium shot, waist up, clear staging'}

THIS PANEL:
${panel.image_prompt}

${panel.dialogue ? `DIALOGUE IN PANEL (render as speech balloon): "${panel.dialogue}" — spoken by ${panel.speaker}` : 'No dialogue in this panel.'}
${panel.caption ? `CAPTION (render as caption box): "${panel.caption}"` : 'No caption in this panel.'}
`
}

function getLightingForGenre(genre: string): string {
  const lighting: Record<string, string> = {
    'noir':    'single hard light source, deep shadows, venetian blind patterns, wet reflections on pavement',
    'horror':  'underlighting, darkness at edges, single cold light source, shadows that move wrong',
    'comedy':  'bright even lighting, warm tones, no dramatic shadows',
    'fantasy': 'magical light sources, saturated but soft, practical light from torches or magic',
    'sci-fi':  'blue-white LED light, screens glowing, hard shadows in zero-gravity settings',
    'western': 'harsh sun overhead or golden hour low angle, dust particles visible in light beams',
  }
  return lighting[genre.toLowerCase()] || 'naturalistic lighting appropriate to the setting'
}
```

---

### Fix 5: Updated buildScenePrompt

Full updated prompt function integrating all fixes:

```typescript
export function buildScenePrompt({ session, characters, memories, directives, scene_num }) {
  return `
You are the genre engine for Inkwell — an AI comic strip writer.
You are the INVISIBLE AUTHOR. You see everything. You enforce genre logic.
You are writing in the tradition of the great ${session.genre} storytellers.

${getGenreRules(session.genre)}

STORY POSITION:
${getSceneDramaticFunction(scene_num, session.total_scenes)}

WORLD:
Genre: ${session.genre}
Setting: ${session.setting}

${buildCharacterVoiceCards(characters)}

STORY MEMORY (what has happened):
${memories.length > 0 
  ? memories.map(m => `- Scene ${m.scene_num}: ${m.event_text}`).join('\n')
  : 'This is the opening scene. The world is intact. Nothing has gone wrong yet.'}

ACTIVE DIRECTIVES (honour these — they are the director\'s instructions):
${directives.length > 0
  ? directives.map(d => `- [${d.type.toUpperCase()}] ${d.content}`).join('\n')
  : 'No directives. Follow the natural dramatic function of this scene position.'}

${SUBTEXT_RULES}

OUTPUT FORMAT:
Respond ONLY with valid JSON. No markdown. No preamble. Exactly this schema:

{
  "title": "4-6 words, evocative, not literal",
  "scene_summary": "One sentence. What actually happened in this scene.",
  "panels": [
    {
      "panel_num": 1,
      "caption": "First person narrator voice. Observational. Or empty string.",
      "speaker": "Character name or empty string",
      "dialogue": "What they say. Or empty string. Two lines max.",
      "image_prompt": "Concrete visual description. Pose, expression, environment detail, camera angle.",
      "layout_hint": "wide | tall | square | close-up"
    }
  ],
  "character_updates": [
    { "char_id": 1, "new_mood": "specific mood, one phrase" }
  ],
  "new_memories": [
    { "char_id": 1, "panel_num": 3, "event_text": "What this character witnessed. One sentence. Specific." }
  ]
}

Write 5-7 panels. Make the last panel earn it.
`.trim()
}
```

---

## Part 2: Voice Narration Feature

### The Idea

Two modes, both optional and togglable:

**Mode A — Scene Narration (podcast style)**
After a scene fully generates, a voice reads the captions and dialogue aloud
in sequence as the user's eye moves panel to panel. Like an audiobook of the
comic. User can mute or turn off entirely.

**Mode B — Voice Direction (real-time nudge)**
User speaks a directive instead of typing it. Speech-to-text captures it,
populates the nudge input, and applies it. Can switch back to typing at any time.

---

### How Difficult Is Each

#### Mode A — Scene Narration

**Effort: Medium — 1 day**

The data is already there. Every panel has `caption` and `dialogue` fields in
SpacetimeDB. The implementation is:

1. When scene status flips to `done`, collect all panels in order
2. Build a narration script:
   ```
   [caption text]
   [character name]: [dialogue text]
   [next panel caption]
   ...
   ```
3. Pass to Web Speech API (free, in-browser, no credits) or ElevenLabs (costs credits)
4. Play audio, highlight the current panel as it plays

The hard part is **panel synchronisation** — timing the audio to visually
highlight which panel is being narrated. You need to estimate reading time per
panel or use the Web Speech API's `onboundary` events to track position.

**Two implementation options:**

| Option | Quality | Cost | Effort |
|---|---|---|---|
| Web Speech API | Robotic but free | $0 | 4 hours |
| OpenAI TTS (`tts-1`) | Good, natural | ~$0.015 per 1k chars. Full scene ≈ 500 chars ≈ $0.008 per scene | 6 hours |
| ElevenLabs | Excellent, character voices | ~$0.30 per scene | 8 hours + account |

**Recommendation: OpenAI TTS.** You have $10 credit. At $0.008 per scene and
6 scenes per story, a full story narration costs $0.05. You can run 200 full
stories on $10 of TTS credit. The quality is good enough to be impressive in a demo.

**Voice character mapping** — the genuinely cool version:
Assign a different OpenAI TTS voice per character. `onyx` for the hard-boiled
detective, `shimmer` for the femme fatale, `alloy` for the narrator. Costs the
same. Takes 2 extra hours. Judges will remember it.

```typescript
const VOICE_MAP: Record<string, string> = {
  narrator:    'onyx',     // deep, world-weary
  detective:   'echo',     // measured, direct
  femme_fatale:'shimmer',  // warm, slightly dangerous
  default:     'alloy',    // neutral
}
```

---

#### Mode B — Voice Direction

**Effort: Low — 2-4 hours**

The browser's Web Speech API handles speech-to-text natively. No API key,
no credits, works in Chrome immediately.

```typescript
// Drop this into NudgeBar.tsx
const startListening = () => {
  const recognition = new (window as any).webkitSpeechRecognition()
  recognition.continuous = false
  recognition.lang = 'en-US'
  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript
    setNudgeText(transcript)  // populates the text input
  }
  recognition.start()
}
```

That's essentially the whole implementation. The transcript drops into the
existing nudge text input exactly as if the user had typed it. The apply button
works the same way. No new backend code at all.

The UX is: microphone icon next to the nudge input. Press and hold to speak.
Release to populate. Tap apply or tap to edit first. Switch icon shows
mic/keyboard toggle.

**What could go wrong:** browser support (Chrome only, not Safari), background
noise, accents. For a hackathon demo in a controlled environment this is fine.

---

### Combined Implementation Plan

If you want both features, build in this order:

**Hour 1-2: Voice Direction (Mode B)**
- Add mic button to `NudgeBar.tsx`
- Wire `webkitSpeechRecognition` to nudge text state
- Add mic/keyboard toggle UI
- Test: speak "reveal that someone is lying" → populates input → apply

**Hour 3-5: Scene Narration (Mode A)**
- After scene `status === 'done'`, build narration script from panel rows
- Call OpenAI TTS API with character voice mapping
- Play audio with panel highlighting sync
- Add speaker icon in top bar — click to toggle on/off, click again to mute

**Hour 6: Polish**
- Mute button (stops audio, remembers preference)
- Auto-advance panel highlight as audio plays
- Skip button (stops narration, jumps to end)

---

### How Well Would It Work

**Voice Direction:** Works well. The reliability of Web Speech API in Chrome is
high in a quiet room. For a demo this is essentially a party trick but a
compelling one — speaking "make it darker" and watching the next scene shift
in tone is exactly the kind of thing that gets a reaction from judges.

**Scene Narration:** Works very well if you use OpenAI TTS. The panel-by-panel
synchronisation is the tricky part — if you don't nail the timing it feels
disconnected from the visuals. Simplest working version: just read the full
scene script, let the user follow along themselves. Fancier version: highlight
panels using estimated reading time (150 words per minute as baseline).

**The demo moment with both:** User sets up a noir story. Scene 1 generates.
Audio narration kicks in — the detective's world-weary voice reading the
captions, a different voice for the femme fatale's dialogue. Scene ends.
User leans toward the mic: "she's been lying from the start." Scene 2
generates. The narration reflects it. That is a standing-ovation demo moment
for a hackathon.

---

### Credit Usage Summary

| Feature | Model | Cost per story | Cost for 100 stories |
|---|---|---|---|
| Scene narration (existing $10 credit) | OpenAI TTS tts-1 | ~$0.05 | ~$5.00 |
| Voice direction | Web Speech API | $0 | $0 |
| Panel images (existing) | GPT Image 1 Mini | ~$0.18 | ~$18.00 |
| Scene scripts (existing) | Claude Sonnet | ~$0.02 | ~$2.00 |
| **Total per story with voice** | | **~$0.25** | **~$25.00** |

Your $10 OpenAI credit covers ~40 fully narrated stories. More than enough
for the demo and judging period.

---

### Recommendation

**For the hackathon: build Mode B (voice direction) first.**

It's 2-4 hours, costs nothing, and makes the demo interactive in a way no
other submission will have. Speaking a directive out loud and watching it
reshape the comic is the kind of thing people pull out their phones to record.

**Then if time allows: add Mode A narration.**

Use OpenAI TTS with character voice mapping. Don't worry about perfect panel
sync — just play the narration and let the user follow along. The atmosphere
it creates is worth it even without perfect sync.

**Cut if time is short:** the mute button, panel highlighting sync, and the
keyboard/mic toggle polish. The core of each feature is 2-3 hours each.
The polish is another 2-3 hours each.
