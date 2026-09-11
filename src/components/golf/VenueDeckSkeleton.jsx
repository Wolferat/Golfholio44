export default function VenueDeckSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden border border-border bg-card">
          <div className="aspect-[16/9] shimmer" />
          <div className="p-3.5 space-y-2">
            <div className="h-4 w-3/4 rounded shimmer" />
            <div className="h-3 w-1/2 rounded shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}