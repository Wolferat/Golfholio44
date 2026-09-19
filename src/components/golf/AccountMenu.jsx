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
import { User, Settings as SettingsIcon, Flag, Bookmark, LogOut, Shield, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

export default function AccountMenu({ initials }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    setSigningOut(true);
    await base44.auth.logout();
    window.location.href = '/login';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 grid place-items-center text-sm font-bold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal truncate">{user?.email || 'Account'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <User className="h-4 w-4 mr-2" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <SettingsIcon className="h-4 w-4 mr-2" /> Account & Preferences
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/play')}>
          <Flag className="h-4 w-4 mr-2" /> My Game
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/saved')}>
          <Bookmark className="h-4 w-4 mr-2" /> Saved places
        </DropdownMenuItem>
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
  );
}