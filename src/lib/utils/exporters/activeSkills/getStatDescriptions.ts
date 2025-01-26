import { rowStore } from "$lib/stores/rowStore";
import { fetchStatDescriptions } from "$lib/utils/fetchStatDescriptions";
import { fetchVersion } from "$lib/utils/fetchVersion";
import { get } from "svelte/store";

type StatBlock = {
  stats: string[];
  values: string[];
  descriptions: string[];
};

const rowStoreData = get(rowStore);

export async function getStatDescriptionsForAll(
  statSet: { id: string; value: number }[],
  skipSame: boolean = true,
  gameVersion: string
) {
  // console.log('1. StatSet:', statSet);
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

    // console.log('2. 🔍 Matched Block:', descriptionBlock);
    // console.log('Values:', values);

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

    // console.log('3. 🔄 Block Stats:', blockStats);
    // console.log('💡 Block Values:', blockValues);

    // Render descriptions for each progression step
    values.forEach((_, index) => {
      let renderedDescriptions = descriptionBlock.descriptions.map((desc) => {
        let result = desc;
        let value = values[index] || 0;
        // Replace placeholders ({0}, {1}, ...) with progression values
        blockValues.forEach((statProgression, idx) => {
          value = statProgression[index] || 0;
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

          // divide_by_one_hundred
          if (desc.includes('divide_by_one_hundred')) {
            renderedValue = parseFloat((value / 100).toFixed(2)); // Transform value
            renderedText = `${renderedValue > 0 ? '+' : ''}${renderedValue}`; // Format with sign and percentage
            result = result.replace(new RegExp(`\\{${idx}\\:\\+d\\}`, 'g'), renderedText); // Replace `{idx:+d}`
            result = result.replace(new RegExp(`\\{${idx}\\}`, 'g'), renderedText); // Replace `{idx}`
            result = result.replace('divide_by_one_hundred', ''); // Remove directive
          } else if (desc.includes(`{${idx}:+d}`)) {
            renderedText = value >= 0 ? `+${value}` : `${value}`;
            result = result.replace(new RegExp(`\\{${idx}\\:\\+d\\}`, 'g'), renderedText);
          } else {
            result = result.replace(new RegExp(`\\{${idx}\\}`, 'g'), renderedText);
          }

          if (desc.includes(`{${idx}:+d}`)) {
            renderedText = value >= 0 ? `+${value}` : `${value}`;
            result = result.replace(new RegExp(`\\{${idx}\\:\\+d\\}`, 'g'), renderedText);
          } else {
            result = result.replace(new RegExp(`\\{${idx}\\}`, 'g'), renderedText);
          }

          // if the value is 1000, we keep the first result, otherwise we use the second result
          if (value === 1000) {
            result = result.replace(
              '[AddedAttackCastTime|+1000 second]',
              `+${value / 1000} second`
            );
            // remove the 1000 at the start of the description
            result = result.replace('1000', '');
            // remove the 1 at the end of the string, not the first occurence
            result = result.replace(/1$/, '');
          } else {
            result = result.replace(
              '[AddedAttackCastTime|+1000 seconds]',
              `+${value / 1000} seconds`
            );
          }
        });

        if (result.includes('#|-1 "0% reduced [Projectile] Speed" negate 1')) {
          result = result.replace(
            '#|-1 "0% reduced [Projectile] Speed" negate 1',
            '0% reduced Projectile Speed'
          );
        } else if (result.includes('1|# "0% increased [Projectile] Speed"')) {
          result = result.replace(
            '1|# "0% increased [Projectile] Speed"',
            '0% increased Projectile Speed'
          );
        }

        if (result.includes('2|# 0 # "Fires 6 [Projectile|Projectiles]"')) {
          result = result.replace(
            '2|# 0 # "Fires 6 [Projectile|Projectiles]"',
            'Fires 6 Projectiles'
          );
        } else if (result.includes('2|# 1 # "Fires 6 Arrows"')) {
          result = result.replace('2|# 1 # "Fires 6 Arrows"', 'Fires 6 Arrows');
        }

        // Handle singular/plural placeholders
        if (result.includes('[Projectile|Projectiles]')) {
          const pluralSuffix = blockValues[0][index] === 1 ? 'Projectile' : 'Projectiles';
          result = result.replace('[Projectile|Projectiles]', pluralSuffix);
        }

        // Handle [Critical|Critical Hit]
        if (result.includes('[Critical|Critical Hit]')) {
          // replace with "Critical Hit"
          result = result.replace('[Critical|Critical Hit]', 'Critical Hit');
        }

        // Handle static replacements
        result = result
          .replace('[Chaos|Chaos]', 'Chaos')
          .replace('[Lightning]', 'Lightning')
          .replace('[Total]', 'Total')
          .replace('[Projectile]', 'Projectile')
          .replace('[Physical]', 'Physical')
          .replace('[Fire]', 'Fire');

        // Remove leftover directives
        result = result
          .replace(/milliseconds_to_seconds_2dp_if_required/g, '')
          .replace(/per_minute_to_per_second/g, '')
          .replace(/\s{2,}/g, ' ') // Clean extra spaces
          .trim();

        return result;
      });

      // remove all the # from the descriptions
      renderedDescriptions = renderedDescriptions.map((desc) => desc.replace(/#/g, ''));
      // remove the quotes from the descriptions
      renderedDescriptions = renderedDescriptions.map((desc) => desc.replace(/"/g, ''));

      // if value is 1000
      if (values[index] === 1000) {
        // discard the second rendered description because we are using singular
        renderedDescriptions = renderedDescriptions.slice(0, 1);
      }
      // if the rendered description is like
      // [
      //     "1000 Projectile duration is 2 second 1",
      //     " Projectile duration is 2 seconds 1"
      // ]
      if (renderedDescriptions.length === 2) {
        const firstDescription = renderedDescriptions[0];
        const secondDescription = renderedDescriptions[1];
        const firstMatch = firstDescription.match(/is (\d+) second/);
        const secondMatch = secondDescription.match(/is (\d+) seconds/);
        if (firstMatch && secondMatch) {
          const firstValue = parseInt(firstMatch[1]);
          const secondValue = parseInt(secondMatch[1]);
          if (firstValue === 1 && secondValue !== 1) {
            renderedDescriptions = renderedDescriptions.slice(0, 1);
          } else {
            renderedDescriptions = renderedDescriptions.slice(1, 2);
          }
        }
      }

      // Add rendered descriptions to the collection
      allRenderedDescriptions.push(...renderedDescriptions);

      // console.log('4. 📝 Rendered Descriptions for Level:', index, renderedDescriptions);
    });
  });

  // Join all rendered descriptions into skillData.stat_text
  // skillData.stat_text = allRenderedDescriptions.join('<br>');
  // console.log('5. 📜 Final Stat Text:', skillData.stat_text);
  return allRenderedDescriptions;
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