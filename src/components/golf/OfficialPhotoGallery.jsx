import { Image } from '@/components/ui/image';
import CategoryPlaceholder from './CategoryPlaceholder';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Official venue photo hero + gallery. Shows validated official photos
// with attribution, or a distinct branded placeholder when none exist.
// Player review photos are never shown here — only OfficialPhoto records.
export default function OfficialPhotoGallery({ photos, name, typeLabel }) {
  const hasPhotos = photos && photos.length > 0;
  const hero = hasPhotos ? photos[0] : null;
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div>
      <div className="relative h-[280px] overflow-hidden">
        {hero ? (
          <Image
            key={activeIdx}
            src={photos[activeIdx]?.url || hero.url}
            fittingType="fill"
            className="absolute inset-0 h-full w-full"
            alt={name}
          />
        ) : (
          <CategoryPlaceholder className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 rounded-full glass border border-border/40 px-3 py-1 text-xs font-semibold">
          {typeLabel}
        </span>
        {hasPhotos && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full glass border border-border/40 px-2.5 py-1 text-[10px] font-medium text-foreground/80">
            <Camera className="h-3 w-3" /> Official venue photo
          </span>
        )}
      </div>

      {hasPhotos && photos.length > 1 && (
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto no-scrollbar">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'h-16 w-24 rounded-lg overflow-hidden border-2 shrink-0 transition',
                i === activeIdx ? 'border-primary' : 'border-transparent opacity-60'
              )}
            >
              <Image src={p.url} fittingType="fill" className="h-full w-full" alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}