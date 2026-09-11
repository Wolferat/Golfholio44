import { Outlet, NavLink } from 'react-router-dom';
import { Compass, Bookmark, Flag, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/', label: 'Explore', icon: Compass, end: true },
  { to: '/saved', label: 'Saved', icon: Bookmark, end: false },
  { to: '/my-game', label: 'My Game', icon: Flag, end: false },
  { to: '/crew', label: 'Crew', icon: Users, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
];

export default function MobileShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto pb-nav">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/90 backdrop-blur-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-md mx-auto grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 no-tap-highlight transition-colors',
                  isActive ? 'text-accent' : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.4 : 2} />
                  <span className={cn('text-[10px] font-medium tracking-tight', isActive && 'text-foreground')}>
                    {t.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}