import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassHeader from '@/components/golf/GlassHeader';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Bell, ShieldCheck, Mail, Lock, User, ChevronLeft, Check, AlertTriangle } from 'lucide-react';
import { buildLabel } from '@/lib/buildInfo';
import { getNotificationPreference, setNotificationPreference } from '@/lib/golfData';
import DeleteAccountSheet from '@/components/golf/DeleteAccountSheet';

// ============================================================
// Settings (Account & Preferences) — private account fields.
//
// All fields save through base44.auth.updateMe(), the platform's
// authorized path for User entity updates. After a successful
// save, refreshUser() updates the cached auth state so changes
// persist across refresh/re-login.
//
// Email and password are authentication credentials managed by
// the platform's auth provider — they are NOT editable here.
// ============================================================

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [displayNamePref, setDisplayNamePref] = useState('username');
  const [pushPref, setPushPref] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setPhone(me.phone || '');
        setHomeCity(me.home_city || '');
        setNotifications(me.notifications !== false);
        setPrivacy(me.privacy !== false);
        setDisplayNamePref(me.display_name_preference || 'username');
      } catch {}
      try {
        const pref = await getNotificationPreference();
        setPushPref(!!pref.push_enabled);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handlePushToggle = async (value) => {
    setPushPref(value);
    setPushSaving(true);
    try {
      await setNotificationPreference(value);
      toast({ title: value ? 'Push notifications enabled' : 'Push notifications disabled' });
    } catch {
      setPushPref(!value);
      toast({ title: 'Could not update preference' });
    }
    setPushSaving(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({
        phone,
        home_city: homeCity,
        notifications,
        privacy,
        display_name_preference: displayNamePref,
      });
      await refreshUser();
      setSaved(true);
      toast({ title: 'Settings saved' });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      toast({ title: 'Could not save settings', description: e?.message });
    }
    setSaving(false);
  };

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center gap-3">
          <button onClick={() => navigate('/profile')} className="text-muted-foreground hover:text-foreground transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[22px] font-extrabold leading-none">Account & Preferences</h1>
        </div>
      </GlassHeader>

      <div className="p-4 space-y-6">

        {/* Email (read-only — auth credential) */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </h2>
          <div>
            <Input value={user?.email || ''} disabled className="h-12 text-base opacity-70" />
            <p className="text-xs text-muted-foreground mt-1">Your email is your login credential. Email changes aren't available in the app.</p>
          </div>
        </section>

        {/* Phone */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Private Contact
          </h2>
          <div>
            <Label className="text-sm text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional — only you can see this" className="mt-2 h-12 text-base" />
          </div>
        </section>

        {/* Location */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Home Area
          </h2>
          <div>
            <Label className="text-sm text-muted-foreground">Home city / ZIP</Label>
            <Input value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="Optional — used to prefill Explore" className="mt-2 h-12 text-base" />
            <p className="text-xs text-muted-foreground mt-1">Location is never requested automatically. You choose it each session.</p>
          </div>
        </section>

        {/* Display name preference */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Public Name</h2>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <div>
              <div className="text-sm">Show as username</div>
              <div className="text-xs text-muted-foreground">Toggle off to show your display name instead</div>
            </div>
            <Switch
              checked={displayNamePref === 'username'}
              onCheckedChange={(v) => setDisplayNamePref(v ? 'username' : 'display_name')}
            />
          </div>
        </section>

        {/* Notifications */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </h2>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <span className="text-sm">Round and tee-time reminders</span>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <div>
              <div className="text-sm">Push notifications</div>
              <div className="text-xs text-muted-foreground mt-0.5">Get notified when verified golf is found near you. Opt-in only — we'll never ask on launch or signup.</div>
            </div>
            <Switch checked={pushPref} onCheckedChange={handlePushToggle} disabled={pushSaving} />
          </div>
        </section>

        {/* Privacy */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy
          </h2>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <div>
              <div className="text-sm">Private account</div>
              <div className="text-xs text-muted-foreground">Only you see your rounds, saved places, and profile.</div>
            </div>
            <Switch checked={privacy} onCheckedChange={setPrivacy} />
          </div>
        </section>

        {/* Authentication */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Authentication
          </h2>
          <div className="rounded-xl bg-card border border-border p-3.5 space-y-1.5">
            <p className="text-sm">Your email and password are managed securely by the platform's auth provider.</p>
            <p className="text-xs text-muted-foreground">To reset your password, sign out and use "Forgot password" on the login screen.</p>
          </div>
        </section>

        {/* Save button */}
        <div className="space-y-2">
          <Button className="w-full h-12" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : saved ? (
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Saved</span>
            ) : 'Save preferences'}
          </Button>
        </div>

        {/* Danger Zone */}
        <section className="space-y-3 pt-4">
          <h2 className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
          </h2>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Delete account</div>
                <div className="text-xs text-muted-foreground mt-0.5">Permanently remove your account and all data.</div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-2 pb-4">
          {buildLabel()}
        </footer>
      </div>
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}