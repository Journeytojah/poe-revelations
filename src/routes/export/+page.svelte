<script lang="ts">
	type StatBlock = {
		stats: string[];
		values: string[];
		descriptions: string[];
	};
	import { rowStore } from '$lib/stores/rowStore';
	import { fetchStatDescriptions } from '$lib/utils/fetchStatDescriptions.js';
	import { fetchVersion } from '$lib/utils/fetchVersion.js';
	import { mockData } from '$lib/utils/mockDataSpark.js';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	let message = '';
	let wikitext: string = ''; // Store generated Wikitext
	export let data;
	const gameVersion = data.gameVersion;

	// ✅ Extract datasets dynamically
	const gemTags = data?.allData.GemTags?.rows || [];
	const grantedEffects = data?.allData.GrantedEffects?.rows || [];
	const grantedEffectsPerLevel = data?.allData.GrantedEffectsPerLevel?.rows || [];
	const grantedEffectStatSets = data?.allData.GrantedEffectStatSets?.rows || [];
	const grantedEffectsStatSetsPerLevel = data?.allData.GrantedEffectStatSetsPerLevel?.rows || [];

	// RowStore
	// const rowStoreData = get(rowStore)
	const rowStoreData = mockData;

	function findGrantedEffectId(skillId: string) {
		return grantedEffects.find((effect) => {
			try {
				return effect.ActiveSkill.Id === skillId;
			} catch (error) {
				console.error('Error', error);
				return false;
			}
		});
	}

	function parseStatDescriptions(data: string): StatBlock[] {
		const lines = data
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line);
		const blocks: StatBlock[] = [];
		let currentBlock: StatBlock | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// 1. Start of a new block
			if (line.startsWith('description')) {
				if (currentBlock) blocks.push(currentBlock); // Save the previous block
				currentBlock = { stats: [], values: [], descriptions: [] };
				continue;
			}

			// 2. Parse Stat (1st line after 'description')
			if (currentBlock && currentBlock.stats.length === 0) {
				currentBlock.stats.push(line);
				continue;
			}

			// 3. Parse Value (2nd line after 'description')
			if (
				currentBlock &&
				currentBlock.stats.length > 0 &&
				currentBlock.values.length === 0 &&
				/^\d+$/.test(line)
			) {
				currentBlock.values.push(line);
				continue;
			}

			// 4. Parse Description Text (remaining lines until next 'description')
			if (currentBlock) {
				currentBlock.descriptions.push(line);
			}
		}

		// Push the last block if it exists
		if (currentBlock) blocks.push(currentBlock);

		return blocks;
	}

	async function getStatDescriptions(path: string, skillId: string) {
		const { patchUrl } = await fetchVersion(fetch, gameVersion);
		const statDescriptions = await fetchStatDescriptions(fetch, patchUrl, path);

		// Parse descriptions into structured blocks
		const parsedBlocks = parseStatDescriptions(statDescriptions);
		console.log('📦 Parsed Blocks:', parsedBlocks);

		// Find the relevant stat set for this skill
		const statSet = grantedEffectsStatSetsPerLevel.find((set) => set.StatSet.Id === skillId);

		if (!statSet) {
			console.warn('❌ No StatSet found for skill ID:', skillId);
			return;
		}

		console.log('🔍 Found StatSet:', statSet);
	}

	function getConstantStats() {
		// const skillId = $rowStore?.Id;
		const skillId = mockData.Id;
		console.log('SkillId', skillId);
		// const grantedEffectId = grantedEffects.find((effect) => effect.SkillId === skillId);
		// console.log("GrantedEffectId", grantedEffectId);
		const grantedEffect = findGrantedEffectId(skillId);
		console.log('Effect', grantedEffect);
		// console.log('EffectStatSets', grantedEffectStatSets);

		const grantedEffectStatSet = grantedEffectStatSets.find(
			(statSet) => statSet.Id === grantedEffect.Id
		);
		console.log('EffectStatSet', grantedEffectStatSet);

		const constantStats = grantedEffectStatSet?.ConstantStats || [];
		console.log('ConstantStats', constantStats);

		const constantStatsValues = grantedEffectStatSet?.ConstantStatsValues || [];
		console.log('ConstantStatsValues', constantStatsValues);

    for (let i = 0; i < constantStats.length; i++) {
      const statId = constantStats[i];
      const statValue = constantStatsValues[i];
      console.log('StatId', statId);
      console.log('StatValue', statValue);
      
      // console.log('StatValue', statValue);

      // getStatDescriptions(mockData.StatDescription ,statId.Id);
    }
	}

	onMount(async () => {
		console.log('Data', data);
		console.log('RowStore', rowStoreData);



		getConstantStats();
	});
</script>

<h1>Export Page</h1>
<p>{message}</p>

<h2>Generated Wikitext:</h2>
<pre>{wikitext}</pre>
