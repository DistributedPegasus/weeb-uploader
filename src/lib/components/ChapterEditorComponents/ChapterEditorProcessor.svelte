<script lang="ts">
	import { getContext } from 'svelte';
	import type { ChapterEditorState, ApiChapter } from '$lib/core/ChapterEditorState.svelte';
	import { ProcessingStep } from '$lib/core/ChapterEditorState.svelte';
	import { getMangaChapters } from '../TargetingComponents/TargetingState.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import { updateChapter, deleteChapter } from '../TargetingComponents/TargetingState.svelte';

	interface Props {
		editorState: ChapterEditorState;
		availableGroups: ScanGroup[];
	}

	let { editorState, availableGroups = $bindable<ScanGroup[]>([]) }: Props = $props();

	const authContext = getContext<ApiAuthContext>(apiAuthContext);
	if (!authContext) {
		throw new Error(
			'ChapterEditorProcessor must be used within a component that provides ApiAuthContext context'
		);
	}

	let lastProcessedSeriesId = $state<string | null>(null);
	let lastPermissionOverride = $state<boolean>(false);

	/**
	 * Checks if the user has access to edit a chapter.
	 * User has access if:
	 * - Permission override is enabled, OR
	 * - They are the uploader of the chapter, OR
	 * - They are a leader or officer of a group assigned to the chapter
	 */
	function userHasAccessToChapter(chapter: ApiChapter): boolean {
		// If permission override is enabled, allow access to all chapters
		if (editorState.permissionOverride) {
			return true;
		}

		// If user info isn't loaded yet, don't show any chapters
		if (!authContext.userIdentity) {
			return false;
		}

		const userId = authContext.userIdentity.id;

		// Check if user is the uploader
		if (chapter.relationships?.uploader?.id === userId) {
			return true;
		}

		// Check if user is a leader or officer of any group assigned to the chapter
		const chapterGroups = chapter.relationships?.groups;
		if (!chapterGroups || !Array.isArray(chapterGroups)) {
			return false;
		}

		const chapterGroupIds = new Set(chapterGroups.map((g) => g.id));

		// Ensure userGroups is an array
		if (!authContext.userGroups || !Array.isArray(authContext.userGroups)) {
			return false;
		}

		for (const userGroup of authContext.userGroups) {
			if (chapterGroupIds.has(userGroup.id)) {
				// Check if user is leader or officer in this group
				const members = userGroup.relationships?.members;
				if (!members || !Array.isArray(members)) {
					continue;
				}
				const userMember = members.find((m) => m.id === userId);
				if (userMember && (userMember.is_leader || userMember.is_officer)) {
					return true;
				}
			}
		}

		return false;
	}

	// Main processing pipeline - single effect that orchestrates everything
	// This effect is reactive to: editorState.seriesId, authContext.apiToken, authContext.userIdentity, and editorState.permissionOverride
	$effect(() => {
		(async () => {
			// Track reactive values to ensure effect re-runs when they change
			const currentSeriesId = editorState.seriesId;
			const currentApiToken = authContext.apiToken;
			const currentUserIdentity = authContext.userIdentity;
			const currentPermissionOverride = editorState.permissionOverride; // Track override state

			// Only process if we have a series ID and API token
			if (!currentSeriesId || !currentApiToken) {
				// Reset if we don't have requirements
				if (lastProcessedSeriesId !== null) {
					editorState.chapters = [];
					editorState.filteredChaptersCount = 0;
					editorState.processingStep = ProcessingStep.IDLE;
					lastProcessedSeriesId = null;
				}
				return;
			}

			// Reload if series ID changed, permission override changed, or we haven't processed this one yet
			// Also reload if user identity changed (auth data was loaded/updated)
			const seriesChanged = currentSeriesId !== lastProcessedSeriesId;
			const permissionOverrideChanged = currentPermissionOverride !== lastPermissionOverride;
			const needsReload =
				seriesChanged || permissionOverrideChanged || lastProcessedSeriesId === null;

			if (!needsReload) {
				return;
			}

			await runProcessingPipeline();
			lastPermissionOverride = currentPermissionOverride;
		})();
	});

	async function runProcessingPipeline() {
		if (!editorState.seriesId || !authContext.apiToken) {
			return;
		}

		editorState.processingStep = ProcessingStep.LOADING;
		editorState.loadError = null;

		try {
			// Step 1: Load all chapters from API
			const chapters = await getMangaChapters(editorState.seriesId);
			const totalChapters = chapters.length;

			// Step 2: Filter chapters based on user access (unless override is enabled)
			const accessibleChapters = chapters.filter((chapter) => userHasAccessToChapter(chapter));

			// Track how many chapters were filtered out (only if override is disabled)
			if (editorState.permissionOverride) {
				editorState.filteredChaptersCount = 0;
			} else {
				editorState.filteredChaptersCount = totalChapters - accessibleChapters.length;
			}

			// Step 3: Convert API chapters to EditableChapter format
			const editableChapters = accessibleChapters.map((chapter) => ({
				id: chapter.id,
				original: chapter,
				modified: {},
				isModified: false,
				saveStatus: 'pending' as const,
				error: undefined
			}));

			editorState.chapters = editableChapters;

			// Step 4: Extract unique groups from accessible chapters
			// If override is enabled, extract from all chapters; otherwise use accessible chapters
			const chaptersToExtractGroups = editorState.permissionOverride
				? chapters
				: accessibleChapters;
			const groupMap = new Map<string, ScanGroup>();
			for (const chapter of chaptersToExtractGroups) {
				if (chapter?.relationships?.groups && Array.isArray(chapter.relationships.groups)) {
					for (const group of chapter.relationships.groups) {
						if (group?.id && group?.name && !groupMap.has(group.id)) {
							const scanGroup = new ScanGroup();
							scanGroup.groupId = group.id;
							scanGroup.groupName = group.name;
							groupMap.set(group.id, scanGroup);
						}
					}
				}
			}
			availableGroups = Array.from(groupMap.values());

			editorState.processingStep = ProcessingStep.LOADED;
			lastProcessedSeriesId = editorState.seriesId;
			lastPermissionOverride = editorState.permissionOverride;
		} catch (error) {
			editorState.processingStep = ProcessingStep.ERROR;
			editorState.loadError = error instanceof Error ? error.message : 'Failed to load chapters';
			console.error('Error loading chapters:', error);
		}
	}

	export async function saveAllModified() {
		if (!authContext.apiToken) {
			alert('No API token available');
			return;
		}

		const modifiedChapters = editorState.getModifiedChapters();
		if (modifiedChapters.length === 0) {
			alert('No modified chapters to save');
			return;
		}

		editorState.processingStep = ProcessingStep.SAVING;
		editorState.isSavingAll = true;
		editorState.saveProgress = { current: 0, total: modifiedChapters.length };

		let successCount = 0;
		let errorCount = 0;

		for (let i = 0; i < modifiedChapters.length; i++) {
			const chapter = modifiedChapters[i];
			editorState.saveProgress = { current: i + 1, total: modifiedChapters.length };

			try {
				const updateData = editorState.getChapterUpdateData(chapter);
				console.log('Saving chapter:', chapter.id);
				console.log('Update data:', updateData);
				const updated = await updateChapter(chapter.id, updateData, authContext.apiToken);

				// Update the original with the new data
				chapter.original = updated;
				chapter.modified = {};
				chapter.isModified = false;
				chapter.saveStatus = 'saved';
				chapter.error = undefined;

				successCount++;
			} catch (error) {
				chapter.saveStatus = 'error';
				chapter.error = error instanceof Error ? error.message : 'Failed to save chapter';
				errorCount++;
			}
		}

		editorState.isSavingAll = false;
		editorState.saveProgress = null;
		editorState.processingStep = ProcessingStep.LOADED;

		if (errorCount > 0) {
			alert(
				`Saved ${successCount} chapters. ${errorCount} failed. Check individual chapters for errors.`
			);
		} else {
			alert(`Successfully saved ${successCount} chapters.`);
		}
	}

	export function revertAllModified() {
		const modifiedChapters = editorState.getModifiedChapters();
		for (const chapter of modifiedChapters) {
			editorState.resetChapter(chapter.id);
		}
	}

	export function reloadChapters() {
		lastProcessedSeriesId = null;
		lastPermissionOverride = !editorState.permissionOverride; // Force reload by setting to opposite value
		// The effect will automatically trigger and call runProcessingPipeline
	}

	export async function deleteAllSelected(chapterIds: string[]) {
		if (!authContext.apiToken) {
			alert('No API token available');
			return;
		}

		if (chapterIds.length === 0) {
			alert('No chapters selected for deletion');
			return;
		}

		// Confirm deletion
		if (
			!confirm(
				`Are you sure you want to delete ${chapterIds.length} chapter(s)? This action cannot be undone.`
			)
		) {
			return;
		}

		editorState.processingStep = ProcessingStep.SAVING;
		editorState.isSavingAll = true;
		editorState.saveProgress = { current: 0, total: chapterIds.length };

		let successCount = 0;
		let errorCount = 0;
		const deletedIds: string[] = [];

		for (let i = 0; i < chapterIds.length; i++) {
			const chapterId = chapterIds[i];
			editorState.saveProgress = { current: i + 1, total: chapterIds.length };

			const chapter = editorState.chapters.find((ch) => ch.id === chapterId);
			if (!chapter) {
				errorCount++;
				continue;
			}

			try {
				editorState.updateChapterDeleteStatus(chapterId, 'deleting');
				await deleteChapter(chapterId, authContext.apiToken);
				editorState.updateChapterDeleteStatus(chapterId, 'deleted');
				deletedIds.push(chapterId);
				successCount++;
			} catch (error) {
				editorState.updateChapterDeleteStatus(
					chapterId,
					'error',
					error instanceof Error ? error.message : 'Failed to delete chapter'
				);
				errorCount++;
			}
		}

		// Remove successfully deleted chapters from the list
		for (const id of deletedIds) {
			editorState.removeChapter(id);
		}

		editorState.isSavingAll = false;
		editorState.saveProgress = null;
		editorState.processingStep = ProcessingStep.LOADED;

		if (errorCount > 0) {
			alert(
				`Deleted ${successCount} chapters. ${errorCount} failed. Check individual chapters for errors.`
			);
		} else {
			alert(`Successfully deleted ${successCount} chapters.`);
		}
	}
</script>
