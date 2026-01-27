export interface ApiChapter {
	id: string;
	title: string | null;
	volume: string | null;
	chapter: string;
	language: string;
	version: number;
	relationships: {
		uploader: {
			id: string;
			name: string;
		};
		groups?: Array<{ id: string; name: string }>;
	};
}

export interface ChapterUpdateData {
	chapter: string;
	groups: string[];
	language: string;
	title: string | null;
	version: number;
	volume: string | null;
}

export type SaveStatus = 'pending' | 'saving' | 'saved' | 'error';
export type DeleteStatus = 'pending' | 'deleting' | 'deleted' | 'error';

export interface EditableChapter {
	id: string;
	original: ApiChapter;
	modified: Partial<ChapterUpdateData>;
	isModified: boolean;
	saveStatus: SaveStatus;
	deleteStatus?: DeleteStatus;
	error?: string;
}

export enum ProcessingStep {
	IDLE = 'IDLE',
	LOADING = 'LOADING',
	LOADED = 'LOADED',
	ERROR = 'ERROR',
	SAVING = 'SAVING'
}

export const ALL_LANGUAGES_FILTER = '__all__';

export class ChapterEditorState {
	public seriesId = $state<string | null>(null);
	public chapters = $state<EditableChapter[]>([]);
	public isLoading = $state<boolean>(false);
	public loadError = $state<string | null>(null);
	public isSavingAll = $state<boolean>(false);
	public saveProgress = $state<{ current: number; total: number } | null>(null);
	public processingStep = $state<ProcessingStep>(ProcessingStep.IDLE);
	public filteredChaptersCount = $state<number>(0);
	public permissionOverride = $state<boolean>(false);
	public selectedLanguageFilter = $state<string>(ALL_LANGUAGES_FILTER);

	public reset() {
		this.seriesId = null;
		this.chapters = [];
		this.isLoading = false;
		this.loadError = null;
		this.isSavingAll = false;
		this.saveProgress = null;
	}

	public getModifiedChapters(): EditableChapter[] {
		return this.chapters.filter((ch) => ch.isModified);
	}

	public markChapterModified(chapterId: string) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (chapter) {
			chapter.isModified = true;
			if (chapter.saveStatus === 'saved') {
				chapter.saveStatus = 'pending';
			}
		}
	}

	public updateChapterField(chapterId: string, field: keyof ChapterUpdateData, value: unknown) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (!chapter) return;

		// Normalize empty strings to null for fields that can be null (title, volume)
		let normalizedValue = value;
		if ((field === 'title' || field === 'volume') && typeof value === 'string' && value === '') {
			normalizedValue = null;
		}

		// Update the modified object
		(chapter.modified as Record<string, unknown>)[field] = normalizedValue;

		// Check if chapter is actually modified by comparing current values with originals
		const original = chapter.original;
		const modified = chapter.modified;

		const originalGroups = original.relationships?.groups;
		const originalGroupIds =
			originalGroups && Array.isArray(originalGroups) ? originalGroups.map((g) => g.id).sort() : [];
		const modifiedGroupIds = modified.groups ? [...modified.groups].sort() : null;

		// Compare current values (from modified if set, otherwise original) with originals
		// All values are already normalized at API boundary (for original) and assignment (for modified)
		const currentChapter = modified.chapter ?? original.chapter;
		const originalChapter = original.chapter;
		const currentVolume = modified.volume ?? original.volume;
		const originalVolume = original.volume;
		const currentTitle = modified.title ?? original.title;
		const originalTitle = original.title;
		const currentLanguage = modified.language ?? original.language;
		const originalLanguage = original.language;

		chapter.isModified =
			currentChapter !== originalChapter ||
			currentVolume !== originalVolume ||
			currentTitle !== originalTitle ||
			currentLanguage !== originalLanguage ||
			JSON.stringify(modifiedGroupIds) !== JSON.stringify(originalGroupIds);

		if (chapter.isModified && chapter.saveStatus === 'saved') {
			chapter.saveStatus = 'pending';
		}
	}

	public getChapterUpdateData(chapter: EditableChapter): ChapterUpdateData {
		const original = chapter.original;
		const modified = chapter.modified;

		const originalGroups = original.relationships?.groups;
		const defaultGroupIds =
			originalGroups && Array.isArray(originalGroups) ? originalGroups.map((g) => g.id) : [];

		return {
			chapter: modified.chapter ?? original.chapter,
			volume: (modified.volume !== undefined ? modified.volume : original.volume) ?? '',
			title: (modified.title !== undefined ? modified.title : original.title) ?? '',
			language: modified.language ?? original.language,
			version: original.version,
			groups: modified.groups !== undefined ? modified.groups : defaultGroupIds
		};
	}

	public resetChapter(chapterId: string) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (chapter) {
			chapter.modified = {};
			chapter.isModified = false;
			chapter.saveStatus = 'pending';
			chapter.error = undefined;
		}
	}

	public updateChapterSaveStatus(chapterId: string, saveStatus: SaveStatus, error?: string) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (chapter) {
			chapter.saveStatus = saveStatus;
			if (error !== undefined) {
				chapter.error = error;
			}
		}
	}

	public updateChapterAfterSave(chapterId: string, updatedChapter: ApiChapter) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (chapter) {
			chapter.original = updatedChapter;
			chapter.modified = {};
			chapter.isModified = false;
			chapter.saveStatus = 'saved';
			chapter.error = undefined;
		}
	}

	public updateChapterDeleteStatus(chapterId: string, deleteStatus: DeleteStatus, error?: string) {
		const chapter = this.chapters.find((ch) => ch.id === chapterId);
		if (chapter) {
			chapter.deleteStatus = deleteStatus;
			if (error !== undefined) {
				chapter.error = error;
			}
		}
	}

	public removeChapter(chapterId: string) {
		this.chapters = this.chapters.filter((ch) => ch.id !== chapterId);
	}

	public getFilteredChapters(): EditableChapter[] {
		if (this.selectedLanguageFilter === ALL_LANGUAGES_FILTER) {
			return this.chapters;
		}

		return this.chapters.filter((chapter) => {
			const currentLanguage = chapter.modified.language ?? chapter.original.language;
			return currentLanguage === this.selectedLanguageFilter;
		});
	}
}
