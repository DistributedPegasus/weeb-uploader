import type { SelectedFolder } from '$lib/core/GroupedFolders';
import { getMaxDepth, getFoldersAtDepth } from '$lib/core/GroupedFolders';

/**
 * Finds and returns all folders at the deepest level of the folder tree.
 * These folders represent the chapter folders.
 */
export function extractDeepestFolders(folder: SelectedFolder): SelectedFolder[] {
	const maxDepth = getMaxDepth(folder, 0);
	return getFoldersAtDepth(folder, maxDepth, 0, []);
}

/**
 * Extracts volume number from folder name using regex pattern.
 * Default pattern is v(\d+) to match "v1", "v01", "v123", etc.
 */
export function applyVolumeRegex(folderName: string, regex: string = 'v(\\d+)'): string | null {
	const pattern = new RegExp(regex, 'i');
	const match = folderName.match(pattern);
	if (match && match[1]) {
		// Remove leading zeros
		return match[1].replace(/^0+/, '') || '0';
	}
	return null;
}

/**
 * Extracts chapter number from folder name using regex pattern.
 * Default pattern is c(\d+(?:\.\d+){0,2}) to match:
 * - "c1", "c01", "c123" (integer chapters)
 * - "c1.5", "c01.05", "c123.456" (decimal chapters)
 * - "c1.5.2", "c01.05.02", "c123.456.789" (triple decimal chapters)
 * Removes leading zeros from the integer part only.
 */
export function applyChapterRegex(
	folderName: string,
	regex: string = 'c(\\d+(?:\\.\\d+){0,2})'
): string | null {
	const pattern = new RegExp(regex, 'i');
	const match = folderName.match(pattern);
	if (match && match[1]) {
		const chapterNumber = match[1];
		// Remove leading zeros from the integer part only
		if (chapterNumber.includes('.')) {
			const parts = chapterNumber.split('.');
			const integerPart = parts[0].replace(/^0+/, '') || '0';
			return [integerPart, ...parts.slice(1)].join('.');
		} else {
			return chapterNumber.replace(/^0+/, '') || '0';
		}
	}
	return null;
}

/**
 * Groups files by manga folder name (first level folder).
 * Returns a map where keys are manga folder names and values are arrays of files.
 */
export function groupMangaFolders(files: File[]): Map<string, File[]> {
	const mangaMap = new Map<string, File[]>();

	for (const file of files) {
		const relativePath =
			'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string'
				? file.webkitRelativePath
				: file.name;
		const pathParts = relativePath.split('/').filter(Boolean);

		if (pathParts.length > 0) {
			const mangaFolderName = pathParts[0];
			if (!mangaMap.has(mangaFolderName)) {
				mangaMap.set(mangaFolderName, []);
			}
			mangaMap.get(mangaFolderName)!.push(file);
		}
	}

	return mangaMap;
}

/**
 * Extracts MD-#### pattern (MangaDex ID) from .zip file name.
 * Pattern matches "MD-" followed by digits (e.g., "MD-12345").
 * Returns only the numeric part (e.g., "12345"), not the "MD-" prefix.
 */
export function extractMangaDexIdFromZipName(zipFileName: string): string | null {
	const pattern = /MD-(\d+)/i;
	const match = zipFileName.match(pattern);
	return match ? match[1] : null; // Return only the numeric part
}

/**
 * Converts MangaDex ID (MD-####) to WeebDex series ID via API lookup.
 * This is a placeholder for future implementation.
 * @param mangaDexId - The MangaDex ID to lookup (currently unused, placeholder for future implementation)
 */
export async function lookupWeebDexIdFromMangaDexId(mangaDexId: string): Promise<string | null> {
	// TODO: Implement API lookup to convert MangaDex ID to WeebDex series ID
	// This will likely involve calling the WeebDex API with the MangaDex ID
	// and receiving back the corresponding WeebDex series ID
	// Parameter mangaDexId will be used in the implementation
	void mangaDexId; // Mark as intentionally unused for now
	return null;
}
