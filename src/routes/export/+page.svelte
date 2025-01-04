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

	// Mocked RowStore
	const rowStoreData = mockData;

	// Stat Set to store unique statId and values
	const statSet = new Set<{ id: string; value: number }>();

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

			if (line.startsWith('description')) {
				if (currentBlock) blocks.push(currentBlock); // Save the previous block
				currentBlock = { stats: [], values: [], descriptions: [] };
				continue;
			}

			if (currentBlock && currentBlock.stats.length === 0) {
				currentBlock.stats.push(line);
				continue;
			}

			if (
				currentBlock &&
				currentBlock.stats.length > 0 &&
				currentBlock.values.length === 0 &&
				/^\d+$/.test(line)
			) {
				currentBlock.values.push(line);
				continue;
			}

			if (currentBlock) {
				currentBlock.descriptions.push(line);
			}
		}

		if (currentBlock) blocks.push(currentBlock);

		return blocks;
	}

	async function getStatDescriptionsForAll(statSet: { id: string; value: number }[]) {
		if (!statSet || statSet.length === 0) {
			console.warn('⚠️ No stats to fetch.');
			return;
		}

		const { patchUrl } = await fetchVersion(fetch, gameVersion);
		const statDescriptions = await fetchStatDescriptions(fetch, patchUrl, mockData.StatDescription);

		// Parse descriptions into structured blocks
		const parsedBlocks = parseStatDescriptions(statDescriptions);
		console.log('📦 Parsed Blocks:', parsedBlocks);

		// Process each stat in the passed statSet
		statSet.forEach(({ id, value }) => {
			// Find a matching stat block after stripping numeric prefixes
			const descriptionBlock = parsedBlocks.find((block) =>
        block.stats.some((stat) => stat.split(' ').map(s => s.trim()).includes(id))
			);

			if (!descriptionBlock) {
				console.warn('⚠️ No matching block found for statId:', id);
				return;
			}

			console.log('🔍 Matched Block:', descriptionBlock);
			console.log('Value:', value);

			// Use the `value` directly from statSet
			const renderedDescriptions = descriptionBlock.descriptions.map((desc) => {
				let renderedValue = value;

				// Handle conversion: milliseconds → seconds with 2 decimal places
				if (desc.includes('milliseconds_to_seconds_2dp_if_required')) {
					renderedValue = parseFloat((value / 1000).toFixed(2)); // Convert ms to seconds (2 dp)
				}

				// Handle singular/plural formatting
				const pluralSuffix = value === 1 ? '' : 's';

				// Replace placeholders and clean up
				let result = desc
					.split('{0}')
					.join(renderedValue.toString()) // Replace placeholder with value
					.split('[Projectile|Projectiles]')
					.join(value === 1 ? 'Projectile' : 'Projectiles') // Handle singular/plural
					.split('{1}')
					.join(pluralSuffix) // Handle any additional placeholder
					.replace(/milliseconds_to_seconds_2dp_if_required/g, '') // Remove conversion directive
					.replace(/\s{2,}/g, ' ') // Clean extra spaces
					.trim(); // Remove trailing/leading spaces

				return result;
			});

			console.log('📝 Rendered Descriptions:', renderedDescriptions);
		});
	}

	function getConstantStats() {
		const skillId = mockData.Id;
		console.log('SkillId', skillId);

		const grantedEffect = findGrantedEffectId(skillId);
		console.log('Effect', grantedEffect);

		const grantedEffectStatSet = grantedEffectStatSets.find(
			(statSet) => statSet.Id === grantedEffect?.Id
		);
		console.log('EffectStatSet', grantedEffectStatSet);

		const constantStats = grantedEffectStatSet?.ConstantStats || [];
		const constantStatsValues = grantedEffectStatSet?.ConstantStatsValues || [];

		for (let i = 0; i < constantStats.length; i++) {
			const statId = constantStats[i]?.Id; // Extract `Id` directly
			const statValue = constantStatsValues[i];
			if (statId) {
				statSet.add({ id: statId, value: statValue });
			} else {
				console.warn('⚠️ Invalid statId at index:', i, constantStats[i]);
			}
		}

		console.log('📊 Collected StatSet:', Array.from(statSet));
	}

	function findGrantedEffectStatSetPerLevel(skillId: string) {
		console.log('GrantedEffectsStatSetsPerLevel', grantedEffectsStatSetsPerLevel);

		return grantedEffectsStatSetsPerLevel.find((effect) => {
			try {
				return effect.StatSet.Id === skillId;
			} catch (error) {
				console.error('Error', error);
				return false;
			}
		});
	}

	function getDynamicStats() {
		const skillId = mockData.Id;
		console.log('SkillId (Dynamic)', skillId);

		const grantedEffect = findGrantedEffectId(skillId);
		console.log('Effect (Dynamic)', grantedEffect.Id);

		const grantedEffectStatSetPerLevel = findGrantedEffectStatSetPerLevel(grantedEffect.Id);
		console.log('EffectStatSetPerLevel', grantedEffectStatSetPerLevel);

		const additionalStats = grantedEffectStatSetPerLevel?.AdditionalStats || [];
		const additionalStatsValues = grantedEffectStatSetPerLevel?.AdditionalStatsValues || [];

		for (let i = 0; i < additionalStats.length; i++) {
			const statId = additionalStats[i]?.Id; // Extract `Id` directly
			const statValue = additionalStatsValues[i];
			if (statId) {
				statSet.add({ id: statId, value: statValue });
			} else {
				console.warn('⚠️ Invalid statId at index:', i, additionalStats[i]);
			}
		}

		console.log('📊 Collected Additional StatSet:', Array.from(statSet));
		getStatDescriptionsForAll(Array.from(statSet));

		const floatStats = grantedEffectStatSetPerLevel?.FloatStats || [];
		const floatStatsValues = grantedEffectStatSetPerLevel?.FloatStatsValues || [];

		for (let i = 0; i < floatStats.length; i++) {
			const statId = floatStats[i]?.Id; // Extract `Id` directly
			const statValue = floatStatsValues[i];
			if (statId) {
				statSet.add({ id: statId, value: statValue });
			} else {
				console.warn('⚠️ Invalid statId at index:', i, floatStats[i]);
			}
		}

		console.log('📊 Collected Float StatSet:', Array.from(statSet));
		getStatDescriptionsForAll(Array.from(statSet));
	}

	onMount(async () => {
		console.log('Data', data);
		console.log('RowStore', rowStoreData);

		getConstantStats();
		getDynamicStats();
	});
</script>

<h1>Export Page</h1>
<p>{message}</p>

<h2>Generated Wikitext:</h2>
<pre>{wikitext}</pre>
