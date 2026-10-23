import { createContext, useContext } from 'react';

// The provider lives in ThemeProvider.jsx, so each file exports only one kind
// of thing — Fast Refresh needs it. The same split as MessageContext.
export const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);
