<script lang="ts">
	//Import local datatable components
	import ThSort from '$lib/components/datatable/ThSort.svelte';
	import ThFilter from '$lib/components/datatable/ThFilter.svelte';
	import Search from '$lib/components/datatable/Search.svelte';
	import RowsPerPage from '$lib/components/datatable/RowsPerPage.svelte';
	import RowCount from '$lib/components/datatable/RowCount.svelte';
	import Pagination from '$lib/components/datatable/Pagination.svelte';

	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import { goto } from '$app/navigation';

	const modalStore = getModalStore();

	// import data from '$lib/components/datatable/data';
	export let data;
	let headers: string[] = [];
	let selectedVersion = data.selectedVersion || '1';
	let loading: boolean = false;

	$: headers = data.headers.map((header) => header.name || `Column`);
	$: {
		if (data.headers.length > 0) {
			loading = false;
		}
	}

	//Import handler from SSD
	import { DataHandler } from '@vincjo/datatables/legacy';
	import { rowStore } from '$lib/stores/rowStore.js';

	let handler: DataHandler;
	let rows;

	$: {
		handler = new DataHandler(data.rows, { rowsPerPage: 10 });
		rows = handler.getRows();
	}

	function displayValue(value: any): string {
		// Helper to render key-value pairs
		function renderObject(obj: Record<string, any>): string {
			return `
      <table class="min-w-full border border-gray-200 text-sm text-left table-fixed w-[10vw] overflow-hidden">
        ${Object.entries(obj)
					.map(
						([key, val]) => `
          <tr class="w-auto overflow-hidden">
            <th class="p-2 font-medium border-b">${key}</th>
            <td class="p-2 border-b">${displayValue(val)}</td>
          </tr>
        `
					)
					.join('')}
      </table>
    `;
		}

		// Handle arrays
		function renderArray(arr: any[]): string {
			return `
      <ul class="">
        ${arr
					.map(
						(item) => `
          <li>${displayValue(item)}</li>
        `
					)
					.join('')}
      </ul>
    `;
		}

		// Render different data types
		if (value === null || value === undefined) {
			return `<span class="text-gray-500 italic">null</span>`;
		}

		if (typeof value === 'boolean') {
			return `<span class="badge ${value ? 'bg-green-600' : 'bg-red-600'}">${value}</span>`;
		}

		if (typeof value === 'number') {
			return `<span class="text-blue-500">${value}</span>`;
		}

		if (Array.isArray(value)) {
			return renderArray(value);
		}

		if (typeof value === 'object') {
			return renderObject(value);
		}

		// Handle stringified JSON
		if (typeof value === 'string') {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed === 'object') {
					return displayValue(parsed);
				}
			} catch (e) {
				// Not a JSON string, fall through
			}
		}

		// Handle strings and other primitives
		return `<span>${value}</span>`;
	}

	function handleVersionChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const version = target.value;
		goto(`?version=${version}`);
	}

	function selectRow(row: any): void {
		new Promise<boolean>((resolve) => {
			const modal: ModalSettings = {
				type: 'component',
				component: 'list',
				title: 'Row Data',
				body: displayValue(row),
				response: (r: boolean) => {
					resolve(r);
				}
			};
			modalStore.trigger(modal);
		}).then(async (r: any) => {
			console.log('resolved response:', r);
			if (r) {
				rowStore.set(row);
				goto(`/export?version=${selectedVersion}`);
			}
		});
	}

	function selectTable() {
		return (event: MouseEvent) => {
			loading = true;
			const version = selectedVersion;
			const target = event.target as HTMLButtonElement;
			const table = target.innerText.split('.')[0];
			goto(`?version=${version}&table=${table}`).then(() => {
				loading = false;
			});
		};
	}
</script>

<div class="flex flex-row h-screen">
	<div class="flex flex-col max-h-full w-2/12">
		<div class="sticky top-0 bg-secondary-500 p-4">
			<label for="game-version">Select Game Version: </label>
			<select
				class="input"
				id="game-version"
				bind:value={selectedVersion}
				on:change={handleVersionChange}
			>
				<option value="1">POE 1</option>
				<option value="2">POE 2</option>
			</select>
			<p>Current patch: {data.versionNumber}</p>
			{#if data.tableName !== undefined}
				<h5 class="h5 py-4 text-wrap">Selected table: {data.tableName}</h5>
			{/if}
		</div>

		{#if data.datFiles.length > 0}
			<ul class="overflow-scroll w-full">
				{#each data.datFiles as file}
					<li>
						<button
							type="button"
							class=" btn btn-sm hover:bg-primary-700"
							aria-label="Select Table"
							on:click={selectTable()}>{file.name}</button
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p>No .datc64 files found in the directory.</p>
		{/if}
	</div>
	<div class="relative w-10/12 overflow-hidden">
		{#if loading}
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<div class="freeloader">
					<div class="box1"></div>
					<div class="box2"></div>
					<div class="box3"></div>
				</div>
				<h3 class="h3">Loading it... and by it, I mean the data.</h3>
				<sub class="text-xs">Giggity</sub>
			</div>
		{:else if data.rows.length === 0}
			<p class="text-center mt-12">No data found for the selected table or no table selected.</p>
		{:else}
			<header class="flex justify-between gap-4 p-4">
				<Search {handler} />
				<RowsPerPage {handler} />
			</header>
			<div class="table-container max-h-[80vh] relative">
				<div class="sticky top-0 rounded">
					<table>
						<thead>
							<tr class="bg-slate-900">
								<th class="p-2 rowCount">Row</th>
								{#each headers as header, index}
									<ThSort {handler} orderBy={header}>{header}</ThSort>
								{/each}
							</tr>
							<tr class="bg-slate-900">
								<th class="p-2 rowCount"> </th>
								{#each headers as header, index}
									<ThFilter {handler} filterBy={header}>{header}</ThFilter>
								{/each}
							</tr>
						</thead>
					</table>
				</div>
				<table class="table table-hover border-collapse">
					<tbody>
						{#each $rows as row, index}
							<tr on:click={() => selectRow(row)}>
								<td class="p-2 rowCount">
									{index}
								</td>

								{#each data.headers as header, index}
									<td class=" p-2">
										{@html displayValue(row[header.name || `Column_${index}`])}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<footer class="flex justify-between p-2">
				<RowCount {handler} />
				<Pagination {handler} />
			</footer>
		{/if}
	</div>
</div>

<style>
	.table-container table {
		width: 100vw;
		border-collapse: collapse;
		table-layout: fixed;
	}

	th,
	td {
		width: 30vw;
		text-align: left;
		text-overflow: ellipsis;
		white-space: normal;
		overflow: hidden;
	}

	.rowCount {
		width: 5vw;
	}
</style>
