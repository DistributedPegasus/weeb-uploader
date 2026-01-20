import { createContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export enum GuidedWorkflowStep {
	SELECTING_ROOT_FOLDER = 'SELECTING_ROOT_FOLDER',
	SELECTING_MANGA_FOLDERS = 'SELECTING_MANGA_FOLDERS',
	PROCESSING_MANGA = 'PROCESSING_MANGA'
}

export enum MangaProcessingStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	ERROR = 'ERROR',
	WARNING = 'WARNING'
}

export enum MangaProcessingStep {
	LOADING = 'LOADING',
	EXTRACTING = 'EXTRACTING',
	SERIES_LOOKUP = 'SERIES_LOOKUP',
	APPLYING_REGEX = 'APPLYING_REGEX',
	CHAPTER_LOOKUP = 'CHAPTER_LOOKUP',
	LOADING_GROUPS = 'LOADING_GROUPS',
	APPLYING_GROUPS = 'APPLYING_GROUPS',
	APPLYING_TITLES = 'APPLYING_TITLES',
	READY = 'READY',
	READY_WARNING = 'READY_WARNING', // Ready but has issues (duplicates, failed lookups, etc.)
	UPLOADING = 'UPLOADING',
	COMPLETED = 'COMPLETED'
}

export interface ZipFileInfo {
	file: File;
	mangaFolderName: string;
	mangaFolderPath: string;
	status: MangaProcessingStatus;
}

export class GuidedState {
	public rootFolderFiles = $state<File[] | null>(null);
	public zipFiles = $state<ZipFileInfo[]>([]); // All zip files found
	public selectedZipFiles = $state<File[]>([]); // Selected zip files to process
	public currentZipIndex = $state<number>(-1);
	public workflowStep = $state<GuidedWorkflowStep>(GuidedWorkflowStep.SELECTING_ROOT_FOLDER);

	public get currentZip(): ZipFileInfo | null {
		if (this.currentZipIndex < 0 || this.currentZipIndex >= this.zipFiles.length) {
			return null;
		}
		return this.zipFiles[this.currentZipIndex];
	}

	public get unprocessedZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status !== MangaProcessingStatus.COMPLETED
		);
	}

	public get pendingZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status === MangaProcessingStatus.PENDING
		);
	}

	public get warningZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status === MangaProcessingStatus.WARNING
		);
	}

	public get errorZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status === MangaProcessingStatus.ERROR
		);
	}

	public get completedZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status === MangaProcessingStatus.COMPLETED
		);
	}

	public get processingZips(): ZipFileInfo[] {
		return this.zipFiles.filter(
			(zip) =>
				this.selectedZipFiles.includes(zip.file) && zip.status === MangaProcessingStatus.PROCESSING
		);
	}

	public get nextZip(): ZipFileInfo | null {
		// For automation, only return PENDING zips (skip WARNING, ERROR, PROCESSING)
		const pending = this.pendingZips;
		if (pending.length === 0) {
			return null;
		}

		// If no current zip, return the first pending zip
		if (this.currentZipIndex < 0 || this.currentZipIndex >= this.zipFiles.length) {
			return pending[0];
		}

		// Search forward from currentZipIndex + 1
		for (let i = this.currentZipIndex + 1; i < this.zipFiles.length; i++) {
			const zip = this.zipFiles[i];
			if (
				this.selectedZipFiles.includes(zip.file) &&
				zip.status === MangaProcessingStatus.PENDING
			) {
				return zip;
			}
		}

		// Wrap around: search from beginning to currentZipIndex
		for (let i = 0; i < this.currentZipIndex; i++) {
			const zip = this.zipFiles[i];
			if (
				this.selectedZipFiles.includes(zip.file) &&
				zip.status === MangaProcessingStatus.PENDING
			) {
				return zip;
			}
		}

		// No pending zip found (shouldn't happen if pending.length > 0, but handle edge case)
		return null;
	}

	public setZipStatus(zipFile: File, status: MangaProcessingStatus) {
		const zipInfo = this.zipFiles.find((z) => z.file === zipFile);
		if (zipInfo) {
			zipInfo.status = status;
		}
	}

	public moveToNextZip(): boolean {
		const next = this.nextZip;
		if (!next) {
			return false;
		}
		const index = this.zipFiles.findIndex((z) => z.file === next.file);
		if (index >= 0) {
			this.currentZipIndex = index;
			return true;
		}
		return false;
	}

	// Helper to get zip files grouped by manga folder
	public get zipFilesByMangaFolder(): SvelteMap<string, ZipFileInfo[]> {
		const map = new SvelteMap<string, ZipFileInfo[]>();
		for (const zipInfo of this.zipFiles) {
			if (!map.has(zipInfo.mangaFolderName)) {
				map.set(zipInfo.mangaFolderName, []);
			}
			map.get(zipInfo.mangaFolderName)!.push(zipInfo);
		}
		return map;
	}

	public reset() {
		this.rootFolderFiles = null;
		this.zipFiles = [];
		this.selectedZipFiles = [];
		this.currentZipIndex = -1;
		this.workflowStep = GuidedWorkflowStep.SELECTING_ROOT_FOLDER;
	}
}

export class AutomationState {
	public enabled = $state<boolean>(false);

	public get isActive(): boolean {
		return this.enabled;
	}

	public enable() {
		this.enabled = true;
	}

	public disable() {
		this.enabled = false;
	}

	public reset() {
		this.enabled = false;
	}
}

export const guidedStateContext = createContext<GuidedState>();
export const automationStateContext = createContext<AutomationState>();
