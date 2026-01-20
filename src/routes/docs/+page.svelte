<script lang="ts">
	import { asset, resolve } from '$app/paths';

	function copyHrefToClipboard(href: string) {
		const host = resolve('/docs');
		const basename = window.location.host;
		const hrefFull = `${basename}${host}#${href}`;

		navigator.clipboard.writeText(hrefFull);
	}

	let apiTokenExpanded = $state(false);
	let simpleModeExpanded = $state(false);
	let guidedModeExpanded = $state(false);

	function toggleSection(section: 'api-token' | 'simple-mode' | 'guided-mode') {
		if (section === 'api-token') {
			apiTokenExpanded = !apiTokenExpanded;
		} else if (section === 'simple-mode') {
			simpleModeExpanded = !simpleModeExpanded;
		} else if (section === 'guided-mode') {
			guidedModeExpanded = !guidedModeExpanded;
		}
	}
</script>

<div class="container mx-auto flex flex-col gap-15">
	<a href={resolve('/')} class="mt-5 text-blue-500 hover:text-blue-600">
		Back to Uploader Improved
	</a>

	<div class="flex flex-col gap-2" id="api-token-where">
		<button
			onclick={() => toggleSection('api-token')}
			class="text-2xl font-bold hover:text-blue-500 flex items-center gap-2 text-left"
		>
			<span class="i-mdi-chevron-{apiTokenExpanded ? 'down' : 'right'} transition-transform"></span>
			Where do I find my Client ID and Client Secret?
			<a
				href="#api-token-where"
				onclick={(e) => {
					e.stopPropagation();
					copyHrefToClipboard('api-token-where');
				}}
				class="text-sm text-gray-500 i-mdi-link w-4 h-4 inline-block"
				aria-label="Copy link to this section"
			></a>
		</button>

		{#if apiTokenExpanded}
			<p>
				Make sure you're logged in to your Weebdex account and then go to the <a
					href="https://weebdex.org/settings/client"
					target="_blank"
					class="text-blue-500 hover:text-blue-600">Client Settings</a
				>
				page under Settings.
				<br />
				<b>
					Note: The Client Secret is only shown once when creating a client (you can regenerate it
					though), so make sure to copy it down.
				</b>
			</p>
			<div class="flex flex-row gap-2">
				<img src={asset('/auth/api-key-location.png')} alt="API Token" class="h-auto" />
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-7" id="simple-mode-how-to">
		<div class="flex flex-col gap-2">
			<button
				onclick={() => toggleSection('simple-mode')}
				class="text-2xl font-bold hover:text-blue-500 flex items-center gap-2 text-left"
			>
				<span class="i-mdi-chevron-{simpleModeExpanded ? 'down' : 'right'} transition-transform"
				></span>
				I want to upload a lot of chapters for a manga, what do I do?
				<a
					href="#simple-mode-how-to"
					onclick={(e) => {
						e.stopPropagation();
						copyHrefToClipboard('simple-mode-how-to');
					}}
					class="text-sm text-gray-500 i-mdi-link w-4 h-4 inline-block"
					aria-label="Copy link to this section"
				></a>
			</button>

			{#if simpleModeExpanded}
				<p>
					If you're using the Dekai Manga Archive, consult the
					<a href="#guided-mode-how-to" class="text-blue-500 hover:text-blue-600">
						I'm uploading the Dekai Manga Archive, what do I do?
					</a>
					section.
					<br />
					If that is not the case, you should use the simple mode which is described here.
				</p>
			{/if}
		</div>

		{#if simpleModeExpanded}
			<div class="flex flex-col gap-2">
				<p>Simple mode has a few steps to it:</p>
				<ol class="list-decimal list-inside">
					<li>Select the folder containing the chapters you want to upload.</li>
					<li>Select where in the folder the chapters are located.</li>
					<li>Select the manga you're uploading to and modify chapter information.</li>
					<li>Uploading.</li>
					<li>Celebrating.</li>
				</ol>
				<img
					src={asset('/simple/steps.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					1. Select the folder which contains all the chapters for the manga you want to upload.
					<br />
					You'll be able to select which specific folders or depth of folders contain the actual chapters
					at a later step. Zip files, as well as .cbz archives are automatically extracted, so you should
					not be extracting them yourself. If you do decide to extract them yourself, name the folder
					differently than the zip file or .cbz archive.
				</p>

				<img
					src={asset('/simple/loading.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					2. Once the folder has been selected, you'll be able to select which specific folders or
					depth of folders contain the actual chapters.
					<br />
					The panel is split into two sections. The left section is the folder structure, and the right
					section is the chapter selector. You'll be able to see what chapters have been detected in
					the preview panel.
					<br />
					The chapter name level and File level serve different purposes. Most of the time, the two will
					be the same... but if you're a scanlator, chances are you have a chapter folder with a bunch
					of subfolders each containing one step in the scanlation process.
					<br />
					The chapter name level is the level at which the chapter name is determined. The file level
					is the level at which files are considered to be part of the chapter. An example would be ch1>RD
					and ch>TS>PNG, where you want to target the PNG folder... the chapter level is 1, and the file
					level is 3.
					<br />
					You also have the file path regex which allows you to specify a regex to filter for just the
					files relevant to you, in case the file level controls aren't enough.
				</p>

				<img
					src={asset('/simple/vertical-slicer.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					3. Now you'll be filling out the information regarding your upload.
					<br />
					You should start off by selecting the manga you're uploading to. You can do so by either providing
					the weebdex series ID, or by searching for the manga by title and selecting the relevant result.
					<br />
					Once you've selected the manga, the "Chapter Dump Lookup" might prefill some information for
					you regarding groups and chapters.
					<br />
					Most likely though, you'll have to fill out information regarding which groups worked on these
					chapters yourself. You can again add groups by ID or by searching for them by name. Adding
					them here only adds them to the group picker... it doesn't assign them to any chapters.
				</p>

				<img
					src={asset('/simple/prep-target.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>

				<p>Example filled out info:</p>
				<img
					src={asset('/simple/prep-target-example.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					4. With manga and group information filled out, you can begin setting chapter information.
					<br />
					Editing of chapter information can be done one of two ways:
				</p>
				<ol class="list-decimal list-inside">
					<li>Modifying the information on the chapter directly.</li>
					<li>Using the batch edit options to assign values to multiple chapters at once.</li>
				</ol>

				<p>
					The extract title / extract volume / extract chapter number options work by running the
					"Original" value through a regex, and assigning to the chapter the value of the first
					regex capture group. A regex that should work for most cases is set by default, so all you
					really need to do is click apply for the relevant category.
					<br />
					It is very likely that you will only really have the chapter number in your folder names (Original),
					therefore you'll only really be able to set the chapter number. This isn't a problem because
					you still have the "Assign Volume to All Chapters" and "Assign Groups to All Chapters" options
					to help you out.
					<br />
					In addition to the above, you can also utilize the "Chapter Dump Lookup" section near the top
					of the page to assign titles and volumes to chapters. The only requirements are for the chapters
					to have groups and chapter numbers assigned to them, and for there to be a chapter dump available
					for the manga.
					<br />
					The chapter dump takes the chapter information from mangadex, tries matching it to your chapters,
					and applies corrections.
					<br />
					You should make sure that there isn't any uploads already on weebdex... but just in case there
					are, you can remove chapters from the uploading list by clicking on the trash icon (it doesn't
					actually delete the chapters, just filters them out - you'll need to disable the "show only
					non-deleted chapters" filter and restore the chapter if you accidentally removed it).
				</p>

				<img
					src={asset('/simple/batch-edit.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>

				<p>
					You can also inspect the pages in indvidual chapters by clicking on the arrow down icon on
					the right side of the chapter.
				</p>

				<img
					src={asset('/simple/batch-edit-chapter.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					5. At this point, you can begin uploading and enjoying the show as chapters upload in real
					time as the progress indicator updates.
				</p>

				<p>You need to press start to begin uploading.</p>

				<img
					src={asset('/simple/uploader.png')}
					alt="Simple Mode"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-7" id="guided-mode-how-to">
		<div class="flex flex-col gap-2">
			<button
				onclick={() => toggleSection('guided-mode')}
				class="text-2xl font-bold hover:text-blue-500 flex items-center gap-2 text-left"
			>
				<span class="i-mdi-chevron-{guidedModeExpanded ? 'down' : 'right'} transition-transform"
				></span>
				I'm uploading the Dekai Manga Archive, what do I do?
				<a
					href="#guided-mode-how-to"
					onclick={(e) => {
						e.stopPropagation();
						copyHrefToClipboard('guided-mode-how-to');
					}}
					class="text-sm text-gray-500 i-mdi-link w-4 h-4 inline-block"
					aria-label="Copy link to this section"
				></a>
			</button>

			{#if guidedModeExpanded}
				<p>
					The Dekai Manga Archive is a collection of manga chapters that are organized in folders by
					manga title. Each manga is contained within a zip file. To handle this at scale, Guided
					Mode was created. Guided Mode automates a lot of the stuff you'd have to do manually in
					Simple Mode.
					<br />
				</p>
			{/if}
		</div>

		{#if guidedModeExpanded}
			<div class="flex flex-col gap-2">
				<p>
					1. Selecting the folder that contains the Dekai Manga Archive will lead you to selecting
					the manga you wish to upload.
					<br />
					By default, all manga that you or somebody else has already uploaded will be hidden (see the
					hide toggles at the top of the screenshot). You can select manga you wish to upload by toggling
					them. You can also select all by clicking the "Select All" button. There is a Continue to Processing
					button at the bottom of the page that will take you to the next step.
				</p>
				<img
					src={asset('/guided/manga-selector.png')}
					alt="Guided Mode Dekai 1"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					2. At this point, you should see the loading indicator as well as a general overview of
					the manga you selected at the top (Zip Processing).
					<br />
					The zip processing shows you the overall stats of manga you've already uploaded or attempted
					to upload, as well as the ability to quickly navigate to the next or specific manga.
				</p>
				<img
					src={asset('/guided/manga-loading.png')}
					alt="Guided Mode Dekai 1"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					3. Once the manga has finished loading, information regarding the manga should show up.
					<br />
					You should see the cover and weebdex ID and title. Underneath the general series information,
					you should see a section called "Chapter Dump Lookup" with the number of groups and chapters
					found in the dump. This means some information will be prefilled for you.
					<br />
					Underneath it all is a Group Selection section, where you can see all groups already preselected...
					but should a group not be in there, you can add it manually via the weebdex group ID or just
					searching it up by name.
				</p>
				<img
					src={asset('/guided/manga-series.png')}
					alt="Guided Mode Dekai 1"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					5. The next section you should see is a collapsed batch group assignment section, as well
					as warnings (which only show up when there are issues).
					<br />
					You can expand the batch group assignment section to see all groups that have been preselected
					for you. If a group fails to match, you can assign it manually here, and it'll fix up all the
					chapters.
					<br />
					Underneath the batch group assignment sections, you will potentially see warnings. The first
					warning is an overview of all issues found, subsequent sections are for a specific issue.
					<br />
					A special warning is the duplicate chapter warning, which is a warning that these chapters
					have already been uploaded to weebdex. The general course of action here is to click the remove
					duplicate chapters bottom on the warning.
					<br />
					All chapters with warnings will additionally show up with a warning icon and warning text.
				</p>
				<img
					src={asset('/guided/manga-groups.png')}
					alt="Guided Mode Dekai 1"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>

			<div class="w-full border-b-1 border-dotted"></div>

			<div class="flex flex-col gap-2">
				<p>
					6. the last section is the chapter list, which shows you all chapters that were in the
					archive.
					<br />
					These chapters should have most information prefilled for you, but there can be some issues
					at times that require manual correction.
					<br />
					You can click on the edit icon to change the volume / chapter number.
					<br />
					You can click on the title to change the title.
					<br />
					You can click on the groups to change the groups.
					<br />
					You can also manually remove the chapter by clicking Remove on the top right of a chapter.
					<br />
					If you're looking for chapters with issues, you can also toggle the "Show only warnings" checkbox
					to only show chapters with warnings.
				</p>
				<img
					src={asset('/guided/chapter-list.png')}
					alt="Guided Mode Dekai 1"
					class="h-auto w-1/2 mx-auto border-2 border-surface rounded-md"
				/>
			</div>
		{/if}
	</div>
</div>
