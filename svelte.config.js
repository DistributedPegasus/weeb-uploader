import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess({ script: true }),
	compilerOptions: {
		runes: true
	},
	kit: {
		adapter: adapter(),
		paths: {
			base: process.env.GITHUB_PAGES ? '/weeb-uploader' : ''
		}
	}
};

export default config;
