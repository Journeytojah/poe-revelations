// src/lib/utils/exporters/activeSkills/getDynamicStats.ts

import { rowStore } from '$lib/stores/rowStore';
import { get } from 'svelte/store';
import { getStatDescriptionsForAll } from '$lib/utils/exporters/activeSkills/getStatDescriptions.js';
import { findGrantedEffectId } from './getConstantStats';
// import { findGrantedEffectId, findGrantedEffectsPerLevel, findGrantedEffectStatSetPerLevel } from './sharedUtils';

let gemTags: any[];
let grantedEffects: any[];
let grantedEffectsPerLevel: any[];
let grantedEffectStatSets: any[];
let grantedEffectsStatSetsPerLevel: any[];


export async function getDynamicStats(data: any, skillData: any, gameVersion: string) {
  const rowStoreData = get(rowStore);
  const skillId = rowStoreData?.Id;

  skillData.name = rowStoreData?.DisplayedName;
  skillData.skill_id = rowStoreData?.Id.charAt(0).toUpperCase() + rowStoreData?.Id.slice(1);

  gemTags = data?.allData.GemTags?.rows || [];
  grantedEffects = data?.allData.GrantedEffects?.rows || [];
  grantedEffectsPerLevel = data?.allData.GrantedEffectsPerLevel?.rows || [];
  grantedEffectStatSets = data?.allData.GrantedEffectStatSets?.rows || [];
  grantedEffectsStatSetsPerLevel = data?.allData.GrantedEffectStatSetsPerLevel?.rows || [];

  // Process gem description
  let gemDescription = rowStoreData?.Description;
  gemDescription = gemDescription.replace(/[\[\]]/g, '');
  gemDescription = gemDescription.replace('[Projectile|Projectiles]', 'Projectiles');
  gemDescription = gemDescription.replace('Projectile|Projectiles', 'Projectiles');
  skillData.gem_description = gemDescription;

  // Process weapon restrictions
  const weaponRestrictions = rowStoreData?.WeaponRestriction_ItemClasses || [];
  const weaponRestrictionNames = weaponRestrictions.map((restriction: { Id: any }) => restriction.Id);
  skillData.item_class_id_restriction = weaponRestrictionNames.join(', ');

  // Find granted effect and progression
  const grantedEffect = await findGrantedEffectId(skillId);
  const grantedEffectPerLevel = findGrantedEffectsPerLevel(grantedEffect?.Id);

  console.log('Granted Effect', grantedEffect);
  console.log('Granted Effect Per Level', grantedEffectPerLevel);
  
  
  const gemProgression = await findGemProgression(grantedEffect.Id, skillData, gameVersion);
  console.log('Gem Progression', gemProgression);
  

  // Initialize progression text
  let progressionText = '';

  gemProgression.levels.forEach((level: number, index: number) => {
    progressionText = `
|level${index + 1} = ${index < 20 ? 'True' : 'False'}
|level${index + 1}_level_requirement = ${gemProgression.levels[index]}
|level${index + 1}_cost_amounts = ${gemProgression.cost[index]}
|level${index + 1}_${skillData.intelligence_percent ? 'intelligence' : 'strength'}_requirement = ${getLevelAttrRequirements(
  gemProgression.levels[index],
  skillData.intelligence_percent || skillData.strength_percent || skillData.dexterity_percent
)}
|level${index + 1}_stat_text = ${gemProgression.statDescriptions?.[index]} <br> ${gemProgression.additionalStatDescriptions?.[index]}
|level${index + 1}_stat1_id = ${gemProgression.floatStats[index][0].id}
|level${index + 1}_stat1_value = ${gemProgression.floatStats[index][0].value}
|level${index + 1}_stat2_id = ${gemProgression.floatStats[index][1].id}
|level${index + 1}_stat2_value = ${gemProgression.floatStats[index][1].value}
`;

    // Dynamically add additional stats
    if (gemProgression.additionalStats?.[index]) {
      gemProgression.additionalStats[index].forEach((stat: { id: any; value: any }, statIndex: number) => {
        progressionText += `
|level${index + 1}_stat${statIndex + 3}_id = ${stat.id}
|level${index + 1}_stat${statIndex + 3}_value = ${stat.value}
        `;
      });
    }

    // Remove square brackets from the text
    progressionText = progressionText.replace(/[\[\]]/g, '');

    skillData.finalProgression.push(progressionText);
  });

  // Process critical strike chance
  const grantedEffectStatSetPerLevel = findGrantedEffectStatSetPerLevel(grantedEffect?.Id);
  const critChance = grantedEffectStatSetPerLevel?.AttackCritChance || grantedEffectStatSetPerLevel?.SpellCritChance;
  skillData.static_critical_strike_chance = critChance / 100;

  // Process additional stats
  const additionalStats = grantedEffectStatSetPerLevel?.AdditionalStats || [];
  const additionalStatsValues = grantedEffectStatSetPerLevel?.AdditionalStatsValues || [];
  const statSet = new Set<{ id: string; value: number }>();

  for (let i = 0; i < additionalStats.length; i++) {
    const statId = additionalStats[i]?.Id;
    const statValue = additionalStatsValues[i];
    if (statId) {
      statSet.add({ id: statId, value: statValue });
    } else {
      console.warn('⚠️ Invalid statId at index:', i, additionalStats[i]);
    }
  }

  // Process float stats
  const floatStats = grantedEffectStatSetPerLevel?.FloatStats || [];
  const floatStatsValues = grantedEffectStatSetPerLevel?.BaseResolvedValues || grantedEffectStatSetPerLevel?.FloatStatsValues || [];

  for (let i = 0; i < floatStats.length; i++) {
    const statId = floatStats[i]?.Id;
    const statValue = floatStatsValues[i];
    if (statId) {
      statSet.add({ id: statId, value: statValue });
    } else {
      console.warn('⚠️ Invalid statId at index:', i, floatStats[i]);
    }
  }

  // Fetch and set stat descriptions
  const statText = await getStatDescriptionsForAll(Array.from(statSet).reverse(), true, gameVersion);
  skillData.stat_text = statText?.join('<br>') || '';

  return skillData;
}

function getLevelAttrRequirements(level: number, multi: number): number {
  if (multi === 0) {
    return 0;
  }

  const req = Math.round((5 + (level - 3) * 2.25) * (multi / 100) ** 0.9) + 4;
  return req < 8 ? 0 : req;
}

async function findGemProgression(grantedEffectId: string, skillData: any, gameVersion: string) {
  const progression = grantedEffectsStatSetsPerLevel.filter(
    (effect: any) => effect.StatSet.Id === grantedEffectId
  );

  const progression2 = grantedEffectsPerLevel.filter(
    (effect) => effect.GrantedEffect.Id === grantedEffectId
  );

  console.log('Progression2', progression2);
  

  let floatStats = progression.map((effect: any) => effect.FloatStats);
  let additionalStats = progression.map((effect: any) => effect.AdditionalStats);

  floatStats = floatStats.map((stats: any[]) => stats.map((stat: any) => stat.Id));
  additionalStats = additionalStats.map((stats: any[]) => stats.map((stat: any) => stat.Id));

  const baseResolvedValues = progression.map((effect: any) => effect.BaseResolvedValues);
  const additionalStatsValues = progression.map((effect: any) => effect.AdditionalStatsValues);

  floatStats = floatStats.map((stats: any[], index: number) =>
    stats.map((stat: any, i: number) => ({
      id: stat,
      value: baseResolvedValues[index][i]
    }))
  );

  additionalStats = additionalStats.map((stats: any[], index: number) =>
    stats.map((stat: any, i: number) => ({
      id: stat,
      value: additionalStatsValues[index][i]
    }))
  );

  const statSetProgression = new Set(floatStats.flat());
  const additionalStatSetProgression = new Set(additionalStats.flat());

  const statDescriptions = await getStatDescriptionsForAll(Array.from(statSetProgression), false, gameVersion);
  let additionalStatDescriptions = await getStatDescriptionsForAll(Array.from(additionalStatSetProgression), false, gameVersion);

  additionalStatDescriptions = [];
  for (let levelIndex = 0; levelIndex < additionalStats.length; levelIndex++) {
    const levelStats = additionalStats[levelIndex];
    const levelDescIndex = levelIndex * 2;

    if (levelStats[0]?.id === 'projectile_count') {
      const projectileDesc = additionalStatDescriptions[levelDescIndex] || `Fires ${levelStats[0]?.value} Projectiles`;
      additionalStatDescriptions.push(projectileDesc);
    }

    const speedValue = levelStats[1]?.value || 0;
    const speedDesc = additionalStatDescriptions[levelDescIndex + 1] || `${speedValue}% increased Projectile Speed`;
    additionalStatDescriptions.push(speedDesc);

    skillData.additional_progression_text.push(additionalStatDescriptions);
  }

  if (statDescriptions) {
    skillData.progression_text.push(statDescriptions);
  }

  const costAmounts = progression2.map((effect: any) => effect.CostAmounts[0]);
  const statProgression = progression.map((effect) => {
    console.log('Intelligence Percent', skillData.intelligence_percent);
    console.log('Strength Percent', skillData.strength_percent);
    console.log('Dexterity Percent', skillData.dexterity_percent);
    
    // TODO: handle dex and str requirements
    return getLevelAttrRequirements(
      Math.floor(effect.ActorLevel),
      skillData.intelligence_percent || skillData.strength_percent || skillData.dexterity_percent
    );
  });
  const actorLevels = progression.map((effect: any) => Math.floor(effect.ActorLevel));

  // console.log('Progression', progression);

  console.log('Dooo', statProgression);
  
  
  return {
    stat: actorLevels.map((level: number) =>
      getLevelAttrRequirements(level, skillData.intelligence_percent || skillData.strength_percent || skillData.dexterity_percent)
    ),
    additionalStats,
    levels: actorLevels,
    cost: costAmounts,
    statDescriptions,
    additionalStatDescriptions,
    floatStats
  };
}

function findGrantedEffectsPerLevel(skillId: string) {
  return grantedEffectsPerLevel.find((effect: { GrantedEffect: { Id: string; }; }) => {
    try {
      return effect.GrantedEffect.Id === skillId;
    } catch (error) {
      console.error('Error', error);
      return false;
    }
  });
}

function findGrantedEffectStatSetPerLevel(skillId: string) {
  // console.log('GrantedEffectsStatSetsPerLevel', grantedEffectsStatSetsPerLevel);
  return grantedEffectsStatSetsPerLevel.find((effect: { StatSet: { Id: string; }; }) => {
    try {
      return effect.StatSet.Id === skillId;
    } catch (error) {
      console.error('Error', error);
      return false;
    }
  });
}