<script lang="ts">
	type StatBlock = {
		stats: string[];
		values: string[];
		descriptions: string[];
	};

	import { rowStore } from '$lib/stores/rowStore';
	import { fetchStatDescriptions } from '$lib/utils/fetchStatDescriptions.js';
	import { fetchVersion } from '$lib/utils/fetchVersion.js';
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

	// Create an object to store the data so we can generate the wikitext later
	const skillData = {
		rarity_id: 'normal',
		name: '',
    // TODO: Add support for other skill types
    class_id: 'Active Skill Gem',
		size_x: 1,
		size_y: 1,
		drop_level: 1,
		tags: 'gem, default',
		metadata_id: '',
		help_text: '',
		intelligence_percent: 0,
		gem_tags: '',
		gem_description: '',
		active_skill_name: '',
		item_class_id_restriction: '',
		skill_id: '',
		cast_time: 0,
		required_level: 1,
		static_cost_types: '',
		static_critical_strike_chance: 0,
		stat_text: ''
	};

	$: console.log('SkillData', skillData);

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

		// Track stats that have been processed
		const processedStats = new Set<string>();
		const allRenderedDescriptions: string[] = []; // Collect all descriptions

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
					let renderedValue: number = blockValue;
					let renderedText: string = blockValue.toString();

					// Handle conversion: milliseconds → seconds with 2 decimal places
					if (desc.includes('milliseconds_to_seconds_2dp_if_required')) {
						renderedValue = parseFloat((blockValue / 1000).toFixed(2));
						renderedText = renderedValue.toString();
					}

					// Handle conversion: per minute → per second
					if (desc.includes('per_minute_to_per_second')) {
						renderedValue = parseFloat((blockValue / 60).toFixed(1));
						renderedText = renderedValue.toString();
					}

					// Handle division by 10 if includes divide_by_ten_1dp_if_required
					if (desc.includes('divide_by_ten_1dp_if_required')) {
						renderedValue = parseFloat((blockValue / 10).toFixed(1));
						renderedText = renderedValue.toString();
					}

					// Handle signed formatting "{0:+d}"
					if (desc.includes(`{${index}:+d}`)) {
						renderedText = blockValue >= 0 ? `+${blockValue}` : `${blockValue}`;
						result = result.replace(new RegExp(`\\{${index}\\:\\+d\\}`, 'g'), renderedText);
					} else {
						// Regular placeholder replacement
						result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), renderedText);
					}
				});

				// Handle `[Projectile|Projectiles]` for singular/plural
				if (result.includes('[Projectile|Projectiles]')) {
					const pluralSuffix = blockValues[0] === 1 ? 'Projectile' : 'Projectiles';
					result = result.replace('[Projectile|Projectiles]', pluralSuffix);
				}

				// Handle static replacements
				result = result.replace('[Chaos|Chaos]', 'Chaos').replace('[Lightning]', 'Lightning');

				// Remove leftover directives
				result = result
					.replace(/milliseconds_to_seconds_2dp_if_required/g, '')
					.replace(/per_minute_to_per_second/g, '')
					.replace(/\s{2,}/g, ' ') // Clean extra spaces
					.trim();

				return result;
			});

			// Add rendered descriptions to the collection
			allRenderedDescriptions.push(...renderedDescriptions);

			console.log('📝 Rendered Descriptions:', renderedDescriptions);
		});

		// Join all rendered descriptions into skillData.stat_text
		skillData.stat_text = allRenderedDescriptions.join('<br>');
		console.log('📜 Final Stat Text:', skillData.stat_text);
	}

	// ✅ Build a Set of Valid Tags from GemTags
	const validTags = new Set(gemTags.map((tag) => tag.Id));

	// 📑 Step 1: Parse Skill Tags
	function parseGemTags(skillTypes: { Id: string }[]): string {
		const parsedGemTags = skillTypes
			.filter((type) => validTags.has(type.Id.toLowerCase())) // Normalize to lowercase for comparison
			.map((type) => {
				const gemTag = gemTags.find((gemTag) => gemTag.Id.toLowerCase() === type.Id.toLowerCase());
				console.log(`Mapping Type: ${type.Id}, Found Tag:`, gemTag.Name);

				if (!gemTag?.Tag) return `${type.Id}`; // Fallback to readable tag if no match

				// Extract text after the pipe if it exists
				const tagText = gemTag.Tag.includes('|')
					? gemTag.Tag.split('|')[1].replace(/[\[\]]/g, '') // Remove square brackets
					: gemTag.Tag.replace(/[\[\]]/g, ''); // Remove square brackets
				return tagText;
			})
			.filter((tag) => tag.trim() !== '') // Remove empty tags
			.join(', ');

		console.log('🏷️ Parsed Gem Tags:', parsedGemTags);
		skillData.gem_tags = parsedGemTags;
		return parsedGemTags;
	}

	function getConstantStats() {
		// const skillId = mockData.Id;
		const skillId = rowStoreData?.Id;
		console.log('SkillId', skillId);

		const grantedEffect = findGrantedEffectId(skillId);
		console.log('Effect', grantedEffect);

		try {
			const castTime = grantedEffect?.CastTime;
			skillData.cast_time = castTime;
			console.log('CastTime', castTime);
		} catch (error) {
			console.error(`No cast time found for skillId: ${skillId}`);
		}

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

	function findGrantedEffectsPerLevel(skillId: string) {
		return grantedEffectsPerLevel.find((effect) => {
			try {
				return effect.GrantedEffect.Id === skillId;
			} catch (error) {
				console.error('Error', error);
				return false;
			}
		});
	}

	function getDynamicStats() {
		const skillId = rowStoreData?.Id;
		console.log('SkillId (Dynamic)', skillId);

    skillData.name = rowStoreData?.DisplayedName;
    skillData.gem_description = rowStoreData?.Description;

		const grantedEffect = findGrantedEffectId(skillId);
		console.log('Effect (Dynamic)', grantedEffect?.Id);

		const grantedEffectsPerLevel = findGrantedEffectsPerLevel(grantedEffect?.Id);
		console.log('EffectPerLevel', grantedEffectsPerLevel);

		const grantedEffectStatSetPerLevel = findGrantedEffectStatSetPerLevel(grantedEffect?.Id);
		console.log('EffectStatSetPerLevel', grantedEffectStatSetPerLevel);

		const additionalStats = grantedEffectStatSetPerLevel?.AdditionalStats || [];
		const additionalStatsValues = grantedEffectStatSetPerLevel?.AdditionalStatsValues || [];

		for (let i = 0; i < additionalStats.length; i++) {
			const statId = additionalStats[i]?.Id;
			const statValue = additionalStatsValues[i];
			if (statId) {
				statSet.add({ id: statId, value: statValue });
			} else {
				console.warn('⚠️ Invalid statId at index:', i, additionalStats[i]);
			}
		}

		console.log('📊 Collected Additional StatSet:', Array.from(statSet));

		const floatStats = grantedEffectStatSetPerLevel?.FloatStats || [];
		const floatStatsValues =
			grantedEffectStatSetPerLevel?.BaseResolvedValues ||
			grantedEffectStatSetPerLevel?.FloatStatsValues ||
			[];

		for (let i = 0; i < floatStats.length; i++) {
			const statId = floatStats[i]?.Id;
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
		parseGemTags(rowStoreData?.ActiveSkillTypes);
	});
</script>

<h1>Export Page</h1>
<p>{message}</p>

<h2>Generated Wikitext:</h2>
<!-- <pre>{skillData}</pre> -->
<pre>{JSON.stringify(skillData, null, 2)}</pre>
