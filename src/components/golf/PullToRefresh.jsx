import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children, className }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);

  const onTouchStart = (e) => {
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  };

  const onTouchMove = (e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.45, 110));
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
    startY.current = null;
  };

  return (
    <div className={className} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <motion.div
        animate={{ y: refreshing ? THRESHOLD : pull }}
        transition={refreshing ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 grid place-items-center overflow-hidden"
          style={{ top: -THRESHOLD, height: THRESHOLD, width: THRESHOLD }}
        >
          <Loader2
            className={cn('h-6 w-6 text-accent', refreshing ? 'animate-spin' : '')}
            style={{ transform: `scale(${Math.min(pull / THRESHOLD, 1)})`, opacity: refreshing ? 1 : Math.min(pull / THRESHOLD, 1) }}
          />
        </div>
        {children}
      </motion.div>
    </div>
  );
}