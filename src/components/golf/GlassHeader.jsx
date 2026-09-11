import { cn } from '@/lib/utils';

export default function GlassHeader({ children, className }) {
  return (
    <div className={cn('sticky top-0 z-40 glass border-b border-border safe-top', className)}>
      {children}
    </div>
  );
}