<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import * as zip from '@zip.js/zip.js';
	import {
		groupFilesByFolders,
		type SelectedFolder,
		ChapterPageType
	} from '$lib/core/GroupedFolders';
	import {
		ChapterState,
		ChapterPageState,
		ChapterPageStatus,
		ChapterStatus,
		ChapterUploadingSeries,
		ChapterUploadingGroup
	} from '$lib/core/UploadingState.svelte';
	import {
		TargetingState,
		targetingStateContext
	} from '../TargetingComponents/TargetingState.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import {
		extractDeepestFolders,
		applyVolumeRegex,
		applyChapterRegex,
		extractMangaDexIdFromZipName
	} from './guidedUtils';
	import TargetingSeriesSearch from '../TargetingComponents/TargetingSeriesSearch.svelte';
	import TargetingSeriesValidator from '../TargetingComponents/TargetingSeriesValidator.svelte';
	import SeriesChapterDumpLookup from '../TargetingComponents/SeriesChapterDumpLookup.svelte';
	import TargetingGroupValidator from '../TargetingComponents/TargetingGroupValidator.svelte';
	import TargetingGroupSearch from '../TargetingComponents/TargetingGroupSearch.svelte';
	import UploaderOrchestrator from '../UploaderComponents/UploaderOrchestrator.svelte';
	import { UploaderStatus } from '$lib/core/ChapterUploader.svelte';
	import type { GuidedState } from './GuidedState.svelte';
	import {
		MangaProcessingStatus,
		MangaProcessingStep,
		AutomationState,
		automationStateContext
	} from './GuidedState.svelte';
	import {
		CHAPTER_TITLE_EXPORT_RESOLVER,
		ChapterTitleExportResolver
	} from '$lib/core/ChapterTitleExportResolver.svelte';
	import {
		Coordination,
		Utils,
		ChangeStatus,
		WarningReason,
		type ApplyChangesOptions,
		type ChapterInput,
		type Warning
	} from '$lib/core/ChapterDumpApplier.svelte';
	import {
		searchGroups,
		getMangaAggregate,
		type AggregateChapter,
		type AggregateChapterEntry
	} from '../TargetingComponents/TargetingState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import { GroupMatcher } from '$lib/core/GroupMatcher.svelte';
	import { LEGACY_ID_RESOLVER } from '$lib/core/LegacyIdResolver.svelte';
	import BatchGroupAssignment from './BatchGroupAssignment.svelte';
	import ProcessingWarningSummary from './ProcessingWarningSummary.svelte';
	import PartialGroupMatchWarning from './PartialGroupMatchWarning.svelte';
	import DuplicateChapterWarning from './DuplicateChapterWarning.svelte';
	import ChapterListDisplay from './ChapterListDisplay.svelte';

	// Configure zip.js to disable web workers
	zip.configure({
		useWebWorkers: false
	});

	export type ProcessingStatus = 'success' | 'warning' | 'error';

	interface Props {
		guidedState: GuidedState;
		zipFile: File;
		class?: string;
		onProcessingComplete: (status: ProcessingStatus, weebdexId?: string) => void | Promise<void>;
	}

	let { guidedState, zipFile, class: className = '', onProcessingComplete }: Props = $props();

	// Create a new TargetingState for this manga
	const targetingState = new TargetingState();
	setContext(targetingStateContext, targetingState);

	// Get auth context
	const authContext = getContext<ApiAuthContext>(apiAuthContext);
	if (!authContext) {
		throw new Error('MangaProcessor must be used within a component that provides ApiAuthContext');
	}

	// Get automation state (optional - automation may not be enabled)
	const automationState = getContext<AutomationState>(automationStateContext);

	let processingStep = $state<MangaProcessingStep>(MangaProcessingStep.LOADING);
	let groupedFolder = $state<SelectedFolder | null>(null);
	let chapters = $state<ChapterState[]>([]);
	let uploadWorking = $state(false);
	let currentlyProcessingZip = $state<string | null>(null);
	let uploaderOrchestratorRef = $state<{
		startUpload: () => void;
		getUploaderStatus: () => UploaderStatus | null;
	} | null>(null);
	let lastProcessedSeriesId = $state<string | null>(null);
	let dumpLookupFailed = $state(false);
	let dumpLookupFailedGroups = $state<string[]>([]);
	let chapterWarnings = $state<SvelteMap<number, Warning[]>>(new SvelteMap());
	let showOnlyWarnings = $state(false);

	const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'cbz', 'zip', 'xml'];

	// Warning message constants (only for local warnings not handled by ChapterDumpApplier)
	const WARNINGS = {
		DUPLICATE_CHAPTER: (groups: string[]) =>
			`Duplicate chapter: A chapter with the same volume and chapter number already exists with groups: ${groups.length > 0 ? groups.join(', ') : 'Unknown groups'}`
	} as const;

	// Processing step messages
	const PROCESSING_MESSAGES: Record<MangaProcessingStep, string> = {
		[MangaProcessingStep.LOADING]: 'Loading manga folder...',
		[MangaProcessingStep.EXTRACTING]: 'Extracting zip files...',
		[MangaProcessingStep.SERIES_LOOKUP]: 'Looking up series ID...',
		[MangaProcessingStep.APPLYING_REGEX]: 'Applying regex patterns...',
		[MangaProcessingStep.CHAPTER_LOOKUP]: 'Loading chapter dump...',
		[MangaProcessingStep.LOADING_GROUPS]: 'Loading groups...',
		[MangaProcessingStep.APPLYING_GROUPS]: 'Applying groups to chapters...',
		[MangaProcessingStep.APPLYING_TITLES]: 'Applying changes from dump...',
		[MangaProcessingStep.READY]: '',
		[MangaProcessingStep.READY_WARNING]: '',
		[MangaProcessingStep.UPLOADING]: '',
		[MangaProcessingStep.COMPLETED]: ''
	};

	// Helper functions
	const isNoGroupChapter = (chapter: ChapterState): boolean => {
		return Utils.isNoGroupPath(chapter.originalFolderPath);
	};

	// Main processing pipeline - orchestrates all steps sequentially
	$effect(() => {
		if (!zipFile) return;

		// Reset state when zip file changes
		lastProcessedSeriesId = null;
		dumpLookupFailed = false;
		dumpLookupFailedGroups = [];
		chapterWarnings = new SvelteMap();

		// Run pipeline
		runProcessingPipeline();
	});

	async function runProcessingPipeline() {
		try {
			// Step 1: Process zip file (extract and create basic chapter structure)
			await stepProcessZip();

			// Step 2: Lookup series ID (from filename or user input)
			await stepLookupSeries();

			// If no series ID, stop here and wait for user input
			// Set to READY_WARNING so automation will skip it
			if (!targetingState.seriesId) {
				processingStep = MangaProcessingStep.READY_WARNING;
				return;
			}

			// Step 3: Apply regex (already done in stepProcessZip, but we mark it)
			processingStep = MangaProcessingStep.APPLYING_REGEX;
			// Regex is already applied during chapter creation, so we can skip actual work here

			// Step 4: Lookup chapters (load chapter dump)
			await stepLookupChapters();

			// Step 5: Load groups
			await stepLoadGroups();

			// Step 6: Apply groups to chapters
			await stepApplyGroups();

			// Step 7: Apply changes from dump (fix volumes and apply titles)
			await stepApplyTitles();

			// Step 8: Check for duplicates
			await checkForDuplicates();

			// Determine final state
			if (hasIssues()) {
				processingStep = MangaProcessingStep.READY_WARNING;
			} else {
				processingStep = MangaProcessingStep.READY;
			}
		} catch (error) {
			console.error('Error in processing pipeline:', error);
			guidedState.setZipStatus(zipFile, MangaProcessingStatus.ERROR);
			// Set to READY_WARNING so automation will skip errored zips
			processingStep = MangaProcessingStep.READY_WARNING;
			onProcessingComplete('error');
		}
	}

	/**
	 * Extracts an archive file (.cbz or .zip) and creates virtual File objects with fake paths
	 * to simulate a subfolder structure
	 */
	async function extractArchiveFile(archiveFile: File): Promise<File[]> {
		const archiveExtension = archiveFile.name.split('.').pop()?.toLowerCase();
		const isCbz = archiveExtension === 'cbz';
		const isZip = archiveExtension === 'zip';

		if (!isCbz && !isZip) {
			throw new Error(`Unsupported archive format: ${archiveExtension}`);
		}

		console.log(`Extracting ${archiveExtension} file:`, archiveFile.name);
		const zipReader = new zip.ZipReader(new zip.BlobReader(archiveFile));
		const entries = await zipReader.getEntries();
		const extractedFiles: File[] = [];

		// Get the base name of the archive file (without extension) for the virtual folder
		const archiveBaseName = archiveFile.name.replace(/\.(cbz|zip)$/i, '');
		const originalPath = archiveFile.webkitRelativePath || archiveFile.name;

		// Filter entries to get valid files first (for progress tracking)
		const validEntries = entries.filter((entry) => {
			if (!entry.filename || entry.directory) {
				return false;
			}
			const entryExtension = entry.filename.split('.').pop()?.toLowerCase();
			return entryExtension && allowedExtensions.includes(entryExtension);
		});

		const totalFiles = validEntries.length;
		let currentIndex = 0;

		for (const entry of validEntries) {
			currentIndex++;
			const entryPath = entry.filename;
			const fileName = entryPath.split('/').pop() ?? entryPath;

			// Update progress display with path within archive
			currentlyProcessingZip = `${entryPath} (${currentIndex} / ${totalFiles})`;

			const entryExtension = entryPath.split('.').pop()?.toLowerCase() ?? '';

			// Type guard: we've already filtered out directories, so this is safe
			if (entry.directory) {
				continue;
			}

			const entryStream = new TransformStream();
			const blobPromise = new Response(entryStream.readable).blob();

			await entry.getData(entryStream.writable);

			let blob = await blobPromise;

			if (!blob.type) {
				const mimeType = getMimeTypeFromExtension(entryExtension);
				blob = new Blob([blob], { type: mimeType });
			}

			const virtualPath = originalPath.includes('/')
				? `${originalPath.split('/').slice(0, -1).join('/')}/${archiveBaseName}/${entryPath}`
				: `${archiveBaseName}/${entryPath}`;

			const virtualFile = new File([blob], fileName, {
				type: blob.type
			});

			Object.defineProperty(virtualFile, 'webkitRelativePath', {
				value: virtualPath,
				writable: false,
				enumerable: true,
				configurable: true
			});

			extractedFiles.push(virtualFile);
		}

		await zipReader.close();
		currentlyProcessingZip = null;

		return extractedFiles;
	}

	function getMimeTypeFromExtension(extension: string): string {
		const mimeMap: Record<string, string> = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp'
		};
		return mimeMap[extension] || 'application/octet-stream';
	}

	// Step 1: Process zip file - extract and create basic chapter structure
	async function stepProcessZip() {
		processingStep = MangaProcessingStep.LOADING;
		targetingState.reset();

		// Extract the zip file
		processingStep = MangaProcessingStep.EXTRACTING;
		let allExtractedFiles: File[] = [];
		try {
			allExtractedFiles = await extractArchiveFile(zipFile);
		} catch (error) {
			console.error(`Error extracting ${zipFile.name}:`, error);
			throw error;
		}

		// Group files by folders
		groupedFolder = groupFilesByFolders(allExtractedFiles);

		// Find deepest level folders (these are the chapter folders)
		const deepestFolders = extractDeepestFolders(groupedFolder);

		// Create ChapterState objects from deepest folders (regex is applied here)
		chapters = await Promise.all(
			deepestFolders.map(async (folder) => {
				// Apply regexes to extract volume and chapter numbers
				const volume = applyVolumeRegex(folder.name);
				const chapterNumber = applyChapterRegex(folder.name);

				// Create pages from folder files
				const pages = folder.files
					.filter((file) => file.type === ChapterPageType.CHAPTER_PAGE)
					.map((file, pageIndex) => {
						return new ChapterPageState(
							file.file.name,
							pageIndex,
							file.file,
							ChapterPageStatus.NOT_STARTED,
							0,
							null,
							null,
							false,
							file.type
						);
					});

				return new ChapterState(
					folder.path,
					null, // Default to null title for processed chapters
					volume,
					chapterNumber,
					new ChapterUploadingSeries(),
					new ChapterUploadingGroup(),
					pages,
					ChapterStatus.NOT_STARTED,
					0,
					null,
					null,
					folder,
					false,
					'en'
				);
			})
		);

		// Sort chapters by volume and chapter number
		chapters.sort((a, b) => {
			// Sort by volume first
			if (a.chapterVolume && b.chapterVolume) {
				const volCompare = String(a.chapterVolume).localeCompare(
					String(b.chapterVolume),
					undefined,
					{
						numeric: true,
						sensitivity: 'base'
					}
				);
				if (volCompare !== 0) return volCompare;
			} else if (a.chapterVolume) return -1;
			else if (b.chapterVolume) return 1;

			// Then by chapter number
			if (a.chapterNumber && b.chapterNumber) {
				return String(a.chapterNumber).localeCompare(String(b.chapterNumber), undefined, {
					numeric: true,
					sensitivity: 'base'
				});
			} else if (a.chapterNumber) return -1;
			else if (b.chapterNumber) return 1;

			return 0;
		});

		targetingState.chapterStates = chapters;
	}

	// Step 2: Lookup series ID (from filename or user input)
	async function stepLookupSeries() {
		processingStep = MangaProcessingStep.SERIES_LOOKUP;

		// Try to automatically detect series ID from MD-#### in zip file name
		const mangaDexId = extractMangaDexIdFromZipName(zipFile.name);
		if (mangaDexId) {
			try {
				await LEGACY_ID_RESOLVER.load();
				const weebdexId = await LEGACY_ID_RESOLVER.getWeebdexIdFromLegacyId(mangaDexId);
				if (weebdexId) {
					targetingState.seriesId = weebdexId;
					console.log(`Auto-detected series ID from MD-####: ${mangaDexId} -> ${weebdexId}`);
				} else {
					console.log(`No WeebDex ID found for MangaDex ID: ${mangaDexId}`);
				}
			} catch (error) {
				console.warn(`Failed to lookup WeebDex ID for MangaDex ID ${mangaDexId}:`, error);
			}
		}

		// Assign series ID to all chapters
		if (targetingState.seriesId) {
			targetingState.chapterStates.forEach((chapter) => {
				if (!chapter.associatedSeries) {
					chapter.associatedSeries = new ChapterUploadingSeries();
				}
				chapter.associatedSeries.seriesId = targetingState.seriesId ?? '';
			});
		}
	}

	// Step 3: Lookup chapters (load chapter dump)
	async function stepLookupChapters() {
		processingStep = MangaProcessingStep.CHAPTER_LOOKUP;
		if (!targetingState.seriesId) return;

		await CHAPTER_TITLE_EXPORT_RESOLVER.load();
	}

	// Step 4: Load groups
	async function stepLoadGroups() {
		processingStep = MangaProcessingStep.LOADING_GROUPS;
		if (!targetingState.seriesId) return;

		// Check if there are any entries for this series (with or without groups)
		const hasEntries = await CHAPTER_TITLE_EXPORT_RESOLVER.hasSeriesEntries(
			targetingState.seriesId
		);

		if (!hasEntries) {
			console.warn('No entries found in chapter dump for this series');
			dumpLookupFailed = true;
			return;
		}

		// Get all groups for this series (Group objects with primary names and alt names)
		const csvGroups = await GroupMatcher.getSeriesGroups(targetingState.seriesId);

		// If there are no groups, that's fine - it just means all entries are ungrouped
		// We don't set dumpLookupFailed here because the series has entries
		if (csvGroups.length === 0) {
			console.log('No groups found in chapter dump, but series has entries (likely all ungrouped)');
			targetingState.availableScanGroups = [];
			return;
		}

		// Look up each group and add to availableScanGroups
		// Use GroupMatcher's matching logic which checks both primary and alt names
		const availableGroups: ScanGroup[] = [];
		const failedGroups: string[] = [];
		for (const csvGroup of csvGroups) {
			try {
				// Search using the primary name
				const response = await searchGroups(csvGroup.primaryName);
				if (response.data) {
					// Use groupMatches to check if any returned group matches (checks primary and alt names)
					const matchedGroup = response.data.find((apiGroup) => {
						return ChapterTitleExportResolver.groupMatches(csvGroup, apiGroup.name);
					});
					if (matchedGroup) {
						const newGroup = new ScanGroup();
						newGroup.groupId = matchedGroup.id;
						newGroup.groupName = matchedGroup.name;
						availableGroups.push(newGroup);
					} else {
						failedGroups.push(csvGroup.primaryName);
					}
				} else {
					failedGroups.push(csvGroup.primaryName);
				}
			} catch (err) {
				console.warn(`Failed to lookup group "${csvGroup.primaryName}":`, err);
				failedGroups.push(csvGroup.primaryName);
			}
		}

		dumpLookupFailedGroups = failedGroups;
		if (failedGroups.length > 0) {
			dumpLookupFailed = true;
		}

		targetingState.availableScanGroups = availableGroups;
	}

	// Step 5: Apply groups to chapters
	async function stepApplyGroups() {
		processingStep = MangaProcessingStep.APPLYING_GROUPS;
		await applyGroupsToChapters();
	}

	// Step 6: Apply changes from dump (fix volumes and apply titles)
	async function stepApplyTitles() {
		processingStep = MangaProcessingStep.APPLYING_TITLES;
		if (!targetingState.seriesId) return;

		const failedTitleCount = await applyTitlesToChapters();
		if (failedTitleCount > 0) {
			dumpLookupFailed = true;
		}
	}

	// Watch for seriesId changes and restart pipeline if needed
	$effect(() => {
		if (
			targetingState.seriesId &&
			(processingStep === MangaProcessingStep.READY ||
				processingStep === MangaProcessingStep.READY_WARNING) &&
			targetingState.seriesId !== lastProcessedSeriesId
		) {
			// Series ID was set after we reached READY/READY_WARNING, restart pipeline from series lookup
			lastProcessedSeriesId = targetingState.seriesId;
			runProcessingPipelineFromSeries();
		}
	});

	async function runProcessingPipelineFromSeries() {
		try {
			// Start from series lookup (skip zip processing)
			await stepLookupSeries();

			if (!targetingState.seriesId) return;

			processingStep = MangaProcessingStep.APPLYING_REGEX;
			// Regex already applied, continue

			await stepLookupChapters();
			await stepLoadGroups();
			await stepApplyGroups();
			await stepApplyTitles();
			await checkForDuplicates();

			if (hasIssues()) {
				processingStep = MangaProcessingStep.READY_WARNING;
			} else {
				processingStep = MangaProcessingStep.READY;
			}
		} catch (error) {
			console.error('Error in processing pipeline:', error);
			processingStep = MangaProcessingStep.READY_WARNING;
		}
	}

	async function applyGroupsToChapters() {
		if (!targetingState.seriesId) return;

		await Coordination.applyGroupsToChapters(
			targetingState.chapterStates,
			targetingState.availableScanGroups,
			targetingState.seriesId
		);
	}

	async function applyTitlesToChapters(): Promise<number> {
		if (!targetingState.seriesId) return 0;

		const seriesId = targetingState.seriesId;

		// Track chapter indices and store original volumes before updates
		const chapterIndexMap = new Map<number, ChapterState>();
		const originalVolumes = new Map<number, string | null>();
		for (let i = 0; i < targetingState.chapterStates.length; i++) {
			const chapter = targetingState.chapterStates[i];
			chapterIndexMap.set(i, chapter);
			// Store original volume before any updates
			originalVolumes.set(i, chapter.chapterVolume);
		}

		// Convert ChapterState objects to ChapterInput for applyChangesFromDump
		const chapterInputs: ChapterInput[] = targetingState.chapterStates.map((chapter) => {
			// Normalize empty strings to null for title (defensive, should already be normalized)
			const normalizedTitle =
				chapter.chapterTitle === undefined ||
				chapter.chapterTitle === null ||
				chapter.chapterTitle === ''
					? null
					: chapter.chapterTitle;
			return {
				chapterVolume: chapter.chapterVolume,
				chapterNumber: chapter.chapterNumber,
				originalFolderPath: chapter.originalFolderPath,
				groupIds: chapter.associatedGroup.groupIds ?? [],
				currentTitle: normalizedTitle
			};
		});

		// Create a map from ChapterInput to index for isNoGroupChapter callback
		const inputToIndexMap = new Map<ChapterInput, number>();
		for (let i = 0; i < chapterInputs.length; i++) {
			inputToIndexMap.set(chapterInputs[i], i);
		}

		const result = await Coordination.applyChangesFromDump(
			chapterInputs,
			targetingState.availableScanGroups,
			seriesId,
			{
				useFallbackMatching: true,
				isNoGroupChapter: (chapterInput) => {
					const index = inputToIndexMap.get(chapterInput);
					if (index === undefined) return false;
					const chapter = chapterIndexMap.get(index);
					return chapter ? isNoGroupChapter(chapter) : false;
				}
			}
		);

		// Process results and apply changes to ChapterState objects
		for (let i = 0; i < result.results.length; i++) {
			const chapterResult = result.results[i];
			const chapter = chapterIndexMap.get(i);
			if (!chapter) continue;

			// Get existing warnings (preserve duplicates - they're checked separately after dump processing)
			const existingWarnings: Warning[] = chapterWarnings.get(i) ?? [];
			// Filter out warnings that will be replaced by ChapterDumpApplier warnings
			// Preserve duplicate warnings as they're checked separately via checkForDuplicates
			const preservedWarnings = existingWarnings.filter(
				(w) => w.reason === WarningReason.DUPLICATE_CHAPTER
			);

			// Apply changes if status indicates success (even if no changes were needed)
			if (
				chapterResult.status === ChangeStatus.SUCCESS ||
				chapterResult.status === ChangeStatus.NO_CHANGES
			) {
				// Only apply changes if they exist
				if (chapterResult.changes) {
					const { volume, title, additionalGroupIds } = chapterResult.changes;

					// Apply volume change
					if (volume !== undefined) {
						const originalVolume = originalVolumes.get(i) ?? chapter.chapterVolume;
						chapter.chapterVolume = volume;

						// Track volume changes for manuallyEditedFields (specific to MangaProcessor state management)
						if (chapterResult.resolutionResult?.usedFallback) {
							// Mark volume as manually edited if it wasn't already
							if (!chapter.manuallyEditedFields.has('volume')) {
								if (!chapter.originalFieldValues.has('volume')) {
									chapter.originalFieldValues.set('volume', originalVolume);
								}
								chapter.manuallyEditedFields.add('volume');
							}
						}
					}

					// Apply title change
					if (title !== undefined) {
						chapter.chapterTitle = title;
					}

					// Apply group additions
					if (additionalGroupIds.length > 0) {
						const existingGroupIds = new SvelteSet(chapter.associatedGroup.groupIds ?? []);
						for (const groupId of additionalGroupIds) {
							existingGroupIds.add(groupId);
						}
						chapter.associatedGroup.groupIds = Array.from(existingGroupIds);
					}
				}
			}

			// Add warnings from result (warnings are already generated by applyChangesFromDump)
			// Combine preserved warnings (like duplicates) with new warnings from ChapterDumpApplier
			const allWarnings = [...preservedWarnings, ...chapterResult.warnings];
			// Only set warnings if there are any, otherwise delete the entry to avoid counting empty arrays
			if (allWarnings.length > 0) {
				chapterWarnings.set(i, allWarnings);
			} else {
				chapterWarnings.delete(i);
			}
		}

		return result.failedCount;
	}

	async function checkForDuplicates() {
		if (!targetingState.seriesId) return;

		try {
			const aggregate = await getMangaAggregate(targetingState.seriesId);

			// Build a map of existing chapters from aggregate data
			// Key format: "volume:chapter" (e.g., "3:18" or "none:18.5" or "none:none")
			const existingChapters = new Map<string, AggregateChapter>();
			for (const aggregateChapter of aggregate.chapters) {
				const volume = aggregateChapter.volume || 'none';
				const chapterNum = aggregateChapter.chapter || 'none';
				const key = `${volume}:${chapterNum}`;
				existingChapters.set(key, aggregateChapter);
			}

			// Helper function to check if an entry has the "No Group" group
			const hasNoGroup = (groupIndices: number[]): boolean => {
				if (!aggregate.groups) return false;
				for (const groupIndex of groupIndices) {
					const group = aggregate.groups[groupIndex];
					if (group && group.name === 'No Group' && !group.id) {
						return true;
					}
				}
				return false;
			};

			// Helper function to convert group indices to group IDs
			// Note: Groups with no ID (like "No Group") are not included in the returned set
			const getGroupIdsFromIndices = (groupIndices: number[]): Set<string> => {
				const groupIds = new Set<string>();
				if (aggregate.groups) {
					for (const groupIndex of groupIndices) {
						const group = aggregate.groups[groupIndex];
						if (group && group.id) {
							groupIds.add(group.id);
						}
					}
				}
				return groupIds;
			};

			// Helper function to check if there's at least one matching group
			// Handles the special case where "No Group" (no ID) matches empty groups
			const hasMatchingGroup = (
				uploadingGroupIds: Set<string>,
				entryGroupIds: Set<string>,
				entryHasNoGroup: boolean
			): boolean => {
				// If uploading chapter has no groups, it matches entries with "No Group"
				if (uploadingGroupIds.size === 0) {
					return entryHasNoGroup && entryGroupIds.size === 0;
				}
				// If entry has "No Group", it only matches uploading chapters with no groups
				if (entryHasNoGroup) {
					return false;
				}
				// Check if there's at least one matching group ID
				for (const id of uploadingGroupIds) {
					if (entryGroupIds.has(id)) {
						return true;
					}
				}
				return false;
			};

			// Check each chapter for duplicates
			for (
				let chapterIndex = 0;
				chapterIndex < targetingState.chapterStates.length;
				chapterIndex++
			) {
				const chapter = targetingState.chapterStates[chapterIndex];
				const volume = chapter.chapterVolume || 'none';
				const chapterNum = chapter.chapterNumber || 'none';

				const key = `${volume}:${chapterNum}`;
				const existingChapter = existingChapters.get(key);

				// Get existing warnings and preserve all warnings from ChapterDumpApplier
				// We'll add/update duplicate warnings separately
				const existingWarnings = chapterWarnings.get(chapterIndex) ?? [];
				// Preserve all warnings except existing duplicate warnings (we'll re-add if needed)
				const warningsWithoutDuplicates = existingWarnings.filter(
					(w) => w.reason !== WarningReason.DUPLICATE_CHAPTER
				);

				if (
					existingChapter &&
					existingChapter.entries &&
					Object.keys(existingChapter.entries).length > 0
				) {
					// Get the group IDs for the chapter being uploaded
					const uploadingGroupIds = new Set(chapter.associatedGroup.groupIds ?? []);

					// Check each entry to see if it has at least one matching group
					// This includes checking ungrouped chapters (empty groups array) against entries with "No Group"
					let matchingEntry: AggregateChapterEntry | null = null;
					for (const entry of Object.values(existingChapter.entries)) {
						const entryGroupIds = getGroupIdsFromIndices(entry.groups);
						const entryHasNoGroup = hasNoGroup(entry.groups);
						if (hasMatchingGroup(uploadingGroupIds, entryGroupIds, entryHasNoGroup)) {
							matchingEntry = entry;
							break;
						}
					}

					// Mark as duplicate if we found an entry with at least one matching group
					if (matchingEntry) {
						// Get group names for display
						const matchingGroupIds = getGroupIdsFromIndices(matchingEntry.groups);
						const matchingHasNoGroup = hasNoGroup(matchingEntry.groups);
						const existingGroupNames: string[] = [];

						if (matchingHasNoGroup) {
							// Entry has "No Group" group
							existingGroupNames.push('No Group');
						}

						// Add all groups with IDs
						for (const groupId of matchingGroupIds) {
							const group = aggregate.groups?.find((g) => g.id === groupId);
							if (group) {
								existingGroupNames.push(`${group.name} (${group.id})`);
							} else {
								existingGroupNames.push(`Unknown Group (${groupId})`);
							}
						}

						// Add duplicate warning
						warningsWithoutDuplicates.push({
							reason: WarningReason.DUPLICATE_CHAPTER,
							note: WARNINGS.DUPLICATE_CHAPTER(
								existingGroupNames.length > 0 ? existingGroupNames : ['Unknown groups']
							)
						});
					}
				}

				// Update warnings (either with or without duplicate warning)
				// Only set warnings if there are any, otherwise delete the entry to avoid counting empty arrays
				if (warningsWithoutDuplicates.length > 0) {
					chapterWarnings.set(chapterIndex, warningsWithoutDuplicates);
				} else {
					chapterWarnings.delete(chapterIndex);
				}
			}
		} catch (err) {
			console.error('Error checking for duplicates:', err);
		}
	}

	function handleUploadDone(success: boolean) {
		// Prevent multiple calls - only process if we're still uploading
		if (processingStep !== MangaProcessingStep.UPLOADING) return;

		processingStep = MangaProcessingStep.COMPLETED;
		const status: ProcessingStatus = success ? 'success' : 'error';
		guidedState.setZipStatus(
			zipFile,
			success ? MangaProcessingStatus.COMPLETED : MangaProcessingStatus.ERROR
		);
		// Pass weebdex ID when status is success
		if (success && targetingState.seriesId) {
			onProcessingComplete(status, targetingState.seriesId);
		} else {
			onProcessingComplete(status);
		}
	}

	/**
	 * Extracts existing groups from a duplicate warning message
	 */
	function extractGroupsFromDuplicateWarning(warning: Warning): string[] {
		const match = warning.note.match(/groups: (.+)$/);
		if (match) {
			return match[1].split(', ').filter((g) => g !== 'Unknown groups');
		}
		return [];
	}

	/**
	 * Extracts matched group and all groups from a partial group match warning
	 */
	function extractGroupsFromPartialMatchWarning(warning: Warning): {
		matchedGroup: string;
		allGroups: string[];
	} | null {
		// Format: "Matched "X" but release has Y groups: A, B, C"
		const match = warning.note.match(/Matched "(.+?)" but release has \d+ groups: (.+)$/);
		if (match) {
			return {
				matchedGroup: match[1],
				allGroups: match[2].split(', ')
			};
		}
		return null;
	}

	// Derived values - extract chapter-level issues from warnings
	const duplicateChapters = $derived(
		chapters
			.map((chapter, index) => {
				const warnings = chapterWarnings.get(index) ?? [];
				const duplicateWarning = warnings.find((w) => w.note.includes('Duplicate chapter:'));
				if (duplicateWarning) {
					return {
						chapter,
						existingGroups: extractGroupsFromDuplicateWarning(duplicateWarning)
					};
				}
				return null;
			})
			.filter((item): item is { chapter: ChapterState; existingGroups: string[] } => item !== null)
	);

	const partialGroupMatches = $derived(
		chapters
			.map((chapter, index) => {
				const warnings = chapterWarnings.get(index) ?? [];
				const partialWarning = warnings.find((w) => w.reason === WarningReason.PARTIAL_GROUP_MATCH);
				if (partialWarning) {
					const groups = extractGroupsFromPartialMatchWarning(partialWarning);
					if (groups) {
						return {
							chapter,
							matchedGroup: groups.matchedGroup,
							allGroups: groups.allGroups
						};
					}
				}
				return null;
			})
			.filter(
				(item): item is { chapter: ChapterState; matchedGroup: string; allGroups: string[] } =>
					item !== null
			)
	);

	const dumpLookupFailedTitles = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) =>
			warnings.some((w) => w.reason === WarningReason.TITLE_RESOLUTION_NOT_FOUND)
		).length
	);

	const chaptersWithNoGroups = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) =>
			warnings.some((w) => w.reason === WarningReason.NO_GROUPS)
		).length
	);

	const chaptersWithNoValidGroups = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) =>
			warnings.some((w) => w.reason === WarningReason.NO_VALID_GROUPS)
		).length
	);

	const chaptersWithNoChapterInfo = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) =>
			warnings.some((w) => w.reason === WarningReason.NO_CHAPTER_INFO)
		).length
	);

	const chaptersWithVolumeMismatch = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) =>
			warnings.some((w) => w.reason === WarningReason.VOLUME_MISMATCH)
		).length
	);

	/**
	 * Recalculates dumpLookupFailed flag based on current chapter warnings
	 * Only updates if the value actually changed to avoid recursive loops
	 */
	function recalculateFailedTitles(): void {
		// Update dumpLookupFailed flag only if it would change
		const newDumpLookupFailed = dumpLookupFailedTitles > 0 || dumpLookupFailedGroups.length > 0;
		if (dumpLookupFailed !== newDumpLookupFailed) {
			dumpLookupFailed = newDumpLookupFailed;
		}
	}

	// Check if there are any issues that should mark this as a warning
	export function hasIssues(): boolean {
		// Check for any warnings in chapters (both blocking and informational)
		// Informational warnings still indicate issues that need attention
		let hasAnyWarnings = false;
		for (const [index, warnings] of chapterWarnings) {
			if (warnings.length > 0) {
				hasAnyWarnings = true;
				break;
			}
		}

		return (
			hasAnyWarnings ||
			duplicateChapters.length > 0 ||
			dumpLookupFailed ||
			dumpLookupFailedGroups.length > 0 ||
			dumpLookupFailedTitles > 0 ||
			partialGroupMatches.length > 0
		);
	}

	// Check if a specific chapter has warnings
	export function chapterHasWarning(chapterIndex: number): boolean {
		return (
			chapterWarnings.has(chapterIndex) && (chapterWarnings.get(chapterIndex)?.length ?? 0) > 0
		);
	}

	/**
	 * Re-evaluates warnings after batch group assignment
	 */
	async function reEvaluateWarningsAfterBatchAssign() {
		if (targetingState.seriesId) {
			// First, try to match additional groups from CSV based on folder paths
			// This respects manually assigned groups and only adds missing ones
			await applyGroupsToChapters();
			// Then, apply titles and additional groups from CSV based on volume/chapter/group matching
			// This also respects existing groups and uses them for matching
			await applyTitlesToChapters();
			await checkForDuplicates();
		}
	}

	// Get warning text for a specific chapter
	export function getChapterWarningText(chapterIndex: number): string[] | null {
		const warnings = chapterWarnings.get(chapterIndex);
		if (!warnings || warnings.length === 0) return null;
		return warnings.map((w) => w.note);
	}

	// Get warning reasons for a specific chapter
	export function getChapterWarningReasons(chapterIndex: number): WarningReason[] | null {
		const warnings = chapterWarnings.get(chapterIndex);
		if (!warnings || warnings.length === 0) return null;
		return warnings.map((w) => w.reason);
	}

	// Expose issue details for automation
	export function getIssueDetails() {
		return {
			hasDuplicates: duplicateChapters.length > 0,
			duplicateCount: duplicateChapters.length,
			dumpLookupFailed,
			failedGroups: dumpLookupFailedGroups.length,
			failedTitles: dumpLookupFailedTitles,
			partialGroupMatches: partialGroupMatches.length
		};
	}

	// Expose ready state for automation
	// Only returns true for READY (no issues), not READY_WARNING (has issues)
	export function isReady(): boolean {
		// Ready if:
		// 1. Processing step is READY (not READY_WARNING, loading, extracting, uploading, or series lookup)
		// 2. Either we've processed the dump for this series ID OR no series ID is set (meaning dump won't be processed)
		//    We've processed it if lastProcessedSeriesId matches current seriesId
		return (
			processingStep === MangaProcessingStep.READY &&
			(lastProcessedSeriesId === targetingState.seriesId || !targetingState.seriesId)
		);
	}

	// Automation logic: check and progress automatically
	// Track all dependencies explicitly to ensure reactivity
	$effect(() => {
		const isActive = automationState?.isActive;
		if (!isActive) return;

		// Track the state values that determine if we're ready
		const step = processingStep;
		const seriesId = targetingState.seriesId;
		const lastSeriesId = lastProcessedSeriesId;

		// Check if we should trigger automation check
		// Only check when we're in READY or READY_WARNING state
		const shouldCheck =
			step === MangaProcessingStep.READY || step === MangaProcessingStep.READY_WARNING;

		if (!shouldCheck) return;

		console.log('Automation: Effect triggered, checking state', {
			step,
			seriesId,
			lastSeriesId,
			shouldCheck
		});

		// Small delay to ensure state is stable
		const timeoutId = setTimeout(() => {
			handleAutomationCheck();
		}, 500);

		return () => clearTimeout(timeoutId);
	});

	async function handleAutomationCheck() {
		if (!automationState?.isActive) {
			console.log('Automation: Not active');
			return;
		}

		// Check if we're in READY_WARNING state - automation should skip these
		if (processingStep === MangaProcessingStep.READY_WARNING) {
			console.log('Automation: READY_WARNING state detected, marking as warning and skipping');
			guidedState.setZipStatus(zipFile, MangaProcessingStatus.WARNING);
			onProcessingComplete('warning');
			return;
		}

		if (!isReady()) {
			console.log('Automation: Not ready', {
				step: processingStep,
				seriesId: targetingState.seriesId,
				lastProcessedSeriesId
			});
			return;
		}

		console.log('Automation: Checking zip file', zipFile.name);

		// Check if we should stop automation (only warnings/errors remain)
		const pendingZips = guidedState.pendingZips;
		const hasWarningsOrErrors =
			guidedState.warningZips.length > 0 || guidedState.errorZips.length > 0;

		if (pendingZips.length === 0 && hasWarningsOrErrors) {
			console.log('Automation: Disabling - only warnings/errors remain');
			automationState.disable();
			return;
		}

		// At this point we're in READY state (no issues), so we can proceed with upload
		console.log('Automation: No issues, starting upload', {
			canStartUpload,
			hasSeriesId: !!targetingState.seriesId,
			nonDeletedChapters: nonDeletedChapters.length
		});

		if (canStartUpload && targetingState.seriesId && nonDeletedChapters.length > 0) {
			const uploadStarted = startUpload();
			if (!uploadStarted) {
				// If upload couldn't start, mark as error and move on
				console.warn('Automation: Failed to start upload, marking as error');
				guidedState.setZipStatus(zipFile, MangaProcessingStatus.ERROR);
				onProcessingComplete('error');
			} else {
				console.log('Automation: Upload started successfully');
			}
		} else {
			// Missing requirements - mark as warning
			console.warn('Automation: Missing requirements for upload', {
				canStartUpload,
				hasSeriesId: !!targetingState.seriesId,
				nonDeletedChapters: nonDeletedChapters.length
			});
			guidedState.setZipStatus(zipFile, MangaProcessingStatus.WARNING);
			onProcessingComplete('warning');
		}
	}

	export function startUpload() {
		if (!authContext.apiToken) {
			alert('Please set up API authentication first');
			return false;
		}

		if (!targetingState.seriesId) {
			alert('Please set a series ID first');
			return false;
		}

		if (targetingState.chapterStates.length === 0) {
			alert('No chapters to upload');
			return false;
		}

		if (!canStartUpload || nonDeletedChapters.length === 0) {
			return false;
		}

		processingStep = MangaProcessingStep.UPLOADING;
		guidedState.setZipStatus(zipFile, MangaProcessingStatus.PROCESSING);
		return true;
	}

	// Watch for UPLOADING state and trigger upload if automation is active
	$effect(() => {
		if (
			processingStep === MangaProcessingStep.UPLOADING &&
			automationState?.isActive &&
			uploaderOrchestratorRef
		) {
			// Small delay to ensure component is fully mounted
			const timeoutId = setTimeout(() => {
				console.log('Automation: Triggering upload via UploaderOrchestrator');
				uploaderOrchestratorRef?.startUpload();
			}, 200);
			return () => clearTimeout(timeoutId);
		}
	});

	const canStartUpload = $derived(
		processingStep === MangaProcessingStep.READY ||
			processingStep === MangaProcessingStep.READY_WARNING
	);
	const nonDeletedChapters = $derived(chapters.filter((ch) => !ch.isDeleted));
	// Count only chapters with actual warnings (non-empty arrays)
	// Since we now delete entries with empty arrays, chapterWarnings.size should be accurate,
	// but this derived value makes the intent explicit
	const chaptersWithWarningsCount = $derived(
		Array.from(chapterWarnings.values()).filter((warnings) => warnings.length > 0).length
	);

	// Watch for uploader status changes (PAUSED/STOPPED) and stop automation
	$effect(() => {
		if (processingStep === MangaProcessingStep.UPLOADING && uploaderOrchestratorRef) {
			const status = uploaderOrchestratorRef.getUploaderStatus();

			// Check for PAUSED status (network error after retries)
			if (status === UploaderStatus.PAUSED) {
				console.log('MangaProcessor: Detected PAUSED status, stopping automation');
				if (automationState?.isActive) {
					automationState.disable();
				}
				// Mark as error so user can see the issue
				guidedState.setZipStatus(zipFile, MangaProcessingStatus.ERROR);
				handleUploadDone(false);
				return;
			}

			// Check for STOPPED status (403 error)
			if (status === UploaderStatus.STOPPED) {
				console.log('MangaProcessor: Detected STOPPED status, stopping automation');
				if (automationState?.isActive) {
					automationState.disable();
				}
				// Mark as error so user can see the issue
				guidedState.setZipStatus(zipFile, MangaProcessingStatus.ERROR);
				handleUploadDone(false);
				return;
			}
		}
	});

	// Watch for all chapters to be completed and mark zip as completed
	$effect(() => {
		if (processingStep === MangaProcessingStep.UPLOADING && chapters.length > 0) {
			const allCompleted = chapters.every(
				(chapter) => chapter.status === ChapterStatus.COMPLETED || chapter.isDeleted
			);
			const hasNonDeletedChapters = chapters.some((chapter) => !chapter.isDeleted);

			if (allCompleted && hasNonDeletedChapters) {
				// Check if any non-deleted chapters failed
				const hasFailedChapters = chapters.some(
					(chapter) => !chapter.isDeleted && chapter.status === ChapterStatus.FAILED
				);
				const success = !hasFailedChapters;
				// All chapters are completed, mark zip as completed or error
				guidedState.setZipStatus(
					zipFile,
					success ? MangaProcessingStatus.COMPLETED : MangaProcessingStatus.ERROR
				);
				handleUploadDone(success);
			}
		}
	});

	// Watch for warning changes and update processing step accordingly
	// Only update when we're in READY or READY_WARNING state
	$effect(() => {
		const step = processingStep;
		if (step !== MangaProcessingStep.READY && step !== MangaProcessingStep.READY_WARNING) {
			return;
		}

		// Track all warning-related state to trigger updates when they change
		// Reading these values makes Svelte track them for reactivity
		// Note: We only track inputs (warnings, duplicates, etc.), not outputs (dumpLookupFailedTitles)
		// to avoid recursive loops when recalculateFailedTitles() updates those values
		const warningsSize = chapterWarnings.size;
		const duplicatesCount = duplicateChapters.length;
		const failedGroupsCount = dumpLookupFailedGroups.length;
		const partialMatchesCount = partialGroupMatches.length;
		const failedTitlesCount = dumpLookupFailedTitles;

		// Track the actual warnings content to detect changes in warning messages
		// Iterating over the SvelteMap and reading its values tracks them for reactivity
		for (const [index, warnings] of chapterWarnings) {
			// Read warnings array and its contents to track changes
			const warningsLength = warnings.length;
			// Track each warning message to detect content changes
			for (const warning of warnings) {
				const warningText = warning; // Track each warning message
			}
		}

		// Recalculate failed titles when warnings change
		// This updates dumpLookupFailedTitles and dumpLookupFailed, but we don't track
		// those values here to avoid recursive loops
		recalculateFailedTitles();

		// Update processing step based on whether there are blocking issues
		// This will automatically transition between READY and READY_WARNING
		if (hasIssues()) {
			processingStep = MangaProcessingStep.READY_WARNING;
		} else {
			processingStep = MangaProcessingStep.READY;
		}
	});
</script>

<div class="flex flex-col gap-4 {className}">
	<h2 class="text-2xl font-bold text-app">Processing: {zipFile.name}</h2>

	{#if processingStep === MangaProcessingStep.LOADING || processingStep === MangaProcessingStep.EXTRACTING || processingStep === MangaProcessingStep.SERIES_LOOKUP || processingStep === MangaProcessingStep.APPLYING_REGEX || processingStep === MangaProcessingStep.CHAPTER_LOOKUP || processingStep === MangaProcessingStep.LOADING_GROUPS || processingStep === MangaProcessingStep.APPLYING_GROUPS || processingStep === MangaProcessingStep.APPLYING_TITLES}
		<div class="flex flex-col gap-2 items-center">
			<div class="animate-spin rounded-full h-8 w-8 outline-dotted outline-5 border-surface"></div>
			<p class="text-sm text-muted">
				{PROCESSING_MESSAGES[processingStep]}
			</p>
			{#if currentlyProcessingZip}
				<p class="text-xs text-muted">Processing: {currentlyProcessingZip}</p>
			{/if}
		</div>
	{:else if processingStep === MangaProcessingStep.READY || processingStep === MangaProcessingStep.READY_WARNING}
		<div class="flex flex-col gap-4">
			<div class="bg-surface rounded-md p-4">
				<p class="text-sm text-app">
					Found {chapters.length} chapter{chapters.length === 1 ? '' : 's'} from deepest folders
				</p>
			</div>

			<div class="flex flex-col gap-2">
				<h3 class="text-lg font-semibold text-app">Series Selection (Required)</h3>
				<TargetingSeriesValidator />
				<SeriesChapterDumpLookup />
				<TargetingSeriesSearch />
			</div>

			<div class="flex flex-col gap-2">
				<h3 class="text-lg font-semibold text-app">Group Selection</h3>
				<p class="text-sm text-muted">
					Groups are automatically loaded from the chapter dump. You can manually add additional
					groups here if needed.
				</p>
				<TargetingGroupValidator />
				<TargetingGroupSearch />
			</div>

			<BatchGroupAssignment {chapters} onGroupAssigned={reEvaluateWarningsAfterBatchAssign} />

			<ProcessingWarningSummary
				{processingStep}
				hasSeriesId={!!targetingState.seriesId}
				duplicateCount={duplicateChapters.length}
				{dumpLookupFailed}
				{dumpLookupFailedGroups}
				{dumpLookupFailedTitles}
				partialGroupMatchesCount={partialGroupMatches.length}
				{chaptersWithNoGroups}
				{chaptersWithNoValidGroups}
				{chaptersWithNoChapterInfo}
				{chaptersWithVolumeMismatch}
			/>

			<PartialGroupMatchWarning {partialGroupMatches} />

			<DuplicateChapterWarning
				{duplicateChapters}
				onMarkAllRemoved={() => {
					for (const { chapter } of duplicateChapters) {
						chapter.isDeleted = true;
					}
				}}
				onToggleRemoved={(chapter) => {
					chapter.isDeleted = !chapter.isDeleted;
				}}
			/>

			<ChapterListDisplay
				{chapters}
				{chaptersWithWarningsCount}
				{chapterHasWarning}
				{getChapterWarningText}
				{getChapterWarningReasons}
				bind:showOnlyWarnings
			/>

			<button
				type="button"
				class="btn-primary w-full px-6 py-3 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={!canStartUpload || !targetingState.seriesId || nonDeletedChapters.length === 0}
				onclick={startUpload}
			>
				Start Upload ({nonDeletedChapters.length} of {chapters.length} chapters)
			</button>
		</div>
	{:else if processingStep === MangaProcessingStep.UPLOADING}
		<UploaderOrchestrator
			onDone={handleUploadDone}
			bind:busy={uploadWorking}
			bind:this={uploaderOrchestratorRef}
		/>
	{:else if processingStep === MangaProcessingStep.COMPLETED}
		<div class="bg-green-500/20 dark:bg-green-500/10 border-1 border-green-500 rounded-md p-4">
			<p class="text-sm font-semibold text-green-600 dark:text-green-400">
				✓ Upload completed successfully!
			</p>
		</div>
	{/if}
</div>
