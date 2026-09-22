import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { User, Settings as SettingsIcon, Flag, Bookmark, LogOut, Shield, Building2, Bell } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const MENU_ITEMS = [
  { icon: User, label: 'Profile', to: '/profile' },
  { icon: SettingsIcon, label: 'Account & Preferences', to: '/settings' },
  { icon: Flag, label: 'My Game', to: '/play' },
  { icon: Bookmark, label: 'Saved places', to: '/saved' },
  { icon: Bell, label: 'Notifications', to: '/notifications' },
];

const TRIGGER_CLASS = 'h-9 w-9 rounded-full bg-primary/15 border border-primary/40 grid place-items-center text-sm font-bold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function AccountMenu({ initials }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    setSigningOut(true);
    setDrawerOpen(false);
    await base44.auth.logout();
    window.location.href = '/login';
  };

  const go = (path) => {
    setDrawerOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Mobile: native-feeling bottom-sheet Drawer */}
      <button
        onClick={() => setDrawerOpen(true)}
        className={cn(TRIGGER_CLASS, 'md:hidden')}
        aria-label="Account menu"
      >
        {initials}
      </button>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-w-2xl mx-auto">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="truncate">{user?.email || 'Account'}</DrawerTitle>
            <DrawerDescription>Manage your account and preferences</DrawerDescription>
          </DrawerHeader>
          <div className="px-2 pb-6 space-y-1">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.to}
                onClick={() => go(item.to)}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-secondary active:bg-secondary/70 text-sm font-medium transition"
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                {item.label}
              </button>
            ))}
            {isAdmin && <div className="h-px bg-border my-1" />}
            {isAdmin && (
              <button
                onClick={() => go('/admin')}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-secondary active:bg-secondary/70 text-sm font-medium transition"
              >
                <Shield className="h-5 w-5 text-muted-foreground" />
                Admin
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => go('/admin')}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-secondary active:bg-secondary/70 text-sm font-medium transition"
              >
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Company Settings
              </button>
            )}
            <div className="h-px bg-border my-1" />
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-destructive/10 active:bg-destructive/15 text-sm font-medium text-destructive transition disabled:opacity-50"
            >
              <LogOut className="h-5 w-5" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Desktop: Radix DropdownMenu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(TRIGGER_CLASS, 'hidden md:grid')} aria-label="Account menu">
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal truncate">{user?.email || 'Account'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MENU_ITEMS.map((item) => (
            <DropdownMenuItem key={item.to} onClick={() => navigate(item.to)}>
              <item.icon className="h-4 w-4 mr-2" /> {item.label}
            </DropdownMenuItem>
          ))}
          {isAdmin && <DropdownMenuSeparator />}
          {isAdmin && (
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Shield className="h-4 w-4 mr-2" /> Admin
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Building2 className="h-4 w-4 mr-2" /> Company Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} disabled={signingOut}>
            <LogOut className="h-4 w-4 mr-2" /> {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}