import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LogOut, Shield, ChevronRight, UserCircle, Camera, Pencil, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassHeader from '@/components/golf/GlassHeader';
import BottomSheet from '@/components/golf/BottomSheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import HandicapEstimateCard from '@/components/golf/HandicapEstimateCard';
import ProfileEditor from '@/components/golf/ProfileEditor';
import AvatarPicker from '@/components/golf/AvatarPicker';
import { getMyProfileEntity, getPublicProfile, savePlayerProfile } from '@/lib/golfData';
import { DEFAULT_AVATARS } from '@/lib/defaultAvatars';
import { cn } from '@/lib/utils';

// ============================================================
// Profile — public player profile + account hub.
//
// Shows the player's avatar, username, display name, and bio.
// "Edit Profile" opens a bottom sheet with the ProfileEditor.
// "Change Avatar" opens a bottom sheet with the AvatarPicker.
// "Account & Preferences" navigates to /settings.
//
// The avatar is loaded via getPlayerProfile which returns a
// time-limited signed URL for uploaded avatars (never the raw
// private file URI).
// ============================================================

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [entity, pub] = await Promise.all([
        getMyProfileEntity(),
        getPublicProfile({ user_id: user.id }),
      ]);
      setProfile(entity);
      setAvatarUrl(pub?.avatar_url || null);
    } catch {}
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleProfileSaved = (updated) => {
    setProfile({ ...profile, ...updated });
    setEditorOpen(false);
    loadProfile();
  };

  const handleAvatarSaved = async (avatarData) => {
    try {
      const data = await savePlayerProfile({
        username: profile?.username || user?.email?.split('@')[0] || 'golfer',
        display_name: profile?.display_name || '',
        first_name: profile?.first_name || '',
        last_name: profile?.last_name || '',
        bio: profile?.bio || '',
        ...avatarData,
      });
      if (data.error) return;
      setAvatarPickerOpen(false);
      loadProfile();
    } catch {}
  };

  const displayName = profile?.display_name || profile?.username || user?.full_name || 'Golfer';
  const displaySub = profile ? `@${profile.username}` : 'No profile yet';
  const avatarSource = profile?.avatar_source || 'initials';
  const avatarDefaultUrl = avatarSource === 'default' && profile?.avatar_default_id
    ? DEFAULT_AVATARS.find((a) => a.id === profile.avatar_default_id)?.url
    : null;
  const showAvatarUrl = avatarSource === 'upload' ? avatarUrl : avatarDefaultUrl;

  const Row = ({ icon: Icon, label, onClick }) => (
    <motion.button whileTap={{ scale: 0.985 }} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-4 border-b border-border text-left">
      <Icon className="h-5 w-5 text-accent" />
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </motion.button>
  );

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center">
          <h1 className="text-[22px] font-extrabold">Profile</h1>
        </div>
      </GlassHeader>

      {/* Avatar + identity */}
      <div className="px-4 pt-6 pb-5 flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-[72px] w-[72px]">
            {showAvatarUrl ? (
              <img src={showAvatarUrl} alt={displayName} className="h-full w-full object-cover rounded-full" />
            ) : (
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">{initials}</AvatarFallback>
            )}
          </Avatar>
          <button
            onClick={() => setAvatarPickerOpen(true)}
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-background"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold truncate">{displayName}</h2>
          <p className="text-sm text-muted-foreground truncate">{displaySub}</p>
        </div>
        <Button variant="secondary" size="sm" className="h-9 shrink-0" onClick={() => setEditorOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      {/* Bio */}
      {profile?.bio && (
        <div className="px-4 pb-2">
          <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
        </div>
      )}

      {/* No profile prompt */}
      {!loading && !profile && (
        <div className="px-4 py-3">
          <div className="rounded-xl bg-secondary/50 border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">Create your player profile to join the Golfholio community.</p>
            <Button className="h-11" onClick={() => setEditorOpen(true)}>Create profile</Button>
          </div>
        </div>
      )}

      {/* Navigation rows */}
      <div className="mt-2">
        {isAdmin && <Row icon={Shield} label="Admin Workspace" onClick={() => navigate('/admin')} />}
        <Row icon={UserCircle} label="Account & Preferences" onClick={() => navigate('/settings')} />
      </div>

      {/* Handicap estimate */}
      <div className="px-4 mt-4">
        <HandicapEstimateCard />
      </div>

      {/* Sign out */}
      <div className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmOpen(true)} className="w-full h-12 rounded-2xl bg-secondary border border-border text-foreground font-medium inline-flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </motion.button>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6 pb-4">Golfholio · Howling Solutions</p>

      {/* Bottom sheets */}
      <ProfileEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        profile={profile}
        onSaved={handleProfileSaved}
      />
      <AvatarPicker
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentSource={avatarSource}
        currentDefaultId={profile?.avatar_default_id}
        onSave={handleAvatarSaved}
      />

      {/* Sign out confirmation */}
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} maxHeight="50dvh">
        <div className="p-5 pb-nav">
          <h2 className="text-lg font-bold">Sign out?</h2>
          <p className="text-sm text-muted-foreground mt-1">You'll need to sign back in to access your rounds and crew.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="secondary" className="flex-1 h-12" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1 h-12" onClick={() => logout(true)}>Sign out</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}