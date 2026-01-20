export enum ChapterPageType {
	CHAPTER_PAGE = 'CHAPTER_PAGE',
	CHAPTER_DEFINITION_FILE = 'CHAPTER_DEFINITION_FILE',
	UNKNOWN = 'UNKNOWN'
}

export class SelectedFile {
	constructor(
		public file: File,
		public path: string,
		public type: ChapterPageType
	) {}
}

export class SelectedFolder {
	constructor(
		public name: string, // we don't have a folder handle, we're pretending
		public path: string, // The full path of this folder from the root
		public files: SelectedFile[],
		public folders: SelectedFolder[],
		public level: number, // The level/depth of this folder in the tree
		public depth: number // The maximum depth of files within this folder (including subfolders)
	) {}
}

/**
 * Natural sort comparison function that handles numeric values like Windows Explorer.
 * Uses localeCompare with numeric option for proper alphanumeric sorting.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns Comparison result (-1, 0, or 1)
 */
function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function createSelectedFile(file: File, path: string): SelectedFile {
	const type = file.type.toLowerCase();
	let detectedType = ChapterPageType.UNKNOWN;

	const validImageTypes = [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/bmp'
	];

	// details.json
	// ComickInfo.xml
	const validDefinitionFileTypes = ['application/json', 'text/xml'];

	const predefinedDefinitionFileTypes = ['comicinfo.xml', 'details.json'];

	if (validImageTypes.includes(type)) {
		detectedType = ChapterPageType.CHAPTER_PAGE;
	} else if (
		validDefinitionFileTypes.includes(type) ||
		predefinedDefinitionFileTypes.includes(file.name.toLowerCase())
	) {
		detectedType = ChapterPageType.CHAPTER_DEFINITION_FILE;
	}

	return new SelectedFile(file, path, detectedType);
}

/**
 * Groups an array of File objects into a tree structure of SelectedFolder and SelectedFile
 * based on their webkitRelativePath property.
 *
 * @param files - Array of File objects with webkitRelativePath property
 * @returns Array of root-level SelectedFolder objects (top-level folders and files at root)
 */
export function groupFilesByFolders(files: File[]): SelectedFolder {
	if (files.length === 0) {
		return new SelectedFolder('/', '/', [], [], 0, 0);
	}

	// Map to store folders by their full path
	const folderMap = new Map<string, SelectedFolder>();
	const rootFiles: SelectedFile[] = [];

	// Helper function to get or create a folder and ensure parent chain exists
	function getOrCreateFolder(pathParts: string[]): SelectedFolder {
		const fullPath = pathParts.join('/');

		if (folderMap.has(fullPath)) {
			return folderMap.get(fullPath)!;
		}

		const folderName = pathParts[pathParts.length - 1];
		// Level is the number of path parts (0 for root level folders, 1 for first level, etc.)
		const level = pathParts.length;
		// Depth will be calculated later after all files are processed
		const folder = new SelectedFolder(folderName, fullPath, [], [], level, 0);
		folderMap.set(fullPath, folder);

		// If not root level, ensure parent exists and add this folder to it
		if (pathParts.length > 1) {
			const parentPath = pathParts.slice(0, -1);
			const parentFolder = getOrCreateFolder(parentPath);
			parentFolder.folders.push(folder);
		}

		return folder;
	}

	// Process each file
	for (const file of files) {
		const relativePath = file.webkitRelativePath ?? file.name;
		const pathParts = relativePath.split('/').filter(Boolean);

		if (pathParts.length === 1) {
			// File is at root level of the selected folder
			rootFiles.push(createSelectedFile(file, relativePath));
		} else {
			// File is in a subfolder - get the folder path (everything except the filename)
			const folderPath = pathParts.slice(0, -1);
			const folder = getOrCreateFolder(folderPath);
			folder.files.push(createSelectedFile(file, relativePath));
		}
	}

	// Collect root-level folders (folders whose path has only one part)
	const rootFolders: SelectedFolder[] = [];

	for (const [path, folder] of folderMap.entries()) {
		if (path.split('/').length === 1) {
			rootFolders.push(folder);
		}
	}

	// Recursively sort the folder tree
	function sortFolder(folder: SelectedFolder): void {
		// Sort files by their file name
		folder.files.sort((a, b) => naturalCompare(a.file.name, b.file.name));

		// Sort folders by their folder name
		folder.folders.sort((a, b) => naturalCompare(a.name, b.name));

		// Recursively sort subfolders
		for (const subfolder of folder.folders) {
			sortFolder(subfolder);
		}
	}

	// Sort root files
	rootFiles.sort((a, b) => naturalCompare(a.file.name, b.file.name));

	// Sort root folders
	rootFolders.sort((a, b) => naturalCompare(a.name, b.name));

	// Sort all subfolders recursively
	for (const folder of rootFolders) {
		sortFolder(folder);
	}

	// Calculate depth for each folder (maximum depth of files within the folder)
	function calculateDepth(folder: SelectedFolder): number {
		let maxDepth = 0;

		// Check files directly in this folder
		// Files at root level have depth 0, files in one folder have depth 1, etc.
		for (const file of folder.files) {
			const pathParts = file.path.split('/').filter(Boolean);
			const fileDepth = pathParts.length - 1;
			maxDepth = Math.max(maxDepth, fileDepth);
		}

		// Check subfolders recursively
		for (const subfolder of folder.folders) {
			const subfolderDepth = calculateDepth(subfolder);
			maxDepth = Math.max(maxDepth, subfolderDepth);
		}

		folder.depth = maxDepth;
		return maxDepth;
	}

	// Calculate depth for all folders
	for (const folder of rootFolders) {
		calculateDepth(folder);
	}

	// If there are root files, we need to return them as a root folder
	// If there are also root folders, combine them
	// Root folder has level 0
	const rootFolder = new SelectedFolder('/', '/', rootFiles, rootFolders, 0, 0);

	// Calculate depth for root folder (files at root have depth 0)
	calculateDepth(rootFolder);

	// Sort the root folder itself
	sortFolder(rootFolder);

	return rootFolder;
}

/**
 * Filters an array of File objects to only include image files.
 *
 * @param files - Array of File objects
 * @returns Array of File objects that are images
 */
export function filterValidFiles(files: File[]): File[] {
	const imageTypes = [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/bmp',
		'image/svg+xml'
	];
	return files.filter((file) => {
		const type = file.type.toLowerCase();
		return (
			imageTypes.some((imageType) => type.includes(imageType)) ||
			/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)
		);
	});
}

/**
 * Recursively collects all folders at a specific depth level from the folder tree.
 *
 * @param folder - The root folder to search from
 * @param targetDepth - The depth level to collect folders from (0 = root, 1 = first level, etc.)
 * @param currentDepth - Current depth in recursion (default: 0)
 * @param collectedFolders - Array to accumulate folders at target depth
 * @returns Array of SelectedFolder objects at the target depth
 */
export function getFoldersAtDepth(
	folder: SelectedFolder,
	targetDepth: number,
	currentDepth: number = 0,
	collectedFolders: SelectedFolder[] = []
): SelectedFolder[] {
	// If we've reached the target depth, add this folder (if it's not the root)
	if (currentDepth === targetDepth && folder.name !== '/') {
		collectedFolders.push(folder);
		// Don't recurse further - we only want folders at this exact depth
		return collectedFolders;
	}

	// If we haven't reached the target depth yet, recurse into subfolders
	if (currentDepth < targetDepth) {
		for (const subfolder of folder.folders) {
			getFoldersAtDepth(subfolder, targetDepth, currentDepth + 1, collectedFolders);
		}
	}

	return collectedFolders;
}

/**
 * Calculates the maximum depth of the folder tree.
 *
 * @param folder - The root folder
 * @param currentDepth - Current depth in recursion (default: 0)
 * @returns Maximum depth of the folder tree
 */
export function getMaxDepth(folder: SelectedFolder, currentDepth: number = 0): number {
	if (folder.folders.length === 0) {
		return currentDepth;
	}

	let maxDepth = currentDepth;
	for (const subfolder of folder.folders) {
		const depth = getMaxDepth(subfolder, currentDepth + 1);
		maxDepth = Math.max(maxDepth, depth);
	}

	return maxDepth;
}

/**
 * Finds the parent folder of a given folder at a specific depth.
 * Recursively searches the tree to find the target folder and returns its ancestor at the specified depth.
 *
 * @param root - The root folder to search from
 * @param targetFolder - The folder to find the parent for
 * @param parentDepth - The depth level of the parent to find
 * @param currentDepth - Current depth in recursion (default: 0)
 * @param currentPath - Current path of folders in recursion (default: [])
 * @returns The parent folder at the specified depth, or null if not found
 */
export function findParentAtDepth(
	root: SelectedFolder,
	targetFolder: SelectedFolder,
	parentDepth: number,
	currentDepth: number = 0,
	currentPath: SelectedFolder[] = []
): SelectedFolder | null {
	// Build path: skip root (depth 0) when it's the root folder marker
	const newPath = root.name === '/' ? currentPath : [...currentPath, root];

	// If we've found the target folder, return its ancestor at parentDepth
	if (root === targetFolder) {
		// parentDepth is 1-indexed for user convenience, but path is 0-indexed
		// If parentDepth is 1, we want the first non-root folder (index 0 in newPath)
		if (parentDepth > 0 && parentDepth - 1 < newPath.length) {
			return newPath[parentDepth - 1];
		}
		return null;
	}

	// Recurse into subfolders
	for (const subfolder of root.folders) {
		const result = findParentAtDepth(
			subfolder,
			targetFolder,
			parentDepth,
			currentDepth + 1,
			newPath
		);
		if (result !== null) {
			return result;
		}
	}

	return null;
}

/**
 * Finds all folders that are ancestors of the given folders at a specific depth.
 *
 * @param root - The root folder to search from
 * @param targetFolders - Array of folders to find parents for
 * @param parentDepth - The depth level of the parents to find
 * @returns Map of target folder to its parent at the specified depth
 */
export function findParentsAtDepth(
	root: SelectedFolder,
	targetFolders: SelectedFolder[],
	parentDepth: number
): Map<SelectedFolder, SelectedFolder | null> {
	const result = new Map<SelectedFolder, SelectedFolder | null>();

	for (const targetFolder of targetFolders) {
		const parent = findParentAtDepth(root, targetFolder, parentDepth);
		result.set(targetFolder, parent);
	}

	return result;
}

/**
 * Gets the full path of a folder from the root.
 *
 * @param root - The root folder to search from
 * @param targetFolder - The folder to find the path for
 * @param currentPath - Current path in recursion (default: [])
 * @returns The full path as a string (e.g., "folder1/folder2/folder3"), or null if not found
 */
export function getFolderPath(
	root: SelectedFolder,
	targetFolder: SelectedFolder,
	currentPath: string[] = []
): string | null {
	// Build path: skip root (depth 0) when it's the root folder marker
	const newPath = root.name === '/' ? currentPath : [...currentPath, root.name];

	// If we've found the target folder, return its path
	if (root === targetFolder) {
		return newPath.length > 0 ? newPath.join('/') : '/';
	}

	// Recurse into subfolders
	for (const subfolder of root.folders) {
		const result = getFolderPath(subfolder, targetFolder, newPath);
		if (result !== null) {
			return result;
		}
	}

	return null;
}
