<script lang="ts">
	import { getFoldersAtDepth, SelectedFile, SelectedFolder } from '$lib/core/GroupedFolders';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';

	interface Props {
		selectedFolder: SelectedFolder;
		slicedFolders: SelectedFolder[] | null;
		class?: string;
	}

	let {
		selectedFolder,
		class: className = '',
		slicedFolders = $bindable<SelectedFolder[] | null>(null)
	}: Props = $props();

	let maximumLevels = $derived(selectedFolder.depth);

	let chapterNameLevel = $state<string>('1');
	let fileLevel = $state<string>('1');
	let filePathFilter = $state<string>('');
	let isRegexCaseSensitive = $state<boolean>(false);
	let hasInitialized = $state(false);

	// Initialize to deepest level on mount
	$effect(() => {
		if (!hasInitialized && maximumLevels > 0) {
			const deepestLevel = maximumLevels.toString();
			chapterNameLevel = deepestLevel;
			fileLevel = deepestLevel;
			hasInitialized = true;
		}
	});

	$effect(() => {
		if (chapterNameLevel && fileLevel && parseInt(fileLevel) < parseInt(chapterNameLevel)) {
			fileLevel = chapterNameLevel;
		}

		const foldersAtChapterNameLevel = getFoldersAtLevel(parseInt(chapterNameLevel), selectedFolder);
		const filteredFolders = filterFilesByPath(foldersAtChapterNameLevel, filePathFilter);

		// natural sort the folders
		filteredFolders.sort((a, b) => a.name.localeCompare(b.name));

		slicedFolders = filteredFolders;
	});

	function getFoldersAtLevel(level: number, fromFolder: SelectedFolder) {
		let foldersMatched: SelectedFolder[] = [];

		for (const folder of fromFolder.folders) {
			// we're at the level we're looking for
			if (folder.level === level) {
				foldersMatched.push(folder);
				continue;
			}

			// we're looking for a deeper level, so we need to recurse
			if (folder.level < level) {
				foldersMatched.push(...getFoldersAtLevel(level, folder));
			}
		}

		return foldersMatched;
	}

	function getFilesFromFolder(folder: SelectedFolder) {
		const folderFiles = folder.files;

		let nestedFiles: SelectedFile[] = [];
		for (const nestedFolder of folder.folders) {
			nestedFiles.push(...getFilesFromFolder(nestedFolder));
		}

		return [...folderFiles, ...nestedFiles];
	}

	function filterFilesByPath(folders: SelectedFolder[], regex: string) {
		let filteredFolders: SelectedFolder[] = [];

		const trimRegex = regex.trim();

		// figure out if we have a regex even
		if (trimRegex === '') {
			// If we don't, we just go over all the files and their items
			for (const folder of folders) {
				const files = getFilesFromFolder(folder);

				if (files.length === 0) {
					continue;
				}

				filteredFolders.push(
					new SelectedFolder(folder.name, folder.path, files, [], folder.level, 0)
				);
			}

			return filteredFolders;
		}

		const filterRegex = new RegExp(trimRegex, isRegexCaseSensitive ? 'g' : 'gi');

		// we go over all folders and filter the files by the regex
		for (const folder of folders) {
			const files = getFilesFromFolder(folder);
			const validFiles = files.filter((file) => filterRegex.test(file.path));

			// if we have no valid files, we can ignore this folder
			if (validFiles.length === 0) {
				continue;
			}

			// we can ignore any nested folders at this level, we're at a point where we only care about the files
			filteredFolders.push(
				new SelectedFolder(folder.name, folder.path, validFiles, [], folder.level, 0)
			);
		}

		return filteredFolders;
	}

	function setExampleExclusionRegex() {
		filePathFilter = '^(?!.*filename).*$';
	}

	function setExampleInclusionRegex() {
		filePathFilter = 'filename';
	}
</script>

<div class={['flex flex-col gap-2', className]}>
	<h2 class="text-md font-bold text-app">Vertical Slice Pane - {maximumLevels}</h2>

	<div class="grid grid-cols-2 gap-2">
		<div class="flex flex-col gap-2 justify-between p-4 bg-surface rounded-lg">
			<div>
				<h3 class="text-sm font-bold text-app">Chapter Name Level</h3>
				<p class="text-sm text-muted">
					This is the level at which folders will be grouped into chapters (the L numbering on the
					directory explorer). The folders at this level will be used to group together chapters.
				</p>
			</div>
			<DropdownSingleSelector
				items={Array.from({ length: maximumLevels }, (_, i) => i + 1).map((level) =>
					level.toString()
				)}
				bind:selectedItem={chapterNameLevel}
				class="w-full"
			/>
		</div>

		<div class="flex flex-col gap-2 justify-between p-4 bg-surface rounded-lg">
			<div>
				<h3 class="text-sm font-bold text-app">File Level</h3>
				<p class="text-sm text-muted">
					This is the level at which files inside folders will be considered as being a part of the
					chapter (the L numbering on the directory explorer). Only files contained within folders
					at this level will be considered as being a part of the chapter.
				</p>
			</div>
			<DropdownSingleSelector
				items={Array.from({ length: maximumLevels }, (_, i) => i + 1).map((level) =>
					level.toString()
				)}
				bind:selectedItem={fileLevel}
				class="w-full"
			/>
		</div>
	</div>

	<div class="flex flex-col gap-2 justify-between p-4 bg-surface rounded-lg">
		<div>
			<h3 class="text-sm font-bold text-app">File Path Filter</h3>
			<p class="text-sm text-muted">
				This is a regex filter that will be applied in addition to the file level selector. This is
				useful if you have multiple files at the same file level, but are only really interested in
				a subset of them.
			</p>
		</div>
		<div class="flex flex-row gap-2">
			<button
				onclick={setExampleExclusionRegex}
				type="button"
				class="px-2 py-1 clickable-hint rounded-md"
			>
				Set Example Exclusion Regex
			</button>
			<button
				onclick={setExampleInclusionRegex}
				type="button"
				class="px-2 py-1 clickable-hint rounded-md"
			>
				Set Example Inclusion Regex
			</button>
			<div class="flex flex-row gap-2 items-center">
				<input
					type="checkbox"
					bind:checked={isRegexCaseSensitive}
					class="w-5 h-5 text-green-600 dark:text-green-400 rounded focus:ring-green-500"
				/>
				<label for="isRegexCaseSensitive" class="text-sm text-muted">Case Sensitive</label>
			</div>
		</div>

		<input
			type="text"
			bind:value={filePathFilter}
			placeholder="Filter files by path regex..."
			class="input-base w-full"
		/>
	</div>
</div>
