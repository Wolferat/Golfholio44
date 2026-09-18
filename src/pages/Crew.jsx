import GlassHeader from '@/components/golf/GlassHeader';
import { Users, Shield } from 'lucide-react';

export default function Crew() {
  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Crew</h1>
            <p className="text-xs text-muted-foreground mt-1">Connect with golfers</p>
          </div>
          <Users className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <div className="p-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/12 border border-primary/30 grid place-items-center mx-auto mb-4">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold">No player connections to show yet</h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Connect with golfers by their exact username to share rounds.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            No connections or activity are shown here yet. Golfolio never displays fake social information.
          </p>
        </div>

        <div className="mt-4 rounded-2xl bg-secondary/40 border border-border p-3.5 flex gap-2.5">
          <Shield className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Crew is invite-only. Your rounds, location, and contact info stay private.
          </p>
        </div>
      </div>
    </div>
  );
}