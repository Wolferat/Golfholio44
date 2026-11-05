import { useState } from 'react';
import { Check, ExternalLink, Globe, Loader2, MapPin, Phone, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// One venue, everything needed to decide it in a look: name, category,
// distance, street address, phone, website and Google rating. A venue that
// could not clear every automated check shows exactly which one failed, and
// approving it is recorded as the admin's own decision.
function Fact({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
      <Icon className="h-3 w-3 mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function ApprovalCandidateCard({ candidate: c, busy, onDecide }) {
  const [confirming, setConfirming] = useState(false);
  const busyHere = busy === c.id;

  // 'verified — …' means every gate passed. Anything else is the one check
  // that could not be confirmed automatically.
  const passed = String(c.private_reason || '').startsWith('verified');
  const reason = passed ? '' : String(c.private_reason || '').replace(/^needs your call:\s*/, '');
  const rating = typeof c.rating === 'number' ? c.rating : null;
  const reviews = typeof c.review_count === 'number' ? c.review_count : null;
  const website = String(c.official_website || '');
  const place = c.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${c.place_id}`
    : '';

  const decide = () =>
    onDecide(c, 'approve', passed ? {} : { adminOverride: true });

  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{c.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {(c.discovery_category || 'venue').replace(/_/g, ' ')}
            {c.distance_miles != null ? ` · ${c.distance_miles} mi away` : ''}
          </div>
        </div>
        <span
          className={
            passed
              ? 'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 bg-primary/15 text-primary border-primary/30'
              : 'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 bg-rating/15 text-rating border-rating/30'
          }
        >
          {passed ? 'all checks passed' : 'needs your call'}
        </span>
      </div>

      <div className="space-y-1 mt-2">
        <Fact icon={MapPin}>
          {[c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') ||
            'no street address'}
        </Fact>
        {c.phone && (
          <Fact icon={Phone}>
            <a href={`tel:${c.phone}`} className="text-primary">
              {c.phone}
            </a>
          </Fact>
        )}
        <Fact icon={Globe}>
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 break-all"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {website.replace(/^https?:\/\//, '')}
            </a>
          ) : (
            <span>no official website — Google listing only</span>
          )}
        </Fact>
        {rating != null && (
          <Fact icon={Star}>
            <span className="text-foreground font-medium">{rating.toFixed(1)}</span>
            {reviews != null ? ` from ${reviews} Google review${reviews === 1 ? '' : 's'}` : ' on Google'}
          </Fact>
        )}
      </div>

      {reason && (
        <div className="mt-2 rounded-lg bg-secondary/60 p-2 text-[11px] text-muted-foreground">
          Not confirmed automatically: {reason}
        </div>
      )}

      {place && (
        <a
          href={place}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-2 underline underline-offset-2"
        >
          <ExternalLink className="h-3 w-3" /> View the Google listing
        </a>
      )}

      {confirming ? (
        <div className="flex gap-2 mt-3">
          <Button className="flex-1 h-9" disabled={!!busy} onClick={decide}>
            {busyHere ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirm publish
          </Button>
          <Button variant="secondary" className="flex-1 h-9" disabled={!!busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <Button
            className="flex-1 h-9"
            disabled={!!busy}
            onClick={() => (passed ? decide() : setConfirming(true))}
          >
            {busyHere ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
            {passed ? 'Approve' : 'Approve anyway'}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 h-9"
            disabled={!!busy}
            onClick={() => onDecide(c, 'reject')}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}