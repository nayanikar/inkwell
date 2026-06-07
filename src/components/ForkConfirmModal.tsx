type ForkConfirmModalProps = {
  open: boolean;
  sceneNum: number;
  branchLabel?: string;
  withGeneration?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ForkConfirmModal({
  open,
  sceneNum,
  branchLabel,
  withGeneration = false,
  pending = false,
  onConfirm,
  onCancel,
}: ForkConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="max-w-md border border-ink bg-paper p-6 shadow-lg"
        role="dialog"
        aria-labelledby="fork-dialog-title"
      >
        <h2
          id="fork-dialog-title"
          className="font-label text-sm uppercase tracking-widest text-ink"
        >
          Fork from here?
        </h2>
        <p className="mt-3 font-dialogue text-base leading-snug text-ink/80">
          Starts a new fork from Scene {sceneNum}
          {withGeneration ? ' using the selected version' : ''}. The original
          timeline stays unchanged. Co-directors will move to the new fork.
        </p>
        {branchLabel?.trim() && (
          <p className="mt-2 font-label text-[10px] uppercase tracking-wide text-ink/50">
            Fork: {branchLabel.trim()}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="border border-ink bg-accent px-4 py-2 font-label text-[10px] uppercase tracking-widest text-paper hover:bg-accent/90 disabled:opacity-50"
          >
            {pending ? 'Creating fork…' : 'Create fork'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="border border-ink bg-paper px-4 py-2 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
