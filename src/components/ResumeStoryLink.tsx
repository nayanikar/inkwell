import { formatResumeLabel } from '../lib/resumeLabel';
import type { SavedSession } from '../lib/savedSession';

type ResumeStoryLinkProps = {
  savedSession: SavedSession;
  onContinue: () => void;
  disabled?: boolean;
};

export default function ResumeStoryLink({
  savedSession,
  onContinue,
  disabled = false,
}: ResumeStoryLinkProps) {
  const fullTitle = `${savedSession.setting || savedSession.genre} — scene ${savedSession.sceneNum}`;

  return (
    <button
      type="button"
      onClick={onContinue}
      disabled={disabled}
      title={fullTitle}
      className="max-w-[min(24rem,45vw)] truncate text-accent transition-colors hover:underline disabled:cursor-wait disabled:opacity-50"
    >
      {formatResumeLabel(savedSession)} →
    </button>
  );
}
