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

	// prepare the gem progression object
	// do a loop and create the empty objects for each level from 1 to 40

	let finalProgression = [];

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
		progression_text: '',
		//
		gem_tier: 0,

		// gem progression goes here
		finalProgression: finalProgression
	};

	const rowStoreData = get(rowStore);

	// Stat Set to store unique statId and values
	let statSet = new Set<{ id: string; value: number }>();

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

	async function getStatDescriptionsForAll(
		statSet: { id: string; value: number }[],
		skipSame: boolean = true
	) {
		console.log('StatSet:', statSet);

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

		// Group stats by id
		const groupedStats = statSet.reduce(
			(acc, { id, value }) => {
				if (!acc[id]) {
					acc[id] = [];
				}
				acc[id].push(value);
				return acc;
			},
			{} as Record<string, number[]>
		);

		// Process stats
		const processedStats = new Set<string>();
		const allRenderedDescriptions: string[] = []; // Collect all descriptions

		Object.entries(groupedStats).forEach(([id, values]) => {
			// Skip processing if the stat has already been processed and skipSame is true
			if (skipSame && processedStats.has(id)) {
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
			console.log('Values:', values);

			// Process stats in multi-stat blocks
			let blockStats = descriptionBlock.stats.flatMap((stat) =>
				stat.split(' ').map((s) => s.trim())
			);

			// Remove numeric-only prefixes from blockStats
			blockStats = blockStats.filter((stat) => !/^\d+$/.test(stat));

			const blockValues: number[][] = [];

			// Match stats with their values from groupedStats
			blockStats.forEach((statId) => {
				if (groupedStats[statId]) {
					blockValues.push(groupedStats[statId]);
					processedStats.add(statId); // Mark as processed
				} else {
					blockValues.push([0]); // Default if not found
				}
			});

			console.log('🔄 Block Stats:', blockStats);
			console.log('💡 Block Values:', blockValues);

			// Render descriptions for each progression step
			values.forEach((_, index) => {
				const renderedDescriptions = descriptionBlock.descriptions.map((desc) => {
					let result = desc;

					// Replace placeholders ({0}, {1}, ...) with progression values
					blockValues.forEach((statProgression, idx) => {
						const value = statProgression[index] || 0;
						let renderedValue: number = value;
						let renderedText: string = value.toString();

						// Handle specific transformations
						if (desc.includes('milliseconds_to_seconds_2dp_if_required')) {
							renderedValue = parseFloat((value / 1000).toFixed(2));
							renderedText = renderedValue.toString();
						}

						if (desc.includes('per_minute_to_per_second')) {
							renderedValue = parseFloat((value / 60).toFixed(1));
							renderedText = renderedValue.toString();
						}

						if (desc.includes('divide_by_ten_1dp_if_required')) {
							renderedValue = parseFloat((value / 10).toFixed(1));
							renderedText = renderedValue.toString();
						}

						if (desc.includes(`{${idx}:+d}`)) {
							renderedText = value >= 0 ? `+${value}` : `${value}`;
							result = result.replace(new RegExp(`\\{${idx}\\:\\+d\\}`, 'g'), renderedText);
						} else {
							result = result.replace(new RegExp(`\\{${idx}\\}`, 'g'), renderedText);
						}
					});

					// Handle singular/plural placeholders
					if (result.includes('[Projectile|Projectiles]')) {
						const pluralSuffix = blockValues[0][index] === 1 ? 'Projectile' : 'Projectiles';
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

				console.log('📝 Rendered Descriptions for Level:', index, renderedDescriptions);
			});
		});

		// Join all rendered descriptions into skillData.stat_text
		// skillData.stat_text = allRenderedDescriptions.join('<br>');
		// console.log('📜 Final Stat Text:', skillData.stat_text);
		return allRenderedDescriptions;
	}

	// ✅ Build a Set of Valid Tags from GemTags
	const validTags = new Set(gemTags.map((tag) => tag.Id));

	function parseBaseItemTypes(skillId: string, skillName: string) {
		// find the baseitemtype.name for the skill, case insensitive
		const baseItemType = data?.allData.BaseItemTypes?.rows.find(
			(baseItemType) => baseItemType.Name.toLowerCase() === skillName.toLowerCase()
		);

		// console.log('BaseItemType', baseItemType);
		// log the index of the baseitemtype
		// console.log('BaseItemTypeIndex', data?.allData.BaseItemTypes?.rows.indexOf(baseItemType));

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

		// console.log('SkillGem', skillGem);
		skillData.intelligence_percent = skillGem?.IntelligenceRequirementPercent;
		skillData.strength_percent = skillGem?.StrengthRequirementPercent;
		skillData.dexterity_percent = skillGem?.DexterityRequirementPercent;
		skillData.gem_tier = skillGem?.CraftingLevel;
	}

	async function getConstantStats() {
		// const skillId = mockData.Id;
		const skillId = rowStoreData?.Id;
		// console.log('SkillId', skillId);
		const skillName = rowStoreData?.DisplayedName;

		// TODO: figure out what the deal is here with the name. It's not always the same as the displayed name but its also not always the same as the granted effect name...

		parseBaseItemTypes(skillId, skillName);

		const grantedEffect = await findGrantedEffectId(skillId);
		// console.log('Effect', grantedEffect);

		try {
			const castTime = grantedEffect?.CastTime;
			const staticCostType = grantedEffect?.CostTypes[0]?.Id;
			skillData.cast_time = castTime;
			skillData.static_cost_types = staticCostType;
			// console.log('CastTime', castTime);
		} catch (error) {
			console.error(`No cast time found for skillId: ${skillId}`);
		}

		const grantedEffectStatSet = grantedEffectStatSets.find(
			(statSet) => statSet.Id === grantedEffect?.Id
		);
		// console.log('EffectStatSet', grantedEffectStatSet);

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

		// console.log('📊 Collected StatSet:', Array.from(statSet));
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

	async function findGemProgression(grantedEffectId: string) {
		const progression = grantedEffectsStatSetsPerLevel.filter(
			(effect) => effect.StatSet.Id === grantedEffectId
		);

		// console.log('Progression:', progression);

		const progression2 = grantedEffectsPerLevel.filter(
			(effect) => effect.GrantedEffect.Id === grantedEffectId
		);

		// console.log('Progression2:', progression2);

		let floatStats = progression.map((effect) => effect.FloatStats);
		// return the Ids
		floatStats = floatStats.map((stats) => stats.map((stat) => stat.Id));
		const baseResolvedValues = progression.map((effect) => effect.BaseResolvedValues);

		// now we need to combine the two arrays (floatStats and baseResolvedValues) into one array of objects
		floatStats = floatStats.map((stats, index) => {
			return stats.map((stat, i) => {
				return {
					id: stat,
					value: baseResolvedValues[index][i]
				};
			});
		});

		// console.log('FloatStats:', floatStats);
		const statSetProgression = new Set(floatStats.flat());
		// console.log('StatSet:', statSet);
		// for each stat in the statSet, we need to get the stat description

		const statDescriptions = await getStatDescriptionsForAll(Array.from(statSetProgression), false);
		skillData.progression_text = statDescriptions?.join('<br>') || '';
		// console.log('StatDescriptions:', statDescriptions);

		// TODO: handle life and mana cost amounts
		const costAmounts = progression2.map((effect) => effect.CostAmounts[0]);

		const statProgression = progression.map((effect) => {
			// TODO: handle dex and str requirements
			return getLevelAttrRequirements(
				Math.floor(effect.ActorLevel),
				skillData.intelligence_percent || skillData.strength_percent || skillData.dexterity_percent
			);
		});

		const actorLevels = progression.map((effect) => Math.floor(effect.ActorLevel));

		// console.log('Levels:', levels);

		return {
			stat: statProgression,
			levels: actorLevels,
			cost: costAmounts,
			statDescriptions: statDescriptions,
			floatStats: floatStats
		};
	}

	function getLevelAttrRequirements(level: number, multi: number): number {
		if (multi === 0) {
			return 0;
		}

		// local req = round( ( 5 + ( level - 3 ) * 2.25 ) * ( multi / 100 ) ^ 0.9 ) + 4
		const req = Math.round((5 + (level - 3) * 2.25) * (multi / 100) ** 0.9) + 4;

		// Return 0 if the requirement is less than 8
		return req < 8 ? 0 : req;
	}

	async function getDynamicStats() {
		const skillId = rowStoreData?.Id;
		// console.log('SkillId (Dynamic)', skillId);

		skillData.name = rowStoreData?.DisplayedName;
		skillData.skill_id = rowStoreData?.Id.charAt(0).toUpperCase() + rowStoreData?.Id.slice(1);
		skillData.gem_description = rowStoreData?.Description;

		const weaponRestrictions = rowStoreData?.WeaponRestriction_ItemClasses || [];
		const weaponRestrictionNames = weaponRestrictions.map(
			(restriction: { Id: any }) => restriction.Id
		);
		skillData.item_class_id_restriction = weaponRestrictionNames.join(', ');

		const grantedEffect = await findGrantedEffectId(skillId);
		// console.log('Effect (Dynamic)', grantedEffect?.Id);

		const grantedEffectsPerLevel = findGrantedEffectsPerLevel(grantedEffect?.Id);
		// console.log('EffectPerLevel', grantedEffectsPerLevel);
		const gemProgression = await findGemProgression(grantedEffectsPerLevel?.GrantedEffect.Id);
		// console.log('GemProgression:', gemProgression);

		//     |level1 = True
		// |level1_level_requirement = 1
		// |level1_intelligence_requirement = 1
		// |level1_cost_amounts = 18
		// |level1_stat_text = Deals 37 to 56 Cold Damage
		// |level1_stat1_id = spell_minimum_base_cold_damage
		// |level1_stat1_value = 37
		// |level1_stat2_id = spell_maximum_base_cold_damage
		// |level1_stat2_value = 56

		gemProgression.stat.forEach((stat, index) => {
			// console.log('Stat Progression:', stat);
		});

		gemProgression.floatStats.forEach((stat, index) => {
			// console.log('Float Stat Progression:', stat);
		});

		gemProgression.levels.forEach((level, index) => {
			// console.log('Level:', level);

			const floatStatLength = gemProgression.floatStats[index].length;
			// |level${index + 1} = True
			// up to level 20 is true, after that is false

			let text = `
|level${index + 1} = ${index < 20 ? 'True' : 'False'}
|level${index + 1}_level_requirement = ${gemProgression.levels[index]}
|level${index + 1}_intelligence_requirement = ${gemProgression.stat[index]}
|level${index + 1}_cost_amounts = ${gemProgression.cost[index]}
|level${index + 1}_stat_text = ${gemProgression.statDescriptions?.[index]}
|level${index + 1}_stat1_id = ${gemProgression.floatStats[index][0].id}
|level${index + 1}_stat1_value = ${gemProgression.floatStats[index][0].value}
|level${index + 1}_stat2_id = ${gemProgression.floatStats[index][1].id}
|level${index + 1}_stat2_value = ${gemProgression.floatStats[index][1].value}
    `;

			finalProgression.push(text);
		});

		gemProgression.cost.forEach((cost, index) => {
			// console.log('Cost:', cost);
		});

		gemProgression.statDescriptions?.forEach((description, index) => {
			// console.log('Stat Description:', description);
		});

		const grantedEffectStatSetPerLevel = findGrantedEffectStatSetPerLevel(grantedEffect?.Id);
		// console.log('EffectStatSetPerLevel', grantedEffectStatSetPerLevel);
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

		// console.log('📊 Collected Additional StatSet:', Array.from(statSet));

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

		// console.log('📊 Collected Float StatSet:', Array.from(statSet));

		const statText = await getStatDescriptionsForAll(Array.from(statSet));
    skillData.stat_text = statText?.join('<br>') || '';
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
			// console.log('GrantedEffect', activeSkill);
			grantedEffect = activeSkill?.Id;
		}

		if (grantedEffect.includes('Player')) {
			grantedEffect = grantedEffect.replace('Player', '');
		}

		// find the granted effect in activeskills
		let activeSkill = data?.allData.SkillGems?.rows.find(
			(activeSkill) => activeSkill.GemEffects[0].Id === grantedEffect
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
		console.log('SkillData:', skillData);

		// Generate Wikitext
		wikitext = `
    {{Item
|rarity_id                               = ${skillData.rarity_id}
|name                                    = ${skillData.name}
|class_id                                = ${skillData.class_id}
|size_x                                  = ${skillData.size_x}
|size_y                                  = ${skillData.size_y}
|drop_level                              = ${skillData.drop_level}
|tags                                    = ${skillData.tags}
|metadata_id                             = ${skillData.metadata_id}
|help_text                               = ${skillData.help_text}
|intelligence_percent                    = ${skillData.intelligence_percent}
|gem_tags                                = ${skillData.gem_tags}
|gem_description                         = ${skillData.gem_description}
|active_skill_name                       = ${skillData.active_skill_name}
|skill_icon                              = ${skillData.name}
|item_class_id_restriction               = ${skillData.item_class_id_restriction}
|skill_id                                = ${skillData.skill_id}
|cast_time                               = ${skillData.cast_time}
|required_level                          = ${skillData.required_level}
|static_cost_types                       = ${skillData.static_cost_types}
|static_critical_strike_chance           = ${skillData.static_critical_strike_chance}
|stat_text                               = ${skillData.stat_text}
|gem_tier                                = ${skillData.gem_tier}

${skillData.finalProgression.join('\n')}
`;
	});

	function copyToClipboard(): any {
		// copy wiki text to clipboard
		navigator.clipboard.writeText(wikitext);
	}
</script>

<h1>Export Page</h1>
<p>{(message = 'This page is under construction. Shit is krangled')}</p>

<h2>Generated Wikitext:</h2>
<button class="btn variant-filled-success" on:click={() => copyToClipboard()}
	>Copy to clipboard</button
>

<pre>{wikitext}</pre>
