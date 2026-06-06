type InkwellHomeLinkProps = {
  onGoHome?: () => void;
  size?: 'sm' | 'lg' | 'banner';
  className?: string;
};

export default function InkwellHomeLink({
  onGoHome,
  size = 'sm',
  className = '',
}: InkwellHomeLinkProps) {
  const sizeClass =
    size === 'lg'
      ? 'font-display text-5xl'
      : size === 'banner'
        ? 'font-label text-sm uppercase tracking-widest'
        : 'font-display text-2xl';

  if (!onGoHome) {
    return <span className={`text-ink ${sizeClass} ${className}`}>Inkwell</span>;
  }

  return (
    <button
      type="button"
      onClick={onGoHome}
      className={`text-ink transition-colors hover:text-accent ${sizeClass} ${className}`}
      title="Back to home — your story is saved"
    >
      Inkwell
    </button>
  );
}
