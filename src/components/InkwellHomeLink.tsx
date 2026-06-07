import InkwellLogo from './InkwellLogo';

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
  const logoSize = size === 'lg' ? 'md' : 'xs';

  return (
    <InkwellLogo
      size={logoSize}
      onClick={onGoHome}
      className={className}
      title="Back to home — your story is saved"
      wordmarkClassName={
        size === 'banner' ? 'font-label text-sm uppercase tracking-widest' : ''
      }
    />
  );
}
