import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const ACTION_WIDTH = 88;

export default function SwipeRow({ children, actionLabel, actionIcon: Icon, onAction, actionColor = 'bg-destructive' }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(null);
  const moved = useRef(false);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; moved.current = false; };
  const onTouchMove = (e) => {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    setOffset(Math.max(-ACTION_WIDTH, Math.min(0, delta)));
  };
  const onTouchEnd = () => {
    setOffset(offset < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
    startX.current = null;
  };

  return (
    <div className="relative overflow-hidden">
      <button
        onClick={() => { if (!moved.current) onAction(); }}
        className={cn('absolute top-0 right-0 h-full w-[88px] flex flex-col items-center justify-center gap-1 text-white', actionColor)}
      >
        <Icon className="h-5 w-5" />
        <span className="text-[11px] font-medium">{actionLabel}</span>
      </button>
      <motion.div
        animate={{ x: offset }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}