import { createContext } from 'svelte';
import type { ChapterState, ScanGroup } from './UploadingState.svelte';

export interface UserIdentity {
	id: string;
	username: string;
}

export interface UserGroupMember {
	id: string;
	is_leader: boolean;
	is_officer: boolean;
}

export interface UserGroup {
	id: string;
	name: string;
	relationships: {
		members: UserGroupMember[];
	};
}

export interface AuthCheckResponse {
	identity: UserIdentity;
	groups: UserGroup[];
}

export class ApiAuthContext {
	public apiToken = $state<string | null>(null);
	public userIdentity = $state<UserIdentity | null>(null);
	public userGroups = $state<UserGroup[]>([]);
}

export const apiAuthContext = createContext<ApiAuthContext>();

export class GlobalState {
	public apiToken = $state<string | null>(null);
	public seriesId = $state<string | null>(null);
	public chapterStates = $state<ChapterState[]>([]);
	public availableScanGroups = $state<ScanGroup[]>([]);
}

export const globalStateContext = createContext<GlobalState>();
