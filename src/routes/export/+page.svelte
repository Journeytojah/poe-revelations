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
	// const rowStoreData = mockData;
	const rowStoreData = get(rowStore);

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
		const statDescriptions = await fetchStatDescriptions(
			fetch,
			patchUrl,
			rowStoreData?.StatDescription
		);

		// Parse descriptions into structured blocks
		const parsedBlocks = parseStatDescriptions(statDescriptions);
		// console.log('📦 Parsed Blocks:', parsedBlocks);

		// Track stats that have been processed
		const processedStats = new Set<string>();

		// Process each stat in the passed statSet
		statSet.forEach(({ id, value }) => {
			// Avoid processing the same stat multiple times
			if (processedStats.has(id)) {
				return;
			}

			// Find matching stat block
			const descriptionBlock = parsedBlocks.find((block) =>
				block.stats.some((stat) =>
					stat
						.split(' ')
						.map((s) => s.trim())
						.includes(id)
				)
			);

			if (!descriptionBlock) {
				console.warn('⚠️ No matching block found for statId:', id);
				return;
			}

			console.log('🔍 Matched Block:', descriptionBlock);
			console.log('Value:', value);

			// Process stats in multi-stat blocks
			let blockStats = descriptionBlock.stats.flatMap((stat) =>
				stat.split(' ').map((s) => s.trim())
			);

			// Remove numeric-only prefixes from blockStats
			blockStats = blockStats.filter((stat) => !/^\d+$/.test(stat));

			const blockValues: number[] = [];

			// Match stats with their values from statSet
			blockStats.forEach((statId) => {
				const statEntry = statSet.find((s) => s.id === statId);
				if (statEntry) {
					blockValues.push(statEntry.value);
					processedStats.add(statId); // Mark as processed
				} else {
					blockValues.push(0); // Default if not found
				}
			});

			console.log('🔄 Block Stats:', blockStats);
			console.log('💡 Block Values:', blockValues);

			// Render descriptions
			const renderedDescriptions = descriptionBlock.descriptions.map((desc) => {
				let result = desc;

				// Handle each placeholder ({0}, {1}, ...)
				blockValues.forEach((blockValue, index) => {
					let renderedValue = blockValue;

					// Handle conversion: milliseconds → seconds with 2 decimal places
					if (desc.includes('milliseconds_to_seconds_2dp_if_required')) {
						renderedValue = parseFloat((blockValue / 1000).toFixed(2));
					}

					// Handle conversion: per minute → per second
					if (desc.includes('per_minute_to_per_second')) {
						renderedValue = parseFloat((blockValue / 60).toFixed(1));
					}

          // Handle division by 10 if includes divide_by_ten_1dp_if_required
          if (desc.includes('divide_by_ten_1dp_if_required')) {
            renderedValue = parseFloat((blockValue / 10).toFixed(1));
          }


					// Replace each placeholder dynamically
					result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), renderedValue.toString());
				});

				// Handle `[Projectile|Projectiles]` for singular/plural
				if (result.includes('[Projectile|Projectiles]')) {
					const pluralSuffix = blockValues[0] === 1 ? 'Projectile' : 'Projectiles';
					result = result.replace('[Projectile|Projectiles]', pluralSuffix);
				}

				// Handle `[Chaos|Chaos]` edge case (static replacement)
				if (result.includes('[Chaos|Chaos]')) {
					result = result.replace('[Chaos|Chaos]', 'Chaos');
				}

				// Remove leftover directives
				result = result
					.replace(/milliseconds_to_seconds_2dp_if_required/g, '')
					.replace(/per_minute_to_per_second/g, '') // Remove conversion directive
					.replace(/\s{2,}/g, ' ') // Clean extra spaces
					.trim(); // Remove trailing/leading spaces

				return result;
			});

			console.log('📝 Rendered Descriptions:', renderedDescriptions);
		});
	}

	function getConstantStats() {
		// const skillId = mockData.Id;
		const skillId = rowStoreData?.Id;
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
		// const skillId = mockData.Id;
		const skillId = rowStoreData?.Id;
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
		const floatStatsValues =
			grantedEffectStatSetPerLevel?.BaseResolvedValues ||
			grantedEffectStatSetPerLevel?.FloatStatsValues ||
			[];

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
