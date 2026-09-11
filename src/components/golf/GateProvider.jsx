import { createContext, useContext, useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import SignUpPrompt from './SignUpPrompt';

const GateContext = createContext(null);

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) return { gate: (cb) => cb && cb(), isAuthed: true };
  return ctx;
}

export default function GateProvider() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  const gate = useCallback((action) => {
    if (isAuthenticated) {
      if (action) action();
    } else {
      setOpen(true);
    }
  }, [isAuthenticated]);

  return (
    <GateContext.Provider value={{ gate, isAuthed: isAuthenticated }}>
      <Outlet />
      <SignUpPrompt open={open} onClose={() => setOpen(false)} />
    </GateContext.Provider>
  );
}