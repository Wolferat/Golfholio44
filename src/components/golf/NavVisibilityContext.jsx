import { createContext, useContext, useState } from 'react';

const NavVisibilityContext = createContext({ hidden: false, setHidden: () => {} });

export function NavVisibilityProvider({ children }) {
  const [hidden, setHidden] = useState(false);
  return (
    <NavVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </NavVisibilityContext.Provider>
  );
}

export const useNavVisibility = () => useContext(NavVisibilityContext);