import { defineConfig, presetIcons, presetWind4 } from 'unocss';
import extractorSvelte from '@unocss/extractor-svelte';

export default defineConfig({
	presets: [
		presetWind4({
			dark: 'class',
			preflights: {
				theme: true
			}
		}),
		presetIcons()
	],
	shortcuts: [
		// Existing shortcuts
		[
			'clickable-hint',
			'cursor-pointer bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors'
		],

		// App-level colors
		['bg-app', 'bg-gray-50 dark:bg-gray-900'],
		['bg-surface', 'bg-white dark:bg-gray-800'],
		['bg-surface-hover', 'bg-gray-100 dark:bg-gray-700'],
		['text-app', 'text-gray-900 dark:text-gray-100'],
		['text-muted', 'text-gray-600 dark:text-gray-400'],

		// Button base styles
		['btn-base', 'cursor-pointer disabled:cursor-not-allowed p-2 rounded-md transition-colors'],
		['btn-ghost', 'btn-base bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800'],

		// Button variants
		[
			'btn-primary',
			'btn-base bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500 text-white'
		],
		[
			'btn-primary-active',
			'btn-base bg-blue-300 hover:bg-blue-200 dark:bg-blue-600 dark:hover:bg-blue-500 text-app'
		],
		[
			'btn-neutral',
			'btn-base bg-gray-300 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-app'
		],
		[
			'btn-success',
			'btn-base bg-green-500 hover:bg-green-600 dark:bg-green-400 dark:hover:bg-green-500 text-white'
		],
		[
			'btn-danger',
			'btn-base bg-red-500 hover:bg-red-600 dark:bg-red-400 dark:hover:bg-red-500 text-white'
		],

		// Link styles
		[
			'link-primary',
			'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
		],

		// Border styles
		['border-surface', 'border-gray-300 dark:border-gray-600'],
		['border-muted', 'border-gray-200 dark:border-gray-700'],

		// Input styles
		['input-base', 'border border-surface rounded-md p-1 bg-surface text-app']
	],
	extractors: [extractorSvelte()]
});
