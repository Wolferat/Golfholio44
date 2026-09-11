import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LogOut, Shield, ChevronRight, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassHeader from '@/components/golf/GlassHeader';
import BottomSheet from '@/components/golf/BottomSheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isAdmin = user?.role === 'admin';
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

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

      <div className="px-4 pt-6 pb-5 flex items-center gap-4">
        <Avatar className="h-[72px] w-[72px]">
          <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{user?.full_name || 'Golfer'}</h2>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      <div className="mt-2">
        {isAdmin && <Row icon={Shield} label="Admin Workspace" onClick={() => navigate('/admin')} />}
        <Row icon={UserCircle} label="Account & Preferences" onClick={() => {}} />
      </div>

      <div className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmOpen(true)} className="w-full h-12 rounded-2xl bg-secondary border border-border text-foreground font-medium inline-flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </motion.button>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6 pb-4">Golfholio · Howling Solutions</p>

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