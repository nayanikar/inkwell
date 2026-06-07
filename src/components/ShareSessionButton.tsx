import { useState } from 'react';

type ShareSessionButtonProps = {
  shareUrl: string | null;
  disabled?: boolean;
  /** Single compact control — share or copy, no duplicate buttons */
  compact?: boolean;
};

export default function ShareSessionButton({
  shareUrl,
  disabled = false,
  compact = false,
}: ShareSessionButtonProps) {
  const [copied, setCopied] = useState(false);

  if (!shareUrl) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Inkwell — co-direct this story',
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled or share failed */
      }
    }
    void handleCopy();
  };

  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleShare()}
        className="scene-header-btn"
        title="Invite a co-director"
      >
        {copied ? 'Copied' : 'Share'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleShare()}
        className="border border-ink bg-paper px-2 py-0.5 font-label text-[10px] uppercase tracking-widest hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        Share
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleCopy()}
        className="border border-ink/40 bg-paper px-2 py-0.5 font-label text-[10px] uppercase tracking-widest text-ink/60 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        title={shareUrl}
      >
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  );
}
