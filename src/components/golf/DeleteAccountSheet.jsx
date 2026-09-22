import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import BottomSheet from '@/components/golf/BottomSheet';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function DeleteAccountSheet({ open, onClose }) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke('deleteAccount', {});
      await base44.auth.logout();
      window.location.href = '/login';
    } catch (e) {
      toast({ title: 'Could not delete account', description: e?.message });
      setDeleting(false);
      setConfirming(false);
    }
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirming(false);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="p-5 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-full bg-destructive/15 grid place-items-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold leading-tight">Delete account</h2>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Deleting your account will permanently remove:</p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">•</span><span>All your logged rounds and scorecards</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">•</span><span>Saved places and favorites</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">•</span><span>Your player profile, reviews, and photos</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">•</span><span>Crew connections and notifications</span></li>
          </ul>
          <p className="text-foreground font-medium pt-1">Your email and login will stop working. You can sign up again, but your data won't be recoverable.</p>
        </div>

        {!confirming ? (
          <Button variant="destructive" className="w-full h-12 mt-5" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" /> I understand, continue
          </Button>
        ) : (
          <div className="space-y-2 mt-5">
            <p className="text-center text-sm font-semibold text-destructive">Are you absolutely sure?</p>
            <Button variant="destructive" className="w-full h-12" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting account…' : 'Yes, delete my account'}
            </Button>
            <Button variant="ghost" className="w-full h-11" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}