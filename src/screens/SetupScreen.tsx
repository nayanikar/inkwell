import { useState, type ReactNode } from 'react';
import InkwellPageShell from '../components/InkwellPageShell';
import ResumeStoryLink from '../components/ResumeStoryLink';
import type { SavedSession } from '../lib/savedSession';

export type CharacterFormRow = {
  name: string;
  archetype: string;
  personality: string;
  currentMood: string;
  visual_description: string;
  secret: string;
};

export type SetupFormData = {
  genre: string;
  setting: string;
  totalScenes: number;
  characters: CharacterFormRow[];
};

type SetupScreenProps = {
  onStart?: (data: SetupFormData) => void | Promise<void>;
  onPreviewScene?: () => void;
  onContinueStory?: () => void;
  onGoHome?: () => void;
  savedSession?: SavedSession | null;
  isSubmitting?: boolean;
  error?: string | null;
};

const GENRES = [
  'noir',
  'horror',
  'comedy',
  'fantasy',
  'sci-fi',
  'western',
  'romance',
  'thriller',
] as const;

const SCENE_COUNTS = [4, 6, 8, 10];

const emptyCharacter = (): CharacterFormRow => ({
  name: '',
  archetype: '',
  personality: '',
  currentMood: 'neutral',
  visual_description: '',
  secret: '',
});

function displayGenre(genre: string): string {
  if (genre === 'sci-fi') return 'Sci-Fi';
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

function Section({
  number,
  title,
  hint,
  children,
}: {
  number: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            {number}
          </span>
          <h2 className="font-display text-lg font-medium tracking-tight text-ink">
            {title}
          </h2>
        </div>
        {hint && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export default function SetupScreen({
  onStart,
  onPreviewScene,
  onContinueStory,
  onGoHome,
  savedSession,
  isSubmitting = false,
  error = null,
}: SetupScreenProps) {
  const [genre, setGenre] = useState<string | null>(null);
  const [setting, setSetting] = useState('');
  const [totalScenes, setTotalScenes] = useState(6);
  const [characters, setCharacters] = useState<CharacterFormRow[]>([
    emptyCharacter(),
    emptyCharacter(),
  ]);

  const updateCharacter = (
    index: number,
    field: keyof CharacterFormRow,
    value: string
  ) => {
    setCharacters(prev =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const addCharacter = () => {
    if (characters.length < 4) {
      setCharacters(prev => [...prev, emptyCharacter()]);
    }
  };

  const removeCharacter = (index: number) => {
    if (characters.length > 2) {
      setCharacters(prev => prev.filter((_, i) => i !== index));
    }
  };

  const canSubmit =
    genre != null &&
    setting.trim().length > 0 &&
    characters.length >= 2 &&
    characters.every(c => c.name.trim() && c.archetype.trim() && c.personality.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || genre == null) return;
    onStart?.({ genre, setting: setting.trim(), totalScenes, characters });
  };

  return (
    <InkwellPageShell
      onLogoClick={onGoHome}
      showConnection
      error={error}
      headerRight={
        savedSession && onContinueStory ? (
          <ResumeStoryLink
            savedSession={savedSession}
            onContinue={onContinueStory}
          />
        ) : (
          'Step 1 · Direct'
        )
      }
      footerLeft={
        canSubmit ? 'Ready' : 'Pick genre, setting, and 2 characters'
      }
      footerRight={
        <div className="flex shrink-0 items-center gap-3">
          {onPreviewScene && (
            <button
              type="button"
              onClick={onPreviewScene}
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-muted hover:text-ink"
            >
              Preview mock
            </button>
          )}
          <button
            type="submit"
            form="setup-form"
            disabled={isSubmitting || !canSubmit}
            className="border border-ink bg-ink px-8 py-3 font-mono text-xs uppercase tracking-[0.3em] text-paper transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:border-hairline disabled:bg-paper disabled:text-ink-muted/60 disabled:hover:bg-paper disabled:hover:text-ink-muted/60"
          >
            {isSubmitting ? 'Starting…' : 'Begin story →'}
          </button>
        </div>
      }
    >
      <form
        id="setup-form"
        onSubmit={handleSubmit}
        className="mx-auto flex h-full w-full max-w-6xl flex-1 flex-col overflow-hidden px-8 pt-5"
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
              Story setup
            </div>
            <h1 className="mt-1 font-display text-3xl font-medium tracking-tight text-ink">
              Direct your story.
            </h1>
          </div>
          <p className="text-sm italic text-ink-muted">
            Four short choices. Inkwell drafts the rest in panels.
          </p>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-10 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <Section number="01" title="Genre" hint="Pick one.">
              <div className="grid grid-cols-4 gap-2">
                {GENRES.map(g => {
                  const active = genre === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenre(g)}
                      className={
                        'rounded-md border-2 px-3 py-2 text-center font-mono text-xs uppercase tracking-wide transition ' +
                        (active
                          ? 'border-accent-ink bg-accent-ink text-paper'
                          : 'border-ink bg-paper text-ink hover:bg-paper-surface')
                      }
                    >
                      {displayGenre(g)}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section number="02" title="Scene count" hint="How many scenes.">
              <div className="flex flex-wrap gap-2">
                {SCENE_COUNTS.map(n => {
                  const active = totalScenes === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTotalScenes(n)}
                      className={
                        'flex h-12 w-12 items-center justify-center rounded-md border-2 font-mono text-lg transition ' +
                        (active
                          ? 'border-accent-ink bg-accent-ink text-paper'
                          : 'border-ink bg-paper text-ink hover:bg-paper-surface')
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <Section number="03" title="Setting" hint="Where and when.">
              <div className="rounded-md border-2 border-ink bg-paper-surface p-2">
                <input
                  value={setting}
                  onChange={e => setSetting(e.target.value)}
                  placeholder="e.g. Rain-soaked 1950s Los Angeles"
                  required
                  className="w-full border border-ink/40 bg-paper px-3 py-2 font-body text-lg italic text-ink placeholder:text-ink-muted/70 focus:border-ink focus:outline-none"
                />
              </div>
            </Section>

            <Section
              number="04"
              title="Characters"
              hint={`2 to 4. (${characters.length}/4)`}
            >
              <div className="inkwell-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {characters.map((c, i) => (
                  <div
                    key={i}
                    className="relative border-2 border-ink bg-paper-surface p-2 shadow-[3px_3px_0_var(--color-ink)]"
                  >
                    {characters.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeCharacter(i)}
                        className="absolute right-1 top-1 z-10 px-2 font-mono text-[10px] uppercase tracking-widest text-ink-muted hover:text-ink"
                        aria-label={`Remove character ${i + 1}`}
                      >
                        ✕
                      </button>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={c.name}
                        onChange={e => updateCharacter(i, 'name', e.target.value)}
                        placeholder="Name"
                        required
                        className="flex-1 border border-ink/40 bg-paper px-3 py-1.5 font-body text-base text-ink placeholder:text-ink-muted/70 focus:outline-none"
                      />
                      <input
                        value={c.archetype}
                        onChange={e => updateCharacter(i, 'archetype', e.target.value)}
                        placeholder="Role"
                        required
                        className="flex-1 border border-ink/40 bg-paper px-3 py-1.5 font-body text-base italic text-ink placeholder:text-ink-muted/70 focus:outline-none"
                      />
                    </div>
                    <input
                      value={c.personality}
                      onChange={e => updateCharacter(i, 'personality', e.target.value)}
                      placeholder="Who they are"
                      required
                      className="mt-2 w-full border border-ink/40 bg-paper px-3 py-1.5 font-body text-base italic text-ink placeholder:text-ink-muted/70 focus:outline-none"
                    />
                    <input
                      value={c.visual_description}
                      onChange={e =>
                        updateCharacter(i, 'visual_description', e.target.value)
                      }
                      placeholder="Species + silhouette — e.g. small white goat kid, tiny horns, nightgown"
                      className="mt-2 w-full border border-ink/40 bg-paper px-3 py-1.5 font-body text-base italic text-ink placeholder:text-ink-muted/70 focus:outline-none"
                    />
                    <input
                      value={c.secret}
                      onChange={e => updateCharacter(i, 'secret', e.target.value)}
                      placeholder="A hook or secret"
                      className="mt-2 w-full border border-ink/40 bg-paper px-3 py-1.5 font-body text-base italic text-ink placeholder:text-ink-muted/70 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              {characters.length < 4 && (
                <button
                  type="button"
                  onClick={addCharacter}
                  className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-muted hover:text-ink"
                >
                  + Add character
                </button>
              )}
            </Section>
          </div>
        </div>
      </form>
    </InkwellPageShell>
  );
}
