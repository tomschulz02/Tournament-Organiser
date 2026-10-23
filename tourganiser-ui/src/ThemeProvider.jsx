import { useState, useEffect } from 'react';
import { ThemeContext } from './ThemeContext';

// The starting theme is already on <body>: an inline script in index.html sets
// it before the first paint, from the saved choice or the system preference.
// Reading it back here means React starts on the same theme instead of
// starting light and switching in an effect, which flashed light on every load
// for dark-mode readers. The fallback repeats that script's rule in case the
// class is missing.
function initialTheme() {
	if (document.body.classList.contains('dark')) return 'dark';
	if (document.body.classList.contains('light')) return 'light';

	try {
		const saved = localStorage.getItem('theme');
		if (saved === 'light' || saved === 'dark') return saved;
	} catch {
		// Storage can be blocked; the system preference still applies.
	}

	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeProvider = ({ children }) => {
	const [theme, setTheme] = useState(initialTheme);

	// Keeps <body> in step with the state. classList rather than className, which
	// would also wipe other classes on <body> such as a modal's noscroll.
	useEffect(() => {
		document.body.classList.remove('light', 'dark');
		document.body.classList.add(theme);
	}, [theme]);

	const toggleTheme = () => {
		const newTheme = theme === 'light' ? 'dark' : 'light';
		setTheme(newTheme);
		try {
			localStorage.setItem('theme', newTheme);
		} catch {
			// Not saved, but the switch still applies for this visit.
		}
	};

	return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};
