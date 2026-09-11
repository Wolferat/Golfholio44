import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Compass, Flag, Users, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const PERKS = [
  {
    icon: Compass,
    title: 'Discover anywhere',
    body: 'Courses, simulators and lessons — mapped worldwide, surfaced near you.',
  },
  {
    icon: Flag,
    title: 'Play & track',
    body: 'Live scorecards, tee times and tournaments, all in one pocket.',
  },
  {
    icon: Users,
    title: 'Your crew',
    body: 'An invite-only circle of golfers. No strangers, no noise — just your people.',
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
const rise = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 26 } },
};

export default function Welcome() {
  const [pressed, setPressed] = useState(null);

  return (
    <div className="min-h-dvh grid-stage night-glow relative overflow-hidden">
      {/* ambient emerald orbs */}
      <div className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-primary/20 blur-[90px]" />
      <div className="pointer-events-none absolute top-1/3 -left-24 h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />

      <div className="relative z-10 min-h-dvh flex flex-col safe-top safe-bottom px-6 max-w-md mx-auto">
        {/* emblem */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.05 }}
          className="pt-16 flex flex-col items-center"
        >
          <div className="relative h-20 w-20 rounded-2xl grid place-items-center bg-primary/10 border border-primary/40 shadow-lg shadow-primary/20">
            <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-md" />
            <Flag className="relative h-9 w-9 text-primary" strokeWidth={2.2} />
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-card border border-border text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <Lock className="h-3 w-3 text-primary" />
            Members only
          </div>
        </motion.div>

        {/* headline */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-10 text-center"
        >
          <motion.h1 variants={rise} className="text-4xl font-extrabold tracking-tight font-heading">
            Golfolio
          </motion.h1>
          <motion.p variants={rise} className="mt-3 text-base text-foreground/80 text-balance leading-relaxed">
            A private club for golfers who play. Invitation-only — built for the ones who show up at first light.
          </motion.p>
        </motion.div>

        {/* perks */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-10 space-y-3"
        >
          {PERKS.map((p) => (
            <motion.div
              key={p.title}
              variants={rise}
              className="glass-card rounded-2xl border border-border p-4 flex gap-3.5"
            >
              <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/12 border border-primary/30 grid place-items-center">
                <p.icon className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div>
                <p className="font-bold text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{p.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="flex-1" />

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 220, damping: 26 }}
          className="pb-10 pt-6 space-y-3"
        >
          <Link to="/register" className="block">
            <button
              onPointerDown={() => setPressed('r')}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              className={cn(
                'w-full h-13 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition active:scale-[0.98]',
                pressed === 'r' && 'scale-[0.98]'
              )}
              style={{ height: 52 }}
            >
              Request an invitation
              <ArrowRight className="h-4.5 w-4.5" />
            </button>
          </Link>
          <Link to="/login" className="block">
            <button
              onPointerDown={() => setPressed('l')}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              className={cn(
                'w-full h-12 rounded-2xl glass-card border border-border font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]',
                pressed === 'l' && 'scale-[0.98]'
              )}
            >
              I'm already a member
            </button>
          </Link>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
            Your crew stays private. Always.
          </p>
        </motion.div>
      </div>
    </div>
  );
}