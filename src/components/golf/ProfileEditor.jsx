import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { savePlayerProfile } from '@/lib/golfData';

// ============================================================
// ProfileEditor — edit public player profile fields.
//
// Fields: username, display_name, first_name, last_name, bio
// Username is validated client-side for instant feedback,
// but the server is the authoritative validator.
// ============================================================

export default function ProfileEditor({ open, onClose, profile, onSaved }) {
  const { toast } = useToast();
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);

  // Client-side username preview (server is authoritative)
  const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  const usernameValid = normalizedUsername.length >= 3 && normalizedUsername.length <= 20 && /^[a-z][a-z0-9_]*$/.test(normalizedUsername) && !/_{2,}/.test(normalizedUsername) && !normalizedUsername.endsWith('_');

  const submit = async () => {
    setSaving(true);
    try {
      const data = await savePlayerProfile({
        username,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        bio,
      });
      if (data.error) {
        toast({ title: data.error });
        return;
      }
      toast({ title: 'Profile saved' });
      onSaved(data.profile);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message;
      toast({ title: msg || 'Could not save profile' });
    }
    setSaving(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="88dvh">
      <div className="px-5 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
        <h2 className="text-lg font-bold">Edit your profile</h2>

        {/* Username */}
        <div>
          <Label className="text-xs font-semibold mb-1.5 block">Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="yourname"
            maxLength={20}
            className="h-12"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {username && !usernameValid
              ? '3–20 chars, letters/numbers/underscores, must start with a letter'
              : `Public name: @${normalizedUsername || 'username'}`}
          </p>
        </div>

        {/* Display name */}
        <div>
          <Label className="text-xs font-semibold mb-1.5 block">Display name (optional)</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Shown on your profile and reviews"
            maxLength={60}
            className="h-12"
          />
        </div>

        {/* First + Last name (private) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">First name (private)</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Optional"
              maxLength={40}
              className="h-12"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Last name (private)</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Optional"
              maxLength={40}
              className="h-12"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">Your name is private — only you can see it.</p>

        {/* Bio */}
        <div>
          <Label className="text-xs font-semibold mb-1.5 block">Golf bio (optional)</Label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Share a bit about your game…"
            maxLength={500}
            className="min-h-[80px] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 h-12"
            onClick={submit}
            disabled={saving || !usernameValid}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save profile'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}