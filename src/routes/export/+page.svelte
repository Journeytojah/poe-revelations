<script lang="ts">


	import { rowStore } from '$lib/stores/rowStore';
	import { getConstantStats } from '$lib/utils/exporters/activeSkills/getConstantStats.js';
	import { getDynamicStats } from '$lib/utils/exporters/activeSkills/getDynamicStats.js';
	import { getStatDescriptionsForAll } from '$lib/utils/exporters/activeSkills/getStatDescriptions.js';
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

	let finalProgression: string[] = [];
	let statTextRangeValues: {
		stat1_id?: any;
		stat1_value?: any;
		stat2_id?: any;
		stat2_value?: any;
		stat_text?: string | undefined;
	}[] = [];
	let skillProgressionWikiText = '';

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
		progression_text: [] as string[][],
		additional_progression_text: [] as string[][],
		//
		gem_tier: 0,
		quality_stats: '',

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
		let additionalStats = progression.map((effect) => effect.AdditionalStats);
		// return the Ids
		floatStats = floatStats.map((stats) => stats.map((stat: { Id: any }) => stat.Id));
		additionalStats = additionalStats.map((stats) => stats.map((stat: { Id: any }) => stat.Id));
		// console.log('AdditionalStats:', additionalStats);

		const baseResolvedValues = progression.map((effect) => effect.BaseResolvedValues);
		const additionalStatsValues = progression.map((effect) => effect.AdditionalStatsValues);
		// console.log('AdditionalStatsValues:', additionalStatsValues);

		// now we need to combine the two arrays (floatStats and baseResolvedValues) into one array of objects
		floatStats = floatStats.map((stats, index) => {
			return stats.map((stat: any, i: string | number) => {
				return {
					id: stat,
					value: baseResolvedValues[index][i]
				};
			});
		});

		additionalStats = additionalStats.map((stats, index) => {
			return stats.map((stat: any, i: string | number) => {
				return {
					id: stat,
					value: additionalStatsValues[index][i]
				};
			});
		});

		// console.log('FloatStats:', floatStats);
		const statSetProgression = new Set(floatStats.flat());
		const additionalStatSetProgression = new Set(additionalStats.flat());
		// console.log('StatSet:', statSet);
		// for each stat in the statSet, we need to get the stat description

		const statDescriptions = await getStatDescriptionsForAll(Array.from(statSetProgression), false, gameVersion);
		let additionalStatDescriptions = await getStatDescriptionsForAll(
			Array.from(additionalStatSetProgression),
			false,
      gameVersion
		);

		additionalStatDescriptions = [];
		for (let levelIndex = 0; levelIndex < additionalStats.length; levelIndex++) {
			const levelStats = additionalStats[levelIndex];
			const levelDescIndex = levelIndex * 2; // Each level has 2 descriptions (projectile count + speed)

			// Get projectile count description (even indices)
			if (levelStats[0]?.id === 'projectile_count') {
				const projectileDesc =
					additionalStatDescriptions[levelDescIndex] || `Fires ${levelStats[0]?.value} Projectiles`;

          additionalStatDescriptions.push(projectileDesc);
			}
			// Get speed description (odd indices)
			const speedValue = levelStats[1]?.value || 0;
			const speedDesc =
				additionalStatDescriptions[levelDescIndex + 1] ||
				`${speedValue}% increased Projectile Speed`;

      additionalStatDescriptions.push(speedDesc);

      // console.log('ProjectileCount:', levelStats[0]);
      // console.log('ProjectileSpeed:', levelStats[1]);

      skillData.additional_progression_text.push(additionalStatDescriptions);
		}

		// skillData.progression_text = statDescriptions?.join('<br>') || '';
		if (statDescriptions) {
			skillData.progression_text.push(statDescriptions);
		}


		// console.log('StatDescriptions:', statDescriptions);

		// console.log('AdditionalStats:', additionalStats);
		// console.log('AdditionalStatDescriptions:', additionalStatDescriptions);

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
			additionalStats: additionalStats,
			levels: actorLevels,
			cost: costAmounts,
			statDescriptions: statDescriptions,
			additionalStatDescriptions: additionalStatDescriptions,
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

		// console.log('GemTags:', gemTags);

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

	function replaceDamageText(data: any[], replaceStatText: string) {
		if (typeof replaceStatText !== 'string') {
			console.error('⚠️ replaceStatText must be a string.');
			return null;
		}

		// Ensure the replaceStatText contains "Deals" and "Damage"
		if (!replaceStatText.includes('Deals') || !replaceStatText.includes('Damage')) {
			console.error('⚠️ replaceStatText does not contain the expected "Deals" or "Damage" text.');
			return replaceStatText;
		}

		const damageTypes = [
			'spell_minimum_base_cold_damage',
			'spell_maximum_base_cold_damage',
			'spell_minimum_base_lightning_damage',
			'spell_maximum_base_lightning_damage',
			'spell_minimum_base_fire_damage',
			'spell_maximum_base_fire_damage',
			'spell_minimum_base_physical_damage',
			'spell_maximum_base_physical_damage',
			'spell_minimum_base_chaos_damage',
			'spell_maximum_base_chaos_damage'
		];

		const damageRanges = data.filter(
			(item: { stat1_id: string; stat2_id: string }) =>
				damageTypes.includes(item.stat1_id) && damageTypes.includes(item.stat2_id)
		);

		// Ensure we have exactly two damage ranges
		if (damageRanges.length !== 2) {
			console.error('⚠️ Invalid damage range data. Expected exactly two entries.');
			return replaceStatText;
		}

		// Extract damage ranges
		const [lowRange, highRange] = damageRanges;
		const minStart = lowRange.stat1_value;
		const minEnd = highRange.stat1_value;
		const maxStart = lowRange.stat2_value;
		const maxEnd = highRange.stat2_value;

		// Replace only the part of the text that matches the damage pattern
		const updatedText = replaceStatText.replace(
			/Deals (\d+) to (\d+) \[([^\]]+)] Damage/,
			`Deals (${minStart}–${minEnd}) to (${maxStart}–${maxEnd}) $3 Damage`
		);

		return updatedText;
	}

	onMount(async () => {
		console.log('Data', data);
		console.log('RowStore', rowStoreData);

		let constantStats = await getConstantStats(data);
		let dynamicStats = await getDynamicStats(data, skillData, gameVersion);
		await parseGemTags();
		// console.log('SkillData:', skillData);
    console.log('ConstantStats:', constantStats);
    console.log('DynamicStats:', dynamicStats);
    

		// in the statTextRangeValues.stat_text, match the skillData.stat_text and replace the numbers with the values from the statTextRangeValues array
		// if skilldata.stat_text includes the statTextRangeValues.stat_text, replace the numbers with the values from the statTextRangeValues.stat1_values and stat2_values
		const finalStatText = replaceDamageText(statTextRangeValues, dynamicStats.stat_text);
		// console.log('Final Stat Text: ', finalStatText);

		dynamicStats.stat_text = finalStatText ?? '';

		// Generate Wikitext
		wikitext = `
    {{Item
|rarity_id                               = ${skillData.rarity_id}
|name                                    = ${skillData.name}
|class_id                                = ${constantStats.class_id}
|size_x                                  = ${constantStats.size_x}
|size_y                                  = ${constantStats.size_y}
|drop_level                              = ${skillData.drop_level}
|tags                                    = ${skillData.tags}
|metadata_id                             = ${constantStats.metadata_id}
|help_text                               = ${skillData.help_text}
${constantStats.dexterity_percent ? `|dexterity_percent                       = ${constantStats.dexterity_percent}` : ''}
${constantStats.strength_percent ? `|strength_percent                        = ${constantStats.strength_percent}` : ''}
${constantStats.intelligence_percent ? `|intelligence_percent                    = ${constantStats.intelligence_percent}` : ''}
|gem_tags                                = ${skillData.gem_tags}
|gem_description                         = ${skillData.gem_description}
|active_skill_name                       = ${skillData.active_skill_name}
|skill_icon                              = ${skillData.name}
|item_class_id_restriction               = ${skillData.item_class_id_restriction}
|skill_id                                = ${skillData.skill_id}
|cast_time                               = ${skillData.cast_time}
|required_level                          = ${skillData.required_level}
|static_cost_types                       = ${constantStats.static_cost_types}
|static_critical_strike_chance           = ${skillData.static_critical_strike_chance}
|stat_text                               = ${skillData.stat_text}
|gem_tier                                = ${constantStats.gem_tier}


${skillData.finalProgression.join('\n')}

${constantStats.quality_stats}

`;
// }}
// {{Skill progression
// |c1_abbr              = ${skillData.progression_text[0][0]
//   .replace(/(\d+) to (\d+)/, '')
//   .replace(/Deals/, '')
//   .replace(/[\[\]]/g, '')}
//   |c1_header          = ${skillData.progression_text[0][0]
//     .replace(/(\d+) to (\d+)/, 'x to y')
//     .replace(/[\[\]]/g, '')}
//   |c1_pattern_extract = ${skillData.progression_text[0][0]
//     .replace(/(\d+) to (\d+)/, '(%d+) to (%d+)')
//     .replace(/[\[\]]/g, '')}
//   |c1_pattern_value   = %d&nbsp;to&nbsp;%d
//   |c2_abbr              = ${skillData.additional_progression_text[0][0]
//     .replace(/(\d+) to (\d+)/, '')
//     .replace(/Deals/, '')
//     // if it includes Fires x Projectiles, we shoudl show "Projectile Count" instead of "Fires x Projectiles"
//     .replace(/Fires (\d+) Projectiles/, 'Projectile Count')
//     .replace(/[\[\]]/g, '')}
//   |c2_header          = ${skillData.additional_progression_text[0][0]
//     .replace(/(\d+) to (\d+)/, 'x to y')
//     .replace(/Fires (\d+) Projectiles/, 'Fires x Projectiles')
//     .replace(/[\[\]]/g, '')}
//   |c2_pattern_extract = ${skillData.additional_progression_text[0][0]
//     .replace(/(\d+) to (\d+)/, '(%d+) to (%d+)')
//     // Fires (%d+) Projectiles
//     .replace(/Fires (\d+) Projectiles/, 'Fires (%d+) Projectiles')
//     .replace(/[\[\]]/g, '')}
//   |c2_pattern_value   = %d
//   |c3_abbr              = ${skillData.additional_progression_text[0][1]
//     .replace(/(\d+) to (\d+)/, '')
//     // 0% increased Projectile Speed
//     .replace(/0% increased Projectile Speed/, 'Projectile Speed')
//     .replace(/[\[\]]/g, '')}
//   |c3_header          = ${skillData.additional_progression_text[0][1]
//     .replace(/(\d+) to (\d+)/, 'x to y')
//     // x% Increased Projectile Speed
//     .replace(/(\d+)% increased Projectile Speed/, 'x% Increased Projectile Speed')
//     .replace(/[\[\]]/g, '')}
//   |c3_pattern_extract = ${skillData.additional_progression_text[0][1]
//     .replace(/(\d+) to (\d+)/, '(%d+) to (%d+)')
//     // (%d+)%% Increased Projectile Speed
//     .replace(/(\d+)% increased Projectile Speed/, '(%d+)%% Increased Projectile Speed')
//     .replace(/[\[\]]/g, '')}
//   |c3_pattern_value   =  %d%%
	});
// }}
//   {{Skill progression
//   |c1_abbr              = Cold<br>Damage
//     |c1_header          = Deals x to y Cold Damage
//     |c1_pattern_extract = Deals (%d+) to (%d+) Cold Damage
//     |c1_pattern_value   = %d&nbsp;to&nbsp;%d
//   }}

	function copyToClipboard(): any {
		// copy wiki text to clipboard
		navigator.clipboard.writeText(wikitext);
	}

	function combineStatDescriptions(descriptions: string[]): string {
		// console.log('Descriptions:', descriptions);
		// Sample input:
		// [
		//     " +0.1% to [Critical|Critical Hit] Chance 1",
		//     " +2% to [Critical|Critical Hit] Chance 1"
		// ]

		// Extract the stat name from the description
		const statNames = descriptions.map((description) => {
			const match = description.match(/to (.*)/);
			// remove the number at the end of the string
			return match ? match[1].replace(/\d+$/, '').trim() : ''; // Extract stat name and trim whitespace
		});

		// Extract the stat values (handle decimals)
		const statValues = descriptions.map((description) => {
			const match = description.match(/([+-]?\d*\.?\d+)%/); // Match decimals or integers
			return match ? parseFloat(match[1]) : 0; // Parse as a float
		});

		// Combine the values into a range
		const minValue = Math.min(...statValues); // Get the minimum value
		const maxValue = Math.max(...statValues); // Get the maximum value
		const statValueRange = `${minValue}–${maxValue}`;

		// Combine the stat names into a single string
		const statNameString = statNames[0]; // Assuming all descriptions have the same stat name

		// Combine the stat name and value range
		const combinedStatText = `+(${statValueRange})% to ${statNameString}`;

		return combinedStatText;
	}
</script>

<h1>Export Page</h1>
<p>{(message = 'This page is under construction. Shit is krangled')}</p>

<h2>Generated Wikitext:</h2>
<button class="btn variant-filled-success" on:click={() => copyToClipboard()}
	>Copy to clipboard</button
>

<pre>{wikitext}</pre>
