<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		apiAuthContext,
		ApiAuthContext,
		type AuthCheckResponse
	} from '$lib/core/GlobalState.svelte';
	import axios from 'axios';
	import { getContext, onMount, setContext } from 'svelte';

	const STORAGE_KEY = 'weebdex_api_token';
	const API_ENDPOINT = 'https://api.weebdex.org/upload/check-approval-required';
	const AUTH_CHECK_ENDPOINT = 'https://api.weebdex.org/auth/check?xhr=1';

	const authContext = getContext(apiAuthContext) as ApiAuthContext;
	if (!authContext) {
		throw new Error(
			'TargetingAuthValidator must be used within a component that provides ApiAuthContext context'
		);
	}

	let clientIdInput = $state('');
	let clientSecretInput = $state('');
	let validated = $state(false);
	let isValidating = $state(false);
	let validationError = $state<string | null>(null);

	onMount(() => {
		if (typeof window !== 'undefined') {
			const storedToken = sessionStorage.getItem(STORAGE_KEY);
			if (storedToken) {
				authContext.apiToken = storedToken;
				// Parse stored token to populate input fields if it's in clientId:clientSecret format
				const parts = storedToken.split(':');
				if (parts.length === 2) {
					clientIdInput = parts[0];
					clientSecretInput = parts[1];
				}
			}
		}

		if (authContext.apiToken) {
			validateApiAccess(authContext.apiToken);
		}
	});

	// Automatically fetch auth check when token becomes available (e.g., from another component)
	$effect(() => {
		const token = authContext.apiToken;
		// Only fetch if we have a token, it's validated, and we don't already have user identity
		if (token && validated && !authContext.userIdentity) {
			fetchAuthCheck(token);
		}
	});

	function setApiToken(token: string | null) {
		authContext.apiToken = token;
		if (typeof window !== 'undefined') {
			if (token) {
				sessionStorage.setItem(STORAGE_KEY, token);
			} else {
				sessionStorage.removeItem(STORAGE_KEY);
			}
		}
	}

	function getAuthHeader(token: string): string {
		// Token is stored as clientId:clientSecret
		return `Bearer ${token}`;
	}

	async function fetchAuthCheck(token: string) {
		try {
			const response = await axios.get<AuthCheckResponse>(AUTH_CHECK_ENDPOINT, {
				headers: {
					Authorization: getAuthHeader(token)
				}
			});

			const parsed = response.data;

			// Validate the structure
			if (!parsed.identity || !parsed.identity.id || !parsed.identity.username) {
				console.error('Invalid auth check response: missing or invalid identity field');
				return;
			}

			// Validate groups structure
			for (const group of parsed.groups ?? []) {
				if (!group.id || !group.name) {
					console.error('Invalid auth check response: groups must have id and name fields');
					return;
				}
				if (!group.relationships || !Array.isArray(group.relationships.members)) {
					console.error(
						'Invalid auth check response: groups must have relationships.members array'
					);
					return;
				}
			}

			// Set the user info
			authContext.userIdentity = parsed.identity;
			authContext.userGroups = parsed.groups ?? [];
		} catch (error) {
			// Silently fail - auth check is not critical for the validation flow
			console.error('Failed to fetch auth check:', error);
		}
	}

	async function validateApiAccess(token: string | null) {
		if (!token) {
			validationError = 'Please enter a client ID and secret';
			return;
		}

		isValidating = true;
		validationError = null;

		try {
			const response = await axios.post(
				API_ENDPOINT,
				{
					language: 'en'
				},
				{
					headers: {
						Authorization: getAuthHeader(token)
					}
				}
			);

			if (response.status === 204) {
				// user is approved for uploads
				setApiToken(token);
				validated = true;
				validationError = null;
				// Automatically fetch auth check data
				await fetchAuthCheck(token);
			} else if (response.status === 200) {
				// approval required, let's not spam the approval queue
				validationError =
					'You do not yet have any uploaded chapters. Please manually upload your first chapter and wait for approval';
				setApiToken(null);
				validated = false;
				// Clear user info on validation failure
				authContext.userIdentity = null;
				authContext.userGroups = [];
			} else {
				validationError = `Validation failed: ${response.status} ${response.statusText}`;
				setApiToken(null);
				validated = false;
				// Clear user info on validation failure
				authContext.userIdentity = null;
				authContext.userGroups = [];
			}
		} catch (error) {
			validationError = error instanceof Error ? error.message : 'Failed to validate API access';
			setApiToken(null);
			validated = false;
			// Clear user info on error
			authContext.userIdentity = null;
			authContext.userGroups = [];
		} finally {
			isValidating = false;
		}
	}

	function reset() {
		setApiToken(null);
		clientIdInput = '';
		clientSecretInput = '';
		validationError = null;
		validated = false;
		// Clear user info on reset
		authContext.userIdentity = null;
		authContext.userGroups = [];
	}

	function buildTokenFromInputs(): string | null {
		const clientId = clientIdInput.trim();
		const clientSecret = clientSecretInput.trim();
		if (!clientId || !clientSecret) {
			return null;
		}
		return `${clientId}:${clientSecret}`;
	}
</script>

<div class="flex flex-col gap-2 p-4 bg-surface rounded-lg">
	<h2 class="text-xl font-semibold text-app">API Authentication</h2>

	{#if validated === true}
		<div class="flex flex-row gap-2 items-center">
			<p class="text-app">API access validated successfully</p>
			<button
				disabled={isValidating}
				class="clickable-hint p-2 rounded-md"
				type="button"
				onclick={reset}>Reset Credentials</button
			>
		</div>
	{:else}
		<p class="text-app">
			Enter your client ID and secret to validate your access to the WeebDex API.
		</p>

		<a href={`${resolve('/docs')}#api-token-where`} class="text-sm text-muted link-primary w-fit">
			If you're having trouble, click here for the relevant tutorial & docs section (opens in new
			tab).
			<span class="text-muted w-4 h-4 i-mdi-arrow-top-right inline-block align-middle"></span>
		</a>

		<div class="flex flex-col gap-2 w-full">
			<div class="flex flex-row gap-2 w-full items-center">
				<label for="client-id-input" class="text-app">Client ID:</label>
				<input
					id="client-id-input"
					type="text"
					bind:value={clientIdInput}
					disabled={isValidating}
					placeholder="Enter your client ID"
					class="input-base grow-1"
				/>
			</div>
			<div class="flex flex-row gap-2 w-full items-center">
				<label for="client-secret-input" class="text-app">Client Secret:</label>
				<input
					id="client-secret-input"
					type="password"
					bind:value={clientSecretInput}
					disabled={isValidating}
					placeholder="Enter your client secret"
					class="input-base grow-1"
				/>
			</div>

			<a
				href="https://weebdex.org/settings/client"
				target="_blank"
				class="text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 w-fit"
			>
				Create a new client ID and secret (you need to be logged in to Weebdex)
				<span class="w-4 h-4 i-mdi-arrow-top-right inline-block align-middle"></span>
			</a>
		</div>

		<button
			disabled={isValidating}
			class="clickable-hint p-2 rounded-md"
			type="button"
			onclick={() => validateApiAccess(buildTokenFromInputs())}>Validate API Access</button
		>

		{#if validationError}
			<p class="text-red-500 dark:text-red-400">{validationError}</p>
		{/if}

		{#if isValidating}
			<p class="text-app">Validating...</p>
		{/if}
	{/if}
</div>
