import { NavLink } from 'react-router-dom';
import { Compass, Flag, CalendarClock, Users, Bookmark } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/', label: 'Explore', icon: Compass, end: true },
  { to: '/play', label: 'Play', icon: Flag, end: false },
  { to: '/tee-times', label: 'Tee Times', icon: CalendarClock, end: false },
  { to: '/crew', label: 'Crew', icon: Users, end: false },
  { to: '/saved', label: 'Saved', icon: Bookmark, end: false },
];

export default function DesktopNav() {
  const { user } = useAuth();
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();
  return (
    <header className="hidden md:flex sticky top-0 z-50 h-16 items-center justify-between px-6 glass border-b border-border safe-top">
      <div className="flex items-center gap-8">
        <span className="text-lg font-extrabold tracking-tight">Golfholio</span>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
                  isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )
              }
            >
              <l.icon className="h-4 w-4" /> {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <AccountMenu initials={initials} />
    </header>
  );
}