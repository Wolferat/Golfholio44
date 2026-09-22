import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';

export default function SignUpPrompt({ open, onClose }) {
  const navigate = useNavigate();
  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="60dvh">
      <div className="p-5 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 grid place-items-center mb-3">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-extrabold text-center tracking-tight leading-tight">
          Join to save, play, and build your crew
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-2 leading-relaxed">
          Create a free account to save courses, start rounds, schedule tee times, and connect with your golf crew.
        </p>
        <div className="mt-5 space-y-2.5">
          <Button className="h-12 w-full rounded-2xl text-sm font-semibold" onClick={() => navigate('/register')}>
            Sign up
          </Button>
          <button
            onClick={() => navigate('/login')}
            className="w-full h-11 rounded-2xl text-sm font-semibold text-muted-foreground hover:text-foreground transition"
          >
            Already a member? Log in
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}