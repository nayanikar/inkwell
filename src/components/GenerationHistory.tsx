import type { GenerationRow } from '../lib/storyActs';
import { GENERATION_KIND_LABELS } from '../lib/storyActs';

type GenerationHistoryProps = {
  generations: GenerationRow[];
  selectedGenerationId: bigint | null;
  onSelectGeneration: (generationId: bigint | null) => void;
  onRestore?: (generationId: bigint) => void;
  canRestore: boolean;
  restoreDisabled?: boolean;
  onFork?: (generationId: bigint) => void;
  canFork?: boolean;
  forkDisabled?: boolean;
};

function formatRelativeTime(createdAt: bigint): string {
  const ms = Number(createdAt / 1000n);
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function GenerationHistory({
  generations,
  selectedGenerationId,
  onSelectGeneration,
  onRestore,
  canRestore,
  restoreDisabled = false,
  onFork,
  canFork = false,
  forkDisabled = false,
}: GenerationHistoryProps) {
  if (generations.length === 0) {
    return (
      <div className="border-t border-ink px-3 py-2">
        <p className="font-label text-[10px] uppercase tracking-widest text-ink/45">
          Generations
        </p>
        <p className="mt-1 font-label text-[9px] text-ink/40">
          No archived versions yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col border-t border-ink">
      <div className="shrink-0 border-b border-ink px-3 py-2">
        <p className="font-label text-[10px] uppercase tracking-widest text-ink/70">
          Generations
        </p>
        <p className="font-label text-[9px] normal-case tracking-normal text-ink/40">
          {generations.length} version{generations.length === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="inkwell-scroll max-h-48 overflow-y-auto overscroll-contain px-2 py-2">
        {generations.map(gen => {
          const isSelected =
            selectedGenerationId === gen.generationId ||
            (selectedGenerationId == null && gen.isCurrent);
          const thumb = gen.pageImageUrl?.trim();
          const kindLabel =
            GENERATION_KIND_LABELS[gen.kind] ?? gen.kind.replace(/_/g, ' ');

          return (
            <li key={gen.generationId.toString()} className="mb-1.5 last:mb-0">
              <button
                type="button"
                onClick={() =>
                  onSelectGeneration(gen.isCurrent ? null : gen.generationId)
                }
                className={`flex w-full items-start gap-2 border p-1.5 text-left transition-colors hover:border-accent ${
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-ink/30 bg-paper'
                }`}
              >
                <div className="h-10 w-8 shrink-0 overflow-hidden border border-ink/20 bg-paper">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-label text-[8px] text-ink/30">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-label text-[10px] uppercase tracking-wide text-ink">
                    v{gen.generationNum}
                    {gen.isCurrent ? ' · live' : ''}
                  </p>
                  <p className="truncate font-label text-[9px] text-ink/55">
                    {kindLabel}
                  </p>
                  <p className="font-label text-[8px] text-ink/40">
                    {formatRelativeTime(gen.createdAt)}
                  </p>
                </div>
              </button>
              {isSelected &&
                !gen.isCurrent &&
                canRestore &&
                onRestore != null && (
                  <button
                    type="button"
                    disabled={restoreDisabled}
                    onClick={() => onRestore(gen.generationId)}
                    className="mt-1 w-full border border-ink bg-paper px-2 py-1 font-label text-[9px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Restore this version
                  </button>
                )}
              {isSelected &&
                !gen.isCurrent &&
                canFork &&
                onFork != null && (
                  <button
                    type="button"
                    disabled={forkDisabled}
                    onClick={() => onFork(gen.generationId)}
                    className="mt-1 w-full border border-accent bg-accent/5 px-2 py-1 font-label text-[9px] uppercase tracking-widest text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fork with this version
                  </button>
                )}
            </li>
          );
        })}
      </ul>
      {selectedGenerationId != null && (
        <button
          type="button"
          onClick={() => onSelectGeneration(null)}
          className="shrink-0 border-t border-ink px-3 py-1.5 text-left font-label text-[9px] uppercase tracking-widest text-ink/55 hover:text-accent"
        >
          Back to live
        </button>
      )}
    </div>
  );
}
