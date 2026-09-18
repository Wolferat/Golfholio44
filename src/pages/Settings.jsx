import { useEffect, useState } from 'react';
import GlassHeader from '@/components/golf/GlassHeader';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Bell, ShieldCheck } from 'lucide-react';
import { buildLabel } from '@/lib/buildInfo';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setPhone(me.phone || '');
        setHomeCity(me.home_city || '');
        setNotifications(me.notifications !== false);
        setPrivacy(me.privacy !== false);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ phone, home_city, notifications, privacy });
      toast({ title: 'Settings saved' });
    } catch {
      toast({ title: 'Could not save settings' });
    }
    setSaving(false);
  };

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold leading-none">Settings</h1>
        </div>
      </GlassHeader>

      <div className="p-4 space-y-6">
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Profile</h2>
          <div>
            <Label className="text-sm text-muted-foreground">Name</Label>
            <Input value={user?.full_name || ''} disabled className="mt-2 h-12 text-base opacity-70" />
            <p className="text-xs text-muted-foreground mt-1">Your name is set on your Profile page.</p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="mt-2 h-12 text-base" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Location
          </h2>
          <div>
            <Label className="text-sm text-muted-foreground">Home city / ZIP</Label>
            <Input value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="Optional — used to prefill Explore" className="mt-2 h-12 text-base" />
            <p className="text-xs text-muted-foreground mt-1">Location is never requested automatically. You choose it each session.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </h2>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <span className="text-sm">Tee-time and round reminders</span>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy
          </h2>
          <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3.5">
            <div>
              <div className="text-sm">Private account</div>
              <div className="text-xs text-muted-foreground">Only you see your rounds and saved places.</div>
            </div>
            <Switch checked={privacy} onCheckedChange={setPrivacy} />
          </div>
        </section>

        <Button className="w-full h-12" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>

        <footer className="text-center text-xs text-muted-foreground pt-4 pb-2">
          {buildLabel()} · Preview build
        </footer>
      </div>
    </div>
  );
}