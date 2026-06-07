type InkwellLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'hero';

type InkwellLogoProps = {
  size?: InkwellLogoSize;
  /** Show the display-font wordmark beside the mark */
  showWordmark?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  /** Lower contrast for placeholders and watermarks */
  muted?: boolean;
  wordmarkClassName?: string;
};

const LOGO_SRC = '/logo.svg';

const sizeStyles: Record<
  InkwellLogoSize,
  { mark: string; word: string; gap: string }
> = {
  xs: { mark: 'h-5 w-5', word: 'text-sm', gap: 'gap-1.5' },
  sm: { mark: 'h-7 w-7', word: 'text-base', gap: 'gap-2' },
  md: { mark: 'h-9 w-9', word: 'text-lg', gap: 'gap-2' },
  lg: { mark: 'h-12 w-12', word: 'text-2xl', gap: 'gap-2.5' },
  hero: { mark: 'h-20 w-20 md:h-24 md:w-24', word: 'text-6xl md:text-7xl lg:text-8xl', gap: 'gap-5' },
};

export default function InkwellLogo({
  size = 'sm',
  showWordmark = true,
  onClick,
  className = '',
  title = 'Inkwell',
  muted = false,
  wordmarkClassName = '',
}: InkwellLogoProps) {
  const styles = sizeStyles[size];
  const tone = muted ? 'opacity-25' : 'opacity-100';

  const content = (
    <>
      <img
        src={LOGO_SRC}
        alt=""
        aria-hidden
        className={`${styles.mark} shrink-0 object-contain ${tone}`}
      />
      {showWordmark && (
        <span
          className={`font-display font-medium tracking-tight text-ink ${styles.word} ${muted ? 'text-ink/25' : ''} ${wordmarkClassName}`}
        >
          Inkwell
        </span>
      )}
    </>
  );

  const layout = `inline-flex items-center ${styles.gap} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${layout} text-left transition-opacity hover:opacity-80`}
        title={title}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={layout} title={title}>
      {content}
    </span>
  );
}
