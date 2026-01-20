<script lang="ts">
	import { ChapterPageType, SelectedFolder, type SelectedFile } from '$lib/core/GroupedFolders';
	import TargetingGroupValidator from '$lib/components/TargetingComponents/TargetingGroupValidator.svelte';
	import TargetingSeriesValidator from '$lib/components/TargetingComponents/TargetingSeriesValidator.svelte';
	import TargetedChapterEditor from './TargetedChapterEditor.svelte';
	import {
		TargetingState,
		targetingStateContext,
		type ChapterComicInfoDefinitionFile
	} from './TargetingState.svelte';
	import { getContext } from 'svelte';
	import {
		ChapterPageState,
		ChapterPageStatus,
		ChapterState,
		ChapterStatus,
		ChapterUploadingGroup,
		ChapterUploadingSeries
	} from '$lib/core/UploadingState.svelte';
	import TargetingBatchEdit from './TargetingBatchEdit.svelte';
	import { XMLParser } from 'fast-xml-parser';
	import TargetingGroupSearch from './TargetingGroupSearch.svelte';
	import TargetingSeriesSearch from './TargetingSeriesSearch.svelte';
	import SeriesChapterDumpLookup from './SeriesChapterDumpLookup.svelte';
	import InfoIcon from '../Common/InfoIcon.svelte';

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'TargetingPreparation must be used within a component that provides TargetingState context'
		);
	}

	interface Props {
		selectedFolders: SelectedFolder[];
		onDone: () => void;
	}

	const { selectedFolders, onDone }: Props = $props();

	let isAllready = $derived.by(() => targetingState.seriesId);
	let showOnlyUngrouped = $state(false);
	let showOnlyNonDeleted = $state(true);

	let filteredChapters = $derived.by(() => {
		if (!showOnlyUngrouped && !showOnlyNonDeleted) {
			return targetingState.chapterStates;
		}

		let chapters = targetingState.chapterStates;

		if (showOnlyUngrouped) {
			chapters = chapters.filter(
				(chapter) =>
					!chapter.associatedGroup.groupIds || chapter.associatedGroup.groupIds.length === 0
			);
		}

		if (showOnlyNonDeleted) {
			chapters = chapters.filter((chapter) => !chapter.isDeleted);
		}

		return chapters;
	});

	async function createChapterFromDefinitionFile(
		definitionFile: SelectedFile,
		remainingFiles: SelectedFile[],
		folderPath: string
	): Promise<ChapterState> {
		let chapterTitle: string | null = null;
		let chapterNumber: string | null = null;
		let chapterVolume: string | null = null;

		// Check if this is a ComicInfo.xml file
		const isComicInfo = definitionFile.file.name.toLowerCase() === 'comicinfo.xml';

		if (isComicInfo) {
			try {
				const xmlText = await definitionFile.file.text();
				const parser = new XMLParser({
					ignoreAttributes: false,
					attributeNamePrefix: '@_',
					parseAttributeValue: true,
					trimValues: true
				});

				const parsed = parser.parse(xmlText) as ChapterComicInfoDefinitionFile;

				if (parsed.ComicInfo) {
					const comicInfo = parsed.ComicInfo;

					// Extract chapter title
					if (comicInfo.Title) {
						chapterTitle = comicInfo.Title;
					}

					// Extract chapter number
					if (comicInfo.Number !== undefined && comicInfo.Number !== null) {
						chapterNumber = String(comicInfo.Number);
					}

					// Extract volume
					if (comicInfo.Volume !== undefined && comicInfo.Volume !== null) {
						chapterVolume = String(comicInfo.Volume);
					}
				}
			} catch (error) {
				console.error('Failed to parse ComicInfo.xml:', error);
				// Continue with default values if parsing fails
			}
		}

		// Create pages from remaining files
		const pages = remainingFiles.map((file, pageIndex) => {
			const isFileAnImage = file.type === ChapterPageType.CHAPTER_PAGE;

			return new ChapterPageState(
				file.file.name,
				pageIndex,
				file.file,
				ChapterPageStatus.NOT_STARTED,
				0,
				null,
				null,
				!isFileAnImage,
				file.type
			);
		});

		const chapter = new ChapterState(
			folderPath,
			chapterTitle ?? '', // Default to empty title if none is found
			chapterVolume,
			chapterNumber,
			new ChapterUploadingSeries(),
			new ChapterUploadingGroup(),
			pages,
			ChapterStatus.NOT_STARTED,
			0,
			null,
			null,
			new SelectedFolder(folderPath, folderPath, [definitionFile, ...remainingFiles], [], 0, 0),
			false,
			'en'
		);

		return chapter;
	}

	// Track previous folder paths to detect actual changes (non-reactive to avoid infinite loops)
	let previousFolderPaths: string[] = [];

	$effect(() => {
		(async () => {
			// Get current folder paths
			const currentFolderPaths = selectedFolders.map((folder) => folder.path).sort();

			// Check if folders have actually changed by comparing paths
			const pathsChanged =
				previousFolderPaths.length !== currentFolderPaths.length ||
				previousFolderPaths.some((path, index) => path !== currentFolderPaths[index]);

			// If folders haven't changed, preserve existing chapter states
			if (!pathsChanged && previousFolderPaths.length > 0) {
				// Create a map of existing chapters by their originalFolderPath
				const existingChaptersByPath = new Map<string, ChapterState>();
				for (const chapter of targetingState.chapterStates) {
					if (chapter.originalFolderPath) {
						existingChaptersByPath.set(chapter.originalFolderPath, chapter);
					}
				}

				// Verify all current folders have matching existing chapters
				const allFoldersHaveChapters = currentFolderPaths.every((path) =>
					existingChaptersByPath.has(path)
				);

				// If all folders have matching chapters, preserve the existing state
				if (allFoldersHaveChapters) {
					// Update previousFolderPaths and return early (non-reactive, won't trigger effect)
					previousFolderPaths = currentFolderPaths;
					return;
				}
			}

			// Folders have changed or some are missing chapters - recreate chapter states
			const existingChaptersByPath = new Map<string, ChapterState>();
			for (const chapter of targetingState.chapterStates) {
				if (chapter.originalFolderPath) {
					existingChaptersByPath.set(chapter.originalFolderPath, chapter);
				}
			}

			const chapters = await Promise.all(
				selectedFolders.map(async (folder, index) => {
					// Try to reuse existing chapter if folder path matches
					const existingChapter = existingChaptersByPath.get(folder.path);
					if (existingChapter) {
						return existingChapter;
					}

					// If a folder contains a single definition file, we can use it to construct a chapter
					const definitionFiles = folder.files.filter(
						(file) => file.type === ChapterPageType.CHAPTER_DEFINITION_FILE
					);
					if (definitionFiles.length === 1) {
						const remainingFiles = folder.files.filter(
							(file) => file.type !== ChapterPageType.CHAPTER_DEFINITION_FILE
						);
						return await createChapterFromDefinitionFile(
							definitionFiles[0],
							remainingFiles,
							folder.path
						);
					}

					// For everything else, we just create a chapter from the files (and pretend unknown files are deleted)
					const pages = folder.files.map((file, pageIndex) => {
						const isFileAnImage = file.type === ChapterPageType.CHAPTER_PAGE;

						return new ChapterPageState(
							file.file.name,
							pageIndex,
							file.file,
							ChapterPageStatus.NOT_STARTED,
							0,
							null,
							null,
							!isFileAnImage,
							file.type
						);
					});

					return new ChapterState(
						folder.path,
						folder.name,
						null,
						index.toString(),
						new ChapterUploadingSeries(),
						new ChapterUploadingGroup(),
						pages,
						ChapterStatus.NOT_STARTED,
						0,
						null,
						null,
						null,
						false,
						'en'
					);
				})
			);

			targetingState.chapterStates = chapters;
			previousFolderPaths = currentFolderPaths;
		})();
	});

	function sortChapters(chapters: ChapterState[]): ChapterState[] {
		return [...chapters].sort((a, b) => {
			// Sort by volume first (null volumes go last)
			const volumeA = a.chapterVolume;
			const volumeB = b.chapterVolume;

			if (volumeA === null && volumeB === null) {
				// Both null, continue to chapter number comparison
			} else if (volumeA === null) {
				return 1; // null goes after non-null
			} else if (volumeB === null) {
				return -1; // non-null goes before null
			} else {
				const volumeCompare = String(volumeA).localeCompare(String(volumeB), undefined, {
					numeric: true,
					sensitivity: 'base'
				});
				if (volumeCompare !== 0) {
					return volumeCompare;
				}
			}

			// Then sort by chapter number (null numbers go last)
			const numberA = a.chapterNumber;
			const numberB = b.chapterNumber;

			if (numberA === null && numberB === null) {
				return 0; // Both null, equal
			} else if (numberA === null) {
				return 1; // null goes after non-null
			} else if (numberB === null) {
				return -1; // non-null goes before null
			} else {
				return String(numberA).localeCompare(String(numberB), undefined, {
					numeric: true,
					sensitivity: 'base'
				});
			}
		});
	}

	$effect(() => {
		const sortAttempt = sortChapters(targetingState.chapterStates);

		// Only update on changes, comparing order
		for (let i = 0; i < sortAttempt.length; i++) {
			if (
				sortAttempt[i].originalFolderPath !== targetingState.chapterStates[i].originalFolderPath
			) {
				targetingState.chapterStates = sortAttempt;
				return;
			}
		}
	});

	$effect(() => {
		if (targetingState.seriesId !== null) {
			targetingState.chapterStates.forEach((chapter) => {
				if (!chapter.associatedSeries) {
					chapter.associatedSeries = new ChapterUploadingSeries();
				}

				chapter.associatedSeries.seriesId = targetingState.seriesId ?? '';
			});
		}
	});
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-col gap-2">
		<div class="flex flex-row items-center gap-2">
			<InfoIcon title="Targeting Preparation" position="bottom">
				<p class="text-app text-sm">
					This section is <b>required</b> before you can start uploading. You must select the series
					(manga/manhwa/manhua) that your chapters belong to.
					<br />
					<br />
					<b>Series Validator:</b> Enter a Weebdex series ID directly if you already know it.
					<br />
					<br />
					<b>Series Search:</b> Search for a series by name if you don't know the ID.
					<br />
					<br />
					Once a series is selected, you can proceed to group preparation and batch editing.
					<br />
					<b>Chapter Dump Lookup</b> also becomes available to you, should there be a chapter dump available
					for the series.
				</p>
			</InfoIcon>
			<h2 class="text-xl font-semibold text-app">Targeting Preparation (Required)</h2>
		</div>
		<TargetingSeriesValidator />
		<SeriesChapterDumpLookup />
		<TargetingSeriesSearch />
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex flex-row items-center gap-2">
			<InfoIcon title="Group Preparation" position="bottom">
				<p class="text-app text-sm">
					Register scanlation groups that will be assigned to your chapters. Groups must be
					registered here before they can be assigned in the Batch Edit section or manually on
					individual chapters.
					<br />
					<br />
					<b>Group Validator:</b> Enter a Weebdex group ID directly if you already know it.
					<br />
					<b>Group Search:</b> Search for groups by name if you don't know the ID.
					<br />
					<br />
					You can register multiple groups. Once registered, they will appear in the list and can be
					removed if needed. Groups registered here become available for assignment to chapters.
				</p>
			</InfoIcon>
			<h2 class="text-xl font-semibold text-app">Group Preparation</h2>
		</div>
		<TargetingGroupValidator />
		<TargetingGroupSearch />
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex flex-col gap-2">
			<div class="flex flex-row items-center gap-2">
				<InfoIcon title="Batch Edit" position="bottom">
					<p class="text-app text-sm">
						Use batch editing to apply changes to multiple chapters at once using regex patterns or
						direct assignment.
						<br />
						<br />
						<b>Regex Extraction:</b> Extract titles, volumes, and chapter numbers from folder paths
						or chapter titles using regex patterns. The first capture group is used as the extracted
						value.
						<br />
						<b>Direct Assignment:</b> Assign volumes, languages, and groups directly to chapters,
						optionally limited to a specific range.
						<br />
						<br />
						Batch operations will skip chapters that have been manually edited, preserving your custom
						changes. You can also manually edit individual chapters in the chapter list below.
					</p>
				</InfoIcon>
				<h2 class="text-lg font-semibold text-app">Batch Edit</h2>
			</div>
			<TargetingBatchEdit bind:chapters={targetingState.chapterStates} />
		</div>

		<button
			type="button"
			class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-md px-2 py-1"
			onclick={onDone}
			disabled={!isAllready}
		>
			Start Upload
		</button>

		<div class="flex flex-col gap-2">
			<div class="flex flex-row items-center gap-2">
				<InfoIcon title="Manual Chapter Editing" position="bottom">
					<p class="text-app text-sm">
						You can manually edit individual chapter properties by clicking on them directly in the
						chapter list below.
						<br />
						<br />
						<b>Editable fields:</b>
						<br />
						• <b>Title:</b> Click on the chapter title to edit it
						<br />
						• <b>Volume:</b> Click on the volume number to edit it
						<br />
						• <b>Chapter Number:</b> Click on the chapter number to edit it
						<br />
						• <b>Language:</b> Use the dropdown to change the language
						<br />
						• <b>Groups:</b> Click on groups to add, remove, or modify them
						<br />
						• <b>Pages:</b> Click on a chapter to expand it and view/edit/remove individual pages
						<br />
						<br />
						Manual edits are preserved even when batch operations are applied. You can revert manual
						edits using the yellow undo button that appears next to edited fields.
					</p>
				</InfoIcon>
				<h2 class="text-lg font-semibold text-app">Chapters</h2>
				<label class="flex flex-row items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={showOnlyUngrouped} class="cursor-pointer" />
					<span class="text-sm text-muted">Show only chapters without groups</span>
				</label>
				<label class="flex flex-row items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={showOnlyNonDeleted} class="cursor-pointer" />
					<span class="text-sm text-muted">Show only non-deleted chapters</span>
				</label>
			</div>
			<div class="flex flex-col gap-2 max-h-150 overflow-y-auto">
				{#each filteredChapters as chapter, index}
					{@const originalIndex = targetingState.chapterStates.findIndex((c) => c === chapter)}
					<TargetedChapterEditor
						{index}
						bind:chapter={targetingState.chapterStates[originalIndex]}
					/>
				{/each}
			</div>
		</div>
	</div>
</div>
