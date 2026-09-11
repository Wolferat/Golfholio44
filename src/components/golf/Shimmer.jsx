import { cn } from '@/lib/utils';

export function ShimmerBlock({ className }) {
  return <div className={cn('shimmer rounded-lg', className)} />;
}

export function ListingCardSkeleton() {
  return (
    <div className="border-b border-border">
      <ShimmerBlock className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-2.5">
        <ShimmerBlock className="h-4 w-3/4" />
        <ShimmerBlock className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function RoundRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
      <ShimmerBlock className="h-12 w-12 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <ShimmerBlock className="h-4 w-1/3" />
        <ShimmerBlock className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function CrewRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
      <ShimmerBlock className="h-11 w-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <ShimmerBlock className="h-4 w-2/5" />
        <ShimmerBlock className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return <ShimmerBlock className="h-20 w-full rounded-2xl" />;
}