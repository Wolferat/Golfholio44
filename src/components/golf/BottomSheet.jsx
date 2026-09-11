import { motion, AnimatePresence } from 'framer-motion';

export default function BottomSheet({ open, onClose, children, maxHeight = '88dvh' }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md mt-auto bg-card rounded-t-[24px] border-t border-border overflow-y-auto no-scrollbar"
            style={{ maxHeight }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1.5 bg-card rounded-t-[24px]">
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}