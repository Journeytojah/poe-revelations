// src/lib/utils/getConstantStats.ts

import { rowStore } from '$lib/stores/rowStore';
import { get } from 'svelte/store';
import { getStatDescriptionsForAll } from './getStatDescriptions';

let skillData = {
  metadata_id: '',
  class_id: '',
  size_y: '',
  size_x: '',
  intelligence_percent: '',
  strength_percent: '',
  dexterity_percent: '',
  gem_tier: '',
  cast_time: 0,
  static_cost_types: '',
  quality_stats: '',
};

let baseItemTypes: any[] = [];
let skillGems: any[] = [];
let grantedEffects: any[] = [];
let grantedEffectStatSets = [];
let grantedEffectQualityStats: any[] = [];
let gameVersion: string = '';
let statSet = new Set<{ id: string; value: number }>();


export async function getConstantStats(data: any) {
  const skillId = get(rowStore)?.Id;
  const skillName = get(rowStore)?.DisplayedName;
  baseItemTypes = data?.allData.BaseItemTypes?.rows;
  skillGems = data?.allData.SkillGems?.rows;
  grantedEffects = data?.allData.GrantedEffects?.rows;
  grantedEffectStatSets = data?.allData.GrantedEffectStatSets?.rows;
  grantedEffectQualityStats = data?.allData.GrantedEffectQualityStats?.rows;
  gameVersion = data.gameVersion;

  // TODO: figure out what the deal is here with the name. It's not always the same as the displayed name but its also not always the same as the granted effect name...

  parseBaseItemTypes(skillId, skillName);

  const grantedEffect = await findGrantedEffectId(skillId);
  // console.log('Effect', grantedEffect);

  await getGemQuality(grantedEffect?.Id);

  try {
    const castTime = grantedEffect?.CastTime;
    const staticCostType = grantedEffect?.CostTypes[0]?.Id;
    skillData.cast_time = castTime / 1000;
    skillData.static_cost_types = staticCostType;
    // console.log('CastTime', castTime);
  } catch (error) {
    console.error(`No cast time found for skillId: ${skillId}`);
  }

  const grantedEffectStatSet = grantedEffectStatSets.find(
    (statSet: { Id: any; }) => statSet.Id === grantedEffect?.Id
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
  return skillData;
}

function parseBaseItemTypes(skillId: string, skillName: string) {
  // find the baseitemtype.name for the skill, case insensitive
  const baseItemType = baseItemTypes.find(
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
  const skillGem = skillGems.find(
    (skillGem) => skillGem.BaseItemType.Id === skillMetadata
  );

  skillData.intelligence_percent = skillGem?.IntelligenceRequirementPercent;
  skillData.strength_percent = skillGem?.StrengthRequirementPercent;
  skillData.dexterity_percent = skillGem?.DexterityRequirementPercent;
  skillData.gem_tier = skillGem?.CraftingLevel;
}

export async function findGrantedEffectId(skillId: string) {
  return grantedEffects.find((effect) => {
    try {
      return effect.ActiveSkill?.Id === skillId;
    } catch (error) {
      console.error('Error', error);
      return false;
    }
  });
}

async function getGemQuality(grantedEffectId: string) {
  const qualityStats = grantedEffectQualityStats.filter(
    (qualityStat) => qualityStat.GrantedEffect.Id === grantedEffectId
  );

  // empty set for the statSet
  let qualSet = new Set<{ id: string; value: number }>();
  // console.log('QualityStats:', qualityStats);
  let statId = '';
  let qualStatText = '';
  for (let i = 0; i < qualityStats.length; i++) {
    statId = qualityStats[i].Stats[0].Id;
    const statValueMin = (qualityStats[i].StatsValuesPermille[0] / 1000) * 1;
    const statValueMax = (qualityStats[i].StatsValuesPermille[0] / 1000) * 20;
    if (statId) {
      qualSet.add({ id: statId, value: statValueMin });
      qualSet.add({ id: statId, value: statValueMax });
    } else {
      console.warn('⚠️ Invalid statId at index:', i, qualityStats[i]);
    }
  }

  // console.log('📊 Collected Quality StatSet:', Array.from(qualSet));

  const statText = await getStatDescriptionsForAll(Array.from(qualSet), true,gameVersion);
  // console.log('Quality Stat Text:', statText);

  if (statText) {
    qualStatText = combineStatDescriptions(statText);
    // skillData.quality_stats = qualStatText;
  }

  // we need to produce a string like this:
  //     |quality_type1_stat_text                 = +(0–2)% to Critical Hit Chance
  // |quality_type1_stat1_id                  = Critical_Hit_Chance
  // where stat_text is qualStatText and stat1_id is the statId
  skillData.quality_stats = `
  |quality_type1_stat_text                 = ${qualStatText}
  |quality_type1_stat1_id                  = ${statId}
  `;
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