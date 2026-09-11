import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LogOut, Shield, ChevronRight, UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  const handleLogout = () => logout(true);

  return (
    <div className="safe-top px-4 pt-4">
      <header className="mb-5">
        <h1 className="text-2xl font-bold font-heading">Profile</h1>
      </header>

      <div className="flex items-center gap-3 mb-6">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{user?.full_name || 'Golfer'}</h2>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-2">
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 rounded-xl bg-card border border-border p-3.5 text-left active:scale-[0.99] transition"
          >
            <Shield className="h-5 w-5 text-accent" />
            <span className="flex-1 font-medium">Admin Workspace</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <button className="w-full flex items-center gap-3 rounded-xl bg-card border border-border p-3.5 text-left">
          <UserCircle className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 font-medium">Account & Preferences</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <Button variant="secondary" className="w-full h-11 mt-6" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" />Sign out
      </Button>

      <p className="text-center text-xs text-muted-foreground mt-6">Golfolio · Howling Solutions</p>
    </div>
  );
}