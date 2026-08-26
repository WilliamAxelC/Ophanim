import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'parchment' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'parchment',
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('ophanim_theme');
    if (saved === 'dark' || saved === 'parchment') {
      return saved;
    }
    return 'parchment'; // Default: Parchment Ancient Greek Light Beige
  });

  useEffect(() => {
    localStorage.setItem('ophanim_theme', theme);
    const root = document.documentElement;
    if (theme === 'parchment') {
      root.classList.remove('theme-dark', 'dark');
      root.classList.add('theme-parchment');
      root.setAttribute('data-theme', 'parchment');
      document.body.style.backgroundColor = '#f4ece1';
    } else {
      root.classList.remove('theme-parchment');
      root.classList.add('theme-dark', 'dark');
      root.setAttribute('data-theme', 'dark');
      document.body.style.backgroundColor = '#06080d';
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'parchment' ? 'dark' : 'parchment'));
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
