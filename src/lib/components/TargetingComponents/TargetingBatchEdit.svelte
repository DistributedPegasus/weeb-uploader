<script lang="ts">
	import { ChapterUploadingGroup, type ChapterState } from '$lib/core/UploadingState.svelte';
	import RangeProvider from '../Common/RangeProvider.svelte';
	import TargetingEditableGroup from './TargetingEditableGroup.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import { languages, getLanguageDisplayText } from './LanguageOptions.svelte';
	import InfoIcon from '../Common/InfoIcon.svelte';

	interface Props {
		chapters: ChapterState[];
	}

	let { chapters: chapterStates = $bindable<ChapterState[]>([]) }: Props = $props();

	let titleRegex = $state('- (.+)$');
	let titleCaseSensitive = $state(false);
	let volumeRegex = $state('Vol\\.? ?(\\d+)');
	let volumeCaseSensitive = $state(false);
	let chapterRegex = $state('(?:Ch\\.?|Chapter) ?(\\d+(?:\\.\\d+)?)');
	let chapterCaseSensitive = $state(false);

	let groups = $state<ChapterUploadingGroup>(new ChapterUploadingGroup());
	let volumeValue = $state<string | null>(null);
	let languageValue = $state<string>('en');
	let useTitleAsSource = $state(false);

	// starting index: 1
	const groupRange = $state({
		start: null,
		end: null
	});
	const volumeAssignmentRange = $state({
		start: null,
		end: null
	});
	const languageAssignmentRange = $state({
		start: null,
		end: null
	});
	const titleRange = $state({
		start: null,
		end: null
	});
	const volumeRange = $state({
		start: null,
		end: null
	});
	const chapterNumberRange = $state({
		start: null,
		end: null
	});

	function applyTitleRegex() {
		if (!titleRegex.trim()) return;

		const flags = titleCaseSensitive ? '' : 'i';
		const regex = new RegExp(titleRegex, flags);
		const start = (titleRange.start ?? 1) - 1;
		const end = (titleRange.end ?? chapterStates.length) - 1;

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			const sourceText = useTitleAsSource ? chapter.chapterTitle : chapter.originalFolderPath;
			if (!sourceText) continue;
			// Skip if title was manually edited
			if (chapter.manuallyEditedFields.has('title')) continue;

			const match = sourceText.match(regex);
			if (match && match[1]) {
				chapter.chapterTitle = match[1];
			}
		}
	}

	function applyVolumeRegex() {
		if (!volumeRegex.trim()) return;

		const flags = volumeCaseSensitive ? '' : 'i';
		const regex = new RegExp(volumeRegex, flags);
		const start = (volumeRange.start ?? 1) - 1;
		const end = (volumeRange.end ?? chapterStates.length) - 1;

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			const sourceText = useTitleAsSource ? chapter.chapterTitle : chapter.originalFolderPath;
			if (!sourceText) continue;
			// Skip if volume was manually edited
			if (chapter.manuallyEditedFields.has('volume')) continue;

			const match = sourceText.match(regex);
			if (match && match[1]) {
				// handle leading zeros
				chapter.chapterVolume = match[1].replace(/^0+/, '');
			}
		}
	}

	function applyChapterNumberRegex() {
		if (!chapterRegex.trim()) return;

		const flags = chapterCaseSensitive ? '' : 'i';
		const regex = new RegExp(chapterRegex, flags);
		const start = (chapterNumberRange.start ?? 1) - 1;
		const end = (chapterNumberRange.end ?? chapterStates.length) - 1;

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			const sourceText = useTitleAsSource ? chapter.chapterTitle : chapter.originalFolderPath;
			if (!sourceText) continue;
			// Skip if chapterNumber was manually edited
			if (chapter.manuallyEditedFields.has('chapterNumber')) continue;

			const match = sourceText.match(regex);
			if (match && match[1]) {
				// handle leading zeros
				chapter.chapterNumber = match[1].replace(/^0+/, '');
			}
		}
	}

	function resetTitles() {
		chapterStates.forEach((chapter) => {
			// Skip if title was manually edited
			if (chapter.manuallyEditedFields.has('title')) return;
			chapter.chapterTitle = chapter.originalFolderPath?.split('/').pop() ?? '';
		});
	}

	function clearTitles() {
		chapterStates.forEach((chapter) => {
			// Skip if title was manually edited
			if (chapter.manuallyEditedFields.has('title')) return;
			chapter.chapterTitle = '';
		});
	}

	function applyGroupsToRange() {
		const start = (groupRange.start ?? 1) - 1;
		const end = (groupRange.end ?? chapterStates.length) - 1;
		const groupIds = groups.groupIds ?? [];

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			// Skip if groups were manually edited
			if (chapter.manuallyEditedFields.has('groups')) continue;
			chapter.associatedGroup.groupIds = [...groupIds];
		}
	}

	function appendGroupsToRange() {
		const start = (groupRange.start ?? 1) - 1;
		const end = (groupRange.end ?? chapterStates.length) - 1;
		const groupIds = groups.groupIds ?? [];

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			// Skip if groups were manually edited
			if (chapter.manuallyEditedFields.has('groups')) continue;

			const existing = chapter.associatedGroup.groupIds ?? [];
			const newGroups = [...existing, ...groupIds];
			const uniqueGroups = [...new Set(newGroups)];
			chapter.associatedGroup.groupIds = uniqueGroups;
		}
	}

	function applyVolumeToRange() {
		const start = (volumeAssignmentRange.start ?? 1) - 1;
		const end = (volumeAssignmentRange.end ?? chapterStates.length) - 1;
		const volume = volumeValue?.trim() || null;

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			// Skip if volume was manually edited
			if (chapter.manuallyEditedFields.has('volume')) continue;
			chapter.chapterVolume = volume;
		}
	}

	function applyLanguageToRange() {
		const start = (languageAssignmentRange.start ?? 1) - 1;
		const end = (languageAssignmentRange.end ?? chapterStates.length) - 1;
		const language = languageValue?.trim() || 'en';

		for (let i = start; i <= end; i++) {
			const chapter = chapterStates[i];
			// Skip if language was manually edited
			if (chapter.manuallyEditedFields.has('language')) continue;
			// Update the original value to the new language so it's not marked as manually edited
			// This ensures batch assignments don't trigger the manual edit detection
			chapter.originalFieldValues.set('language', language);
			chapter.language = language;
			// Ensure it's not marked as manually edited
			chapter.manuallyEditedFields.delete('language');
		}
	}
</script>

<div class="flex flex-col gap-2">
	<p class="text-app">
		Use the batch editing tools below to apply changes to multiple chapters at once. Each option has
		a question mark icon (<span class="i-mdi-help-circle inline-block h-4 w-4 text-app"></span>)
		that you can click for detailed information about that specific feature.
		<br />
		<br />
		<b>Ranges:</b> Most batch operations support range selection. Ranges target chapters by their
		index number (shown in the top-left corner of each chapter in the chapter list below).
		<br />
		<b>Range values are inclusive</b> - if you specify range 1-5, it will affect chapters at
		positions 1, 2, 3, 4, and 5. If no range is specified, the operation applies to all chapters.
		<br />
		<b>Ranges can be open</b> - you can leave the start or end value empty to open the range to the
		start or end of the chapter list.
		<br />
		<br />
		<b>Case Sensitivity:</b> Regex extraction options have a "Case Sensitive" checkbox. When
		unchecked (default), the regex will match regardless of letter case (e.g., "Vol" matches "vol",
		"VOL", "Vol"). When checked, the regex will only match the exact case you specify.
		<br />
		<br />
		<b>Manual Edits:</b> Batch operations automatically skip chapters that have been manually
		edited, preserving your custom changes. You can manually edit individual chapter properties by
		clicking on them directly in the chapter list below.
		<br />
		<br />
		<b>Empty Values:</b> To remove an assigned volume or title, you can batch edit it to an empty
		string - empty values are considered as "not assigned" (no volume/title).
		<br />
		<br />
		<b>Groups:</b> Before assigning groups to chapters, you must first register them in the Group Preparation
		section above. Once registered, groups become available for assignment here.
	</p>

	<div class="flex flex-row gap-5 bg-surface rounded-md p-2 mb-10 items-center">
		<InfoIcon title="Quick Actions" position="bottom">
			<p class="text-app text-sm">
				Quick actions to reset or clear chapter titles across all chapters.
				<br />
				<br />
				<b>Clear Titles:</b> Removes all chapter titles (sets them to empty strings).
				<br />
				<b>Reset Titles:</b> Restores chapter titles to their original folder path names.
				<br />
				<br />
				Note: These actions will skip chapters that have been manually edited, preserving your custom
				changes. Manually edited in this context means that you changed the title directly on the chapter.
			</p>
		</InfoIcon>
		<p class="font-bold text-app">Quick unfuckup actions:</p>

		<button type="button" class="btn-neutral rounded-md px-2 py-1" onclick={clearTitles}>
			Clear Titles
		</button>
		<button type="button" class="btn-neutral rounded-md px-2 py-1" onclick={resetTitles}>
			Reset Titles
		</button>
	</div>

	<!-- Regex Source Toggle -->
	<div class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center mb-2">
		<InfoIcon title="Regex Source Selection" position="bottom">
			<p class="text-app text-sm">
				By default, regex patterns are applied to the folder path. Enable this option to use the
				chapter title as the source instead.
				<br />
				<br />
				This is particularly useful for .cbz archives where metadata (like volume or chapter numbers)
				is embedded in the chapter title but not present in the folder path structure.
			</p>
		</InfoIcon>
		<label class="flex flex-row gap-2 items-center">
			<input type="checkbox" bind:checked={useTitleAsSource} class="w-5 h-5" />
			<span class="text-app font-bold">
				Use Chapter Title as Regex Source (instead of Folder Path)
			</span>
		</label>
		<p class="text-app text-sm ml-2">
			Useful for .cbz archives where information is in the title but not the path
		</p>
	</div>

	<!-- Title Regex -->
	<form
		onsubmit={(e) => {
			applyTitleRegex();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<InfoIcon title="Extract Title Regex" position="bottom">
				<p class="text-app text-sm">
					Regex pattern to extract the chapter title from the folder path or chapter title
					(depending on the source selection above).
					<br />
					<br />
					The first capture group will be used as the extracted title. Use non-capturing groups
					<code class="bg-surface-hover px-1 rounded">(?:...)</code> for parts you want to match but
					not extract.
					<br />
					<br />
					Example: <code class="bg-surface-hover px-1 rounded">- (.+)$</code> extracts everything after
					" - " at the end of the string.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Extract Title Regex:</p>
			<input
				type="text"
				bind:value={titleRegex}
				placeholder="^(.+?)\s+-\s+Vol"
				class="input-base grow-1"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<label class="flex flex-row gap-1 items-center whitespace-nowrap mr-3">
				<input type="checkbox" bind:checked={titleCaseSensitive} class="w-5 h-5" />
				<span class="text-app">Case Sensitive</span>
			</label>

			<RangeProvider
				bind:rangeStart={titleRange.start}
				bind:rangeEnd={titleRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Volume Regex -->
	<form
		onsubmit={(e) => {
			applyVolumeRegex();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<InfoIcon title="Extract Volume Regex" position="bottom">
				<p class="text-app text-sm">
					Regex pattern to extract the volume number from the folder path or chapter title.
					<br />
					<br />
					The first capture group should contain the volume number. Leading zeros are automatically removed
					from the extracted value.
					<br />
					<br />
					Example: <code class="bg-surface-hover px-1 rounded">Vol\.? ?(\d+)</code> matches "Vol 1",
					"Vol. 2", "Vol3", etc., and extracts the number.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Extract Volume Regex:</p>
			<input
				type="text"
				bind:value={volumeRegex}
				placeholder="Vol\.? ?(\d+)"
				class="input-base grow-1"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<label class="flex flex-row gap-1 items-center whitespace-nowrap mr-3">
				<input type="checkbox" bind:checked={volumeCaseSensitive} class="w-5 h-5" />
				<span class="text-app">Case Sensitive</span>
			</label>

			<RangeProvider
				bind:rangeStart={volumeRange.start}
				bind:rangeEnd={volumeRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Chapter Number Regex -->
	<form
		onsubmit={(e) => {
			applyChapterNumberRegex();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<InfoIcon title="Extract Chapter Number Regex" position="bottom">
				<p class="text-app text-sm">
					Regex pattern to extract the chapter number from the folder path or chapter title.
					<br />
					<br />
					The first capture group will be used as the extracted chapter number. Leading zeros are automatically
					removed. Decimal chapter numbers (e.g., 1.5, 2.1) are supported.
					<br />
					<br />
					Example:
					<code class="bg-surface-hover px-1 rounded">(?:Ch\.?|Chapter) ?(\d+(?:\.\d+)?)</code>
					matches "Ch 1", "Chapter 2.5", "Ch.3", etc., and extracts the number.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Extract Chapter Number Regex</p>
			<input
				type="text"
				bind:value={chapterRegex}
				placeholder="Ch\.? ?(\d+)"
				class="input-base grow-1"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<label class="flex flex-row gap-1 items-center whitespace-nowrap mr-3">
				<input type="checkbox" bind:checked={chapterCaseSensitive} class="w-5 h-5" />
				<span class="text-app">Case Sensitive</span>
			</label>

			<RangeProvider
				bind:rangeStart={chapterNumberRange.start}
				bind:rangeEnd={chapterNumberRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Volume Assignment -->
	<form
		onsubmit={(e) => {
			applyVolumeToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<InfoIcon title="Assign Volume" position="bottom">
				<p class="text-app text-sm">
					Directly assign a volume number to chapters. This overrides any volume extracted via
					regex.
					<br />
					<br />
					You can specify a range to apply the volume only to specific chapters. If no range is specified,
					it applies to all chapters.
					<br />
					<br />
					To remove a volume assignment, set this to an empty string and apply it.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Assign Volume to All Chapters:</p>
			<input
				type="text"
				bind:value={volumeValue}
				placeholder="Volume number"
				class="input-base min-w-20"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={volumeAssignmentRange.start}
				bind:rangeEnd={volumeAssignmentRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Language Assignment -->
	<form
		onsubmit={(e) => {
			applyLanguageToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<InfoIcon title="Assign Language" position="bottom">
				<p class="text-app text-sm">
					Set the language for chapters.
					<br />
					<br />
					You can specify a range to apply the language only to specific chapters. If no range is specified,
					it applies to all chapters.
					<br />
					<br />
					The default language is English (en), but you can select any supported language from the dropdown.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Assign Language to All Chapters:</p>
			<DropdownSingleSelector
				items={languages.map((l) => l.id)}
				bind:selectedItem={languageValue}
				getDisplayText={(id) => {
					const lang = languages.find((l) => l.id === id);
					return lang ? getLanguageDisplayText(lang) : id;
				}}
				class="text-sm"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={languageAssignmentRange.start}
				bind:rangeEnd={languageAssignmentRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Groups -->
	<form
		onsubmit={(e) => {
			applyGroupsToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2">
			<InfoIcon title="Assign Groups" position="bottom">
				<p class="text-app text-sm">
					Assign scanlation groups to chapters. Groups must be registered in the Group Preparation
					section above before they can be assigned here.
					<br />
					<br />
					<b>Set Group(s):</b> Replaces all existing groups with the selected ones.
					<br />
					<b>Append Group(s):</b> Adds the selected groups to any existing groups (removes
					duplicates).
					<br />
					<br />
					You can specify a range to apply groups only to specific chapters. If no range is specified,
					it applies to all chapters.
				</p>
			</InfoIcon>
			<p class="font-bold text-app">Assign Groups to All Chapters:</p>
			<TargetingEditableGroup bind:groups />
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={groupRange.start}
				bind:rangeEnd={groupRange.end}
				min={1}
				max={chapterStates.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Set Group(s) </button>

			<button type="button" class="btn-primary rounded-md px-2 py-1" onclick={appendGroupsToRange}>
				Append Group(s)
			</button>
		</div>
	</form>
</div>
