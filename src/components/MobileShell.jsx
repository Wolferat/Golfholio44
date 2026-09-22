import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Compass, Flag, CalendarClock, Users, User } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGate } from '@/components/golf/GateProvider';
import { NavVisibilityProvider, useNavVisibility } from '@/components/golf/NavVisibilityContext';
import DesktopNav from '@/components/golf/DesktopNav';

const TABS = [
  { to: '/', label: 'Courses', icon: Compass, end: true },
  { to: '/play', label: 'Play', icon: Flag, end: false },
  { to: '/tee-times', label: 'Tee Times', icon: CalendarClock, end: false },
  { to: '/crew', label: 'Crew', icon: Users, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
];

function Shell() {
  const location = useLocation();
  const { gate, isAuthed } = useGate();
  const { hidden: navHidden } = useNavVisibility();
  const reduceMotion = useReducedMotion();
  return (
    <div className="min-h-dvh bg-background">
      <DesktopNav />
      <div className="md:flex md:items-start md:justify-center">
        <div className="w-full max-w-2xl mx-auto min-h-dvh relative">
          <main className="pb-nav md:pb-10">
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <Outlet />
            </motion.div>
          </main>
          <nav
            className={cn(
              'fixed bottom-0 inset-x-0 z-50 md:hidden transition-opacity',
              navHidden && 'hidden'
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="max-w-2xl mx-auto glass border-t border-border grid grid-cols-5 h-16">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  onClick={(e) => {
                    if (t.to !== '/' && !isAuthed) {
                      e.preventDefault();
                      gate();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1 no-tap-highlight"
                >
                  {({ isActive }) => (
                    <>
                      <div className="relative h-7 w-16 grid place-items-center">
                        {isActive && (
                          <motion.div
                            layoutId="tabPill"
                            className="absolute inset-x-2 inset-y-0 rounded-full bg-primary/15"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <motion.div
                          animate={{ scale: isActive ? 1.15 : 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                          className="relative"
                        >
                          <t.icon
                            className={cn('h-[22px] w-[22px]', isActive ? 'text-primary' : 'text-muted-foreground')}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                        </motion.div>
                      </div>
                      <span className={cn('text-[10px] tracking-tight', isActive ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                        {t.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function MobileShell() {
  return (
    <NavVisibilityProvider>
      <Shell />
    </NavVisibilityProvider>
  );
}