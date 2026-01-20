<script lang="ts">
	import * as zip from '@zip.js/zip.js';
	import ImageProcessorWorker from './imageProcessor.worker.ts?worker';

	// Configure zip.js to disable web workers
	// This may help avoid the outputSize error that occurs when workers aren't properly initialized
	zip.configure({
		useWebWorkers: false
	});

	interface Props {
		selectedFiles: File[] | null;
		class?: string;
		onDone: () => void;
	}

	let {
		selectedFiles = $bindable<File[] | null>(null),
		class: className = '',
		onDone
	}: Props = $props();

	let inputElementRef: HTMLInputElement | null = $state(null);
	let isExtracting = $state(false);
	let currentlyProcessingFile = $state<string | null>(null);
	let extractionProgress = $state<{ current: number; total: number } | null>(null);
	let problematicFiles = $state<
		Array<{ file: File; path: string; detectedType: string; actualExtension: string }>
	>([]);
	let isValidating = $state(false);
	let validationProgress = $state<{ current: number; total: number } | null>(null);
	let isTransforming = $state(false);
	let transformationProgress = $state<{ current: number; total: number } | null>(null);

	let enableTransform = $state(false);

	const allowedMimeTypes = [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/gif',
		'image/webp',
		'application/vnd.comicbook+zip', // .cbz is a zip file
		'application/zip', // .zip files
		'application/json',
		'text/xml' // comicinfo.xml
	];

	const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'cbz', 'zip', 'xml'];

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
			// entry.filename is guaranteed to be defined because we filtered validEntries
			const entryPath = entry.filename!;

			// Update progress display with path within archive
			currentlyProcessingFile = entryPath;
			extractionProgress = { current: currentIndex, total: totalFiles };

			// Check if the entry is an image file
			const entryExtension = entry.filename.split('.').pop()?.toLowerCase();
			if (!entryExtension || !allowedExtensions.includes(entryExtension)) {
				continue;
			}

			// Extract the file content with error handling for problematic entries
			// Type guard: we've already filtered out directories, so this is safe
			if (entry.directory) {
				continue;
			}

			const entryStream = new TransformStream();
			const blobPromise = new Response(entryStream.readable).blob();

			// Write the entry data to the stream
			await entry.getData(entryStream.writable);

			// Get the blob from the stream
			let blob = await blobPromise;

			// Ensure blob has correct MIME type
			if (!blob.type) {
				const mimeType = getMimeTypeFromExtension(entryExtension);
				blob = new Blob([blob], { type: mimeType });
			}

			// Preserve the full path from the archive, including directory structure
			const fileName = entryPath.split('/').pop() ?? entryPath;

			// Create a File object with a virtual path
			// The path will be: {originalPath}/{archiveBaseName}/{entryPath}
			// This preserves the directory structure inside the archive
			// entryPath already includes any subdirectories (e.g., "chapter1/page1.png")
			const virtualPath = originalPath.includes('/')
				? `${originalPath.split('/').slice(0, -1).join('/')}/${archiveBaseName}/${entryPath}`
				: `${archiveBaseName}/${entryPath}`;

			const virtualFile = new File([blob], fileName, {
				type: blob.type
			});

			// Set the webkitRelativePath to create the virtual folder structure
			Object.defineProperty(virtualFile, 'webkitRelativePath', {
				value: virtualPath,
				writable: false,
				enumerable: true,
				configurable: true
			});

			extractedFiles.push(virtualFile);
		}

		await zipReader.close();
		currentlyProcessingFile = null;
		extractionProgress = null;

		return extractedFiles;
	}

	/**
	 * Gets MIME type from file extension
	 */
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

	/**
	 * Detects the actual image type from magic numbers
	 * Returns the detected extension or null if not a recognized image format
	 */
	async function detectImageTypeFromMagicNumber(file: File): Promise<string | null> {
		// Read first 12 bytes to detect image type
		const buffer = await file.slice(0, 12).arrayBuffer();
		const bytes = new Uint8Array(buffer);

		// PNG: 89 50 4E 47 0D 0A 1A 0A
		if (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47
		) {
			return 'png';
		}

		// JPEG: FF D8 FF
		if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
			return 'jpg';
		}

		// GIF: 47 49 46 38 39 61 (GIF89a) or 47 49 46 38 37 61 (GIF87a)
		if (
			bytes.length >= 6 &&
			bytes[0] === 0x47 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x38 &&
			(bytes[4] === 0x39 || bytes[4] === 0x37) &&
			bytes[5] === 0x61
		) {
			return 'gif';
		}

		// WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
		if (
			bytes.length >= 12 &&
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46 &&
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50
		) {
			return 'webp';
		}

		return null;
	}

	/**
	 * Validates image files by checking if their extension matches their magic number
	 * Returns array of problematic files with their paths and detected types
	 */
	async function validateImageFiles(
		files: File[]
	): Promise<Array<{ file: File; path: string; detectedType: string; actualExtension: string }>> {
		const problematic: Array<{
			file: File;
			path: string;
			detectedType: string;
			actualExtension: string;
		}> = [];
		const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

		// Filter to only image files for progress tracking
		const imageFiles = files.filter((file) => {
			const extension = file.name.split('.').pop()?.toLowerCase();
			return extension && imageExtensions.includes(extension);
		});

		const totalFiles = imageFiles.length;
		let currentIndex = 0;

		for (const file of imageFiles) {
			currentIndex++;
			const extension = file.name.split('.').pop()?.toLowerCase();

			// Update progress
			const filePath = file.webkitRelativePath ?? file.name;
			currentlyProcessingFile = filePath;
			validationProgress = { current: currentIndex, total: totalFiles };

			const detectedType = await detectImageTypeFromMagicNumber(file);

			// If we couldn't detect a type, skip (might not be an image or corrupted)
			if (!detectedType) {
				continue;
			}

			// Handle jpeg/jpg equivalence
			const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
			const normalizedDetectedType = detectedType === 'jpeg' ? 'jpg' : detectedType;

			// If detected type doesn't match the extension
			if (normalizedDetectedType !== normalizedExtension && extension) {
				const path = (file as any).webkitRelativePath || file.name;
				problematic.push({
					file,
					path,
					detectedType,
					actualExtension: extension
				});
			}
		}

		currentlyProcessingFile = null;
		validationProgress = null;
		return problematic;
	}

	/**
	 * Processes a single image file using a web worker
	 */
	async function processImageFileForResolutionValidation(file: File): Promise<File[]> {
		const extension = file.name.split('.').pop()?.toLowerCase();
		const mimeType = getMimeTypeFromExtension(extension ?? '');
		const fileName = file.name;
		const filePath = file.webkitRelativePath || file.name;

		// Create a worker for this file
		// Using Vite's ?worker import ensures correct path resolution with base paths
		const worker = new ImageProcessorWorker();

		return new Promise((resolve, reject) => {
			worker.addEventListener('message', async (e) => {
				worker.terminate();

				if (e.data.type === 'error') {
					reject(new Error(e.data.error));
					return;
				}

				if (e.data.type === 'success') {
					const newFiles: File[] = [];
					for (const fileData of e.data.files) {
						const blob = new Blob([fileData.buffer], { type: fileData.mimeType });
						const newFile = new File([blob], fileData.name, { type: blob.type });

						Object.defineProperty(newFile, 'webkitRelativePath', {
							value: fileData.path,
							writable: false,
							enumerable: true,
							configurable: true
						});

						newFiles.push(newFile);
					}
					resolve(newFiles);
				}
			});

			worker.addEventListener('error', (error) => {
				worker.terminate();
				reject(error);
			});

			// Send the file data to the worker
			file.arrayBuffer().then((buffer) => {
				worker.postMessage({
					type: 'process',
					fileData: buffer,
					fileName,
					filePath,
					extension: extension ?? '',
					mimeType
				});
			});
		});
	}

	/**
	 * Processes multiple image files in parallel using web workers
	 */
	async function processImageFilesForResolutionValidation(files: File[]): Promise<File[]> {
		// Process files in parallel with a concurrency limit to avoid overwhelming the system
		const CONCURRENT_WORKERS = 4;
		const processedFiles: File[] = [];
		const totalFiles = files.length;

		// Process files in batches
		for (let i = 0; i < files.length; i += CONCURRENT_WORKERS) {
			const batch = files.slice(i, i + CONCURRENT_WORKERS);
			const batchStartIndex = i;
			const batchEndIndex = Math.min(batchStartIndex + batch.length, totalFiles);

			// Update progress to show the range being processed
			// Show the first file in the batch as the current file
			const firstFileInBatch = batch[0];
			if (firstFileInBatch) {
				const filePath = firstFileInBatch.webkitRelativePath || firstFileInBatch.name;
				currentlyProcessingFile = filePath;
				transformationProgress = { current: batchEndIndex, total: totalFiles };
			}

			const batchResults = await Promise.all(
				batch.map((file) => processImageFileForResolutionValidation(file))
			);
			processedFiles.push(...batchResults.flat());
		}

		currentlyProcessingFile = null;
		transformationProgress = null;
		return processedFiles;
	}

	async function handleChangeFiles(event: Event) {
		isExtracting = true;
		problematicFiles = [];
		currentlyProcessingFile = null;
		extractionProgress = null;
		validationProgress = null;
		transformationProgress = null;

		const input = event.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);

		// Separate archive files (.cbz and .zip) from other files
		const archiveFiles = files.filter((file) => {
			const extension = file.name.split('.').pop()?.toLowerCase();
			return extension === 'cbz' || extension === 'zip';
		});

		const otherFiles = files.filter((file) => {
			const extension = file.name.split('.').pop()?.toLowerCase();
			const mimeType = file.type;
			return (
				extension !== 'cbz' &&
				extension !== 'zip' &&
				allowedExtensions.includes(extension ?? '') &&
				allowedMimeTypes.includes(mimeType)
			);
		});

		// Extract all archive files and get their contents
		const extractedFiles: File[] = [];
		for (const archiveFile of archiveFiles) {
			try {
				const filesFromArchive = await extractArchiveFile(archiveFile);
				extractedFiles.push(...filesFromArchive);
			} catch (error) {
				console.error(`Error extracting ${archiveFile.name}:`, error);
			}
		}

		// Combine other files with extracted files, filtering out the original archive files
		const combinedFiles = [...otherFiles, ...extractedFiles];

		// Deduplicate files by path
		const deduplicatedFiles = combinedFiles.filter(
			(file, index, self) =>
				index === self.findIndex((t) => t.webkitRelativePath === file.webkitRelativePath)
		);

		console.log('Selected files:', deduplicatedFiles);

		isExtracting = false;
		isValidating = true;

		// Validate image files for correct extensions based on magic numbers
		problematicFiles = await validateImageFiles(deduplicatedFiles);
		isValidating = false;

		if (problematicFiles.length > 0) {
			return;
		}

		if (enableTransform) {
			isTransforming = true;
			selectedFiles = await processImageFilesForResolutionValidation(deduplicatedFiles);
			isTransforming = false;
		} else {
			selectedFiles = deduplicatedFiles;
		}

		onDone();
	}

	function onClick(e: Event) {
		inputElementRef?.click();
	}
</script>

<div class="flex flex-col justify-center items-center gap-4">
	<div class="flex flex-row gap-2 items-center">
		<input
			id="enable-transform"
			type="checkbox"
			bind:checked={enableTransform}
			disabled={isExtracting || isValidating || isTransforming}
			class="text-sm text-muted cursor-pointer"
		/>
		<label for="enable-transform" class="text-sm text-muted cursor-pointer">
			Auto Image Resolution Transform (will split images higher than 10000px in height into smaller
			chunks - 5000px)
		</label>
	</div>

	<button
		class="flex flex-col justify-center items-center clickable-hint b-2 border-surface rounded-md p-4 {className} disabled:opacity-50 disabled:cursor-not-allowed"
		onclick={onClick}
		disabled={isExtracting || isValidating || isTransforming}
	>
		<h1 class="font-bold text-app">Folder Selector</h1>
		<input
			class="hidden"
			bind:this={inputElementRef}
			type="file"
			webkitdirectory={true}
			multiple={true}
			onchange={handleChangeFiles}
		/>
	</button>

	{#if isExtracting || isValidating || isTransforming}
		<div class="flex flex-col justify-center items-center gap-2">
			<div class="animate-spin rounded-full h-8 w-8 outline-dotted outline-5 border-surface"></div>
			{#if isTransforming}
				<p class="text-sm text-muted">Transforming files...</p>
				{#if transformationProgress}
					<p class="text-xs text-muted">
						Progress: {transformationProgress.current} / {transformationProgress.total}
					</p>
				{/if}
			{:else if isValidating}
				<p class="text-sm text-muted">Validating files...</p>
				{#if validationProgress}
					<p class="text-xs text-muted">
						Progress: {validationProgress.current} / {validationProgress.total}
					</p>
				{/if}
			{:else if isExtracting}
				<p class="text-sm text-muted">Extracting files...</p>
				{#if extractionProgress}
					<p class="text-xs text-muted">
						Progress: {extractionProgress.current} / {extractionProgress.total}
					</p>
				{/if}
			{/if}
			{#if currentlyProcessingFile}
				<p class="text-xs text-muted">Processing: {currentlyProcessingFile}</p>
			{/if}
		</div>
	{/if}

	{#if problematicFiles.length > 0}
		<div class="flex flex-col gap-2 w-full max-w-2xl">
			<p class="text-sm font-semibold text-red-500">
				Found {problematicFiles.length} file{problematicFiles.length === 1 ? '' : 's'} with incorrect
				extensions:
			</p>
			<div class="flex flex-col gap-1 max-h-64 overflow-y-auto">
				{#each problematicFiles as { file, path, detectedType, actualExtension }}
					<div class="text-sm text-muted border-l-2 border-red-500 pl-2">
						<p class="font-medium">{path}</p>
						<p class="text-xs">
							Extension: <span class="font-mono">.{actualExtension}</span> → Detected type:
							<span class="font-mono">.{detectedType}</span>
						</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="flex flex-col gap-2 w-full max-w-2xl mt-10">
		<p class="text-app text-sm">
			<b>Folder Structure:</b> Select a folder containing your chapters. Each chapter should be in
			its own folder. This is also the only real hard requirement regarding folder structure.
			<br />
			The folder structure you select will be preserved - chapters will be identified by their folder
			paths. There is additional selecting you can do in the step after folder selection that can narrow
			down on what exactly you want to upload (like selecting a specific depth of folders).
			<br />
			<br />
			<b>Supported Formats:</b>
			<br />
			• <b>Image files:</b> JPG, JPEG, PNG, GIF
			<br />
			• <b>Archive files:</b> CBZ, ZIP (will be automatically extracted under the same name as a
			fake folder - e.g. "chapter1.cbz" will be extracted to "chapter1")
			<br />
			<br />
			<b>Archive Processing:</b> When you select .cbz or .zip files, they will be automatically
			extracted. The internal folder structure within archives is preserved, so you can organize
			chapters inside archives as well.
			<br />
			<br />
			<b>File Validation:</b> All image files are validated to ensure their file extension matches
			their actual file type. Files with mismatched extensions (e.g., a PNG file named .jpg) will be
			flagged and must be corrected before proceeding.
			<br />
			<br />
			<b>Image Transformation (Optional):</b> Enable the checkbox above to automatically split
			images that are taller than 10,000px into smaller chunks.
			<b>Only use this option if you're uploading long strip chapters.</b>
		</p>
	</div>
</div>
