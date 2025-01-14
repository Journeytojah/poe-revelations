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
		class_id: '',
		size_x: 0,
		size_y: 0,
		drop_level: 1,
		tags: 'gem, default',
		metadata_id: '',
		help_text: 'Skills can be managed in the Skills Panel.',
		intelligence_percent: 0,
    strength_percent: 0,
    dexterity_percent: 0,
		gem_tags: '',
		gem_description: '',
		active_skill_name: '',
		item_class_id_restriction: '',
		skill_id: '',
		cast_time: 0,
		required_level: 1,
		static_cost_types: '',
		// TODO: format crit to 2 decimal places and %
		static_critical_strike_chance: 0.0,
		stat_text: '',
		//
		gem_tier: 0
	};

	const rowStoreData = get(rowStore);

	// Stat Set to store unique statId and values
	const statSet = new Set<{ id: string; value: number }>();

	async function findGrantedEffectId(skillId: string) {
		return grantedEffects.find((effect) => {
			try {
				return effect.ActiveSkill?.Id === skillId;
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

	function parseBaseItemTypes(skillId: string, skillName: string) {
		// find the baseitemtype.name for the skill, case insensitive
		const baseItemType = data?.allData.BaseItemTypes?.rows.find(
			(baseItemType) => baseItemType.Name.toLowerCase() === skillName.toLowerCase()
		);

		console.log('BaseItemType', baseItemType);
		// log the index of the baseitemtype
		console.log('BaseItemTypeIndex', data?.allData.BaseItemTypes?.rows.indexOf(baseItemType));

		skillData.metadata_id = baseItemType?.Id;
		skillData.class_id = baseItemType?.ItemClass?.Id;
		skillData.size_y = baseItemType?.Height;
		skillData.size_x = baseItemType?.Width;

		parseSkillGems(baseItemType?.Id);
	}

	function parseSkillGems(skillMetadata: string) {
		// find the skillgem row that has the same metadata_id as the baseitemtype
		const skillGem = data?.allData.SkillGems?.rows.find(
			(skillGem) => skillGem.BaseItemType.Id === skillMetadata
		);

		console.log('SkillGem', skillGem);
		skillData.intelligence_percent = skillGem?.IntelligenceRequirementPercent;
    skillData.strength_percent = skillGem?.StrengthRequirementPercent;
    skillData.dexterity_percent = skillGem?.DexterityRequirementPercent;
		skillData.gem_tier = skillGem?.CraftingLevel;
	}

	async function getConstantStats() {
		// const skillId = mockData.Id;
		const skillId = rowStoreData?.Id;
		console.log('SkillId', skillId);
    const skillName = rowStoreData?.DisplayedName;

    // TODO: figure out what the deal is here with the name. It's not always the same as the displayed name but its also not always the same as the granted effect name...
    
		parseBaseItemTypes(skillId, skillName);

		const grantedEffect = await findGrantedEffectId(skillId);
		console.log('Effect', grantedEffect);

		try {
			const castTime = grantedEffect?.CastTime;
			const staticCostType = grantedEffect?.CostTypes[0]?.Id;
			skillData.cast_time = castTime;
			skillData.static_cost_types = staticCostType;
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
		// console.log('GrantedEffectsStatSetsPerLevel', grantedEffectsStatSetsPerLevel);

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

	async function getDynamicStats() {
		const skillId = rowStoreData?.Id;
		console.log('SkillId (Dynamic)', skillId);

		skillData.name = rowStoreData?.DisplayedName;
		skillData.skill_id = rowStoreData?.Id.charAt(0).toUpperCase() + rowStoreData?.Id.slice(1);
		skillData.gem_description = rowStoreData?.Description;

		const weaponRestrictions = rowStoreData?.WeaponRestriction_ItemClasses || [];
		const weaponRestrictionNames = weaponRestrictions.map(
			(restriction: { Id: any }) => restriction.Id
		);
		skillData.item_class_id_restriction = weaponRestrictionNames.join(', ');

		const grantedEffect = await findGrantedEffectId(skillId);
		console.log('Effect (Dynamic)', grantedEffect?.Id);

		const grantedEffectsPerLevel = findGrantedEffectsPerLevel(grantedEffect?.Id);
		console.log('EffectPerLevel', grantedEffectsPerLevel);

		const grantedEffectStatSetPerLevel = findGrantedEffectStatSetPerLevel(grantedEffect?.Id);
		console.log('EffectStatSetPerLevel', grantedEffectStatSetPerLevel);
		const critChance =
			grantedEffectStatSetPerLevel?.AttackCritChance ||
			grantedEffectStatSetPerLevel?.SpellCritChance;
		// add a % sign
		skillData.static_critical_strike_chance = critChance / 100;

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

	async function parseGemTags() {
		let grantedEffect = rowStoreData?.GrantedEffect;

    // if the granted effect is empty, we need to find the granted effect from the active skill id
    // so we need to loop over the grantedEffects and find the effect.ActiveSkill.Id that matches the active skill id
    if (!grantedEffect) {
      let activeSkillId = rowStoreData?.Id;
      let activeSkill = data?.allData.GrantedEffects?.rows.find(
        (activeSkill) => activeSkill.ActiveSkill?.Id === activeSkillId
      );
      console.log("GrantedEffect", activeSkill);
      grantedEffect = activeSkill?.Id;
    }

    if (grantedEffect.includes('Player')) {
      grantedEffect = grantedEffect.replace('Player', '');
    }
    
		// find the granted effect in activeskills
		let activeSkill = data?.allData.SkillGems?.rows.find(
			(activeSkill) =>  activeSkill.GemEffects[0].Id === grantedEffect
		);
    

		if (!activeSkill || !activeSkill.GemEffects?.[0]?.GemTags) {
			console.error('ActiveSkill or GemTags is undefined');
			skillData.gem_tags = ''; // Default to an empty string if no tags are found
			return;
		}

		let gemTags = activeSkill.GemEffects[0].GemTags;

		// Map over gemTags safely
		let tags = gemTags.map((tag: number) => {
			let gemTag = data?.allData.GemTags?.rows?.[tag];
			if (!gemTag) return null; // Skip undefined gemTag

			let tagName = gemTag.Name.replace(/[\[\]]/g, '');
			tagName = tagName.includes('|') ? tagName.split('|')[1] : tagName;

			return tagName !== '' ? tagName : null;
		});

		// Filter out null values
		tags = tags.filter((tag: null) => tag !== null);

		// Join tags into a string
		skillData.gem_tags = tags.join(', ');
	}

	onMount(async () => {
		console.log('Data', data);
		console.log('RowStore', rowStoreData);

		await getConstantStats();
		await getDynamicStats();
		await parseGemTags();
	});
</script>

<h1>Export Page</h1>
<p>{message}</p>

<h2>Generated Wikitext:</h2>
<!-- <pre>{skillData}</pre> -->
<pre>{JSON.stringify(skillData, null, 2)}</pre>
