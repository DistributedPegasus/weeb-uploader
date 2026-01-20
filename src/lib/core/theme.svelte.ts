type ThemeMode = 'light' | 'dark' | 'system';
type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'weebdex-theme';

function getSystemTheme(): EffectiveTheme {
	if (typeof window === 'undefined') return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode | null {
	if (typeof window === 'undefined') return null;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark' || stored === 'system') {
		return stored;
	}
	return null;
}

function resolveEffectiveTheme(mode: ThemeMode): EffectiveTheme {
	if (mode === 'system') {
		return getSystemTheme();
	}
	return mode;
}

function applyTheme(effectiveTheme: EffectiveTheme) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	if (effectiveTheme === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
}

class ThemeStore {
	private _themeMode = $state<ThemeMode>('system');
	private _mediaQuery: MediaQueryList | null = null;

	constructor() {
		if (typeof window === 'undefined') return;

		// Initialize from storage or system preference
		const stored = getStoredTheme();
		this._themeMode = stored ?? 'system';

		// Apply initial theme
		applyTheme(this.effectiveTheme);

		// Listen for system preference changes when in system mode
		this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this._mediaQuery.addEventListener('change', this._handleSystemThemeChange);
	}

	private _handleSystemThemeChange = () => {
		if (this._themeMode === 'system') {
			applyTheme(this.effectiveTheme);
		}
	};

	get themeMode(): ThemeMode {
		return this._themeMode;
	}

	get effectiveTheme(): EffectiveTheme {
		return resolveEffectiveTheme(this._themeMode);
	}

	setTheme(mode: ThemeMode) {
		this._themeMode = mode;
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, mode);
		}
		applyTheme(this.effectiveTheme);
	}

	toggleTheme() {
		const currentEffective = this.effectiveTheme;
		if (currentEffective === 'dark') {
			this.setTheme('light');
		} else {
			this.setTheme('dark');
		}
	}

	destroy() {
		if (this._mediaQuery) {
			this._mediaQuery.removeEventListener('change', this._handleSystemThemeChange);
		}
	}
}

// Create a singleton instance
let themeStoreInstance: ThemeStore | null = null;

export function getThemeStore(): ThemeStore {
	if (!themeStoreInstance) {
		themeStoreInstance = new ThemeStore();
	}
	return themeStoreInstance;
}
