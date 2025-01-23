import type { PageLoad } from './$types';
import { browser } from '$app/environment';

import { fetchSchema, findTable } from '$lib/utils/fetchSchema';
import { fetchVersion } from '$lib/utils/fetchVersion';
import { fetchDatFiles } from '$lib/utils/fetchDatFiles';
import { processTableData } from '$lib/utils/processTableData';
import type { Header } from 'pathofexile-dat/dat.js';

// 🛠️ Utility function for resolving foreign key values
function resolveForeignKeyValue(value: string | number, referencedTable: any): any {
  if (Array.isArray(value)) {
    return value.map((v) => resolveForeignKeyValue(v, referencedTable));
  }

  const referencedRow = referencedTable.rows[String(value)] || referencedTable.rows[Number(value)];

  if (!referencedRow) {
    return `Missing(${value})`;
  }

  if (referencedRow.name) {
    return referencedRow.name;
  }

  return referencedRow;
}

// 🚀 Page Load Function
export const load: PageLoad = async ({ fetch, url }) => {
  const tableNames = ['GemTags', 'GrantedEffects', 'GrantedEffectsPerLevel', 'GrantedEffectStatSets', 'GrantedEffectStatSetsPerLevel', 'BaseItemTypes', 'SkillGems', 'GrantedEffectQualityStats'];
  const gameVersion = url.searchParams.get('version') || '1';

  const schemaFile = await fetchSchema(fetch);
  const { patchUrl } = await fetchVersion(fetch, gameVersion);
  const datFiles = await fetchDatFiles(fetch, patchUrl);

  type ViewerSerializedHeader = Omit<Header, 'length'> & { length?: number; name: string } & { type: { key?: { table?: string; foreign?: boolean } } };

  const allData: Record<
    string,
    { headers: ViewerSerializedHeader[]; rows: any[]; foreignKeys?: ViewerSerializedHeader[] }
  > = {};

  const referencedTables: Record<string, { rows: any }> = {};

  if (browser && schemaFile) {
    const { readDatFile, getHeaderLength, readColumn } = await import('pathofexile-dat/dat.js');

    for (const tableName of tableNames) {
      const schemaTable = tableName ? findTable(schemaFile!, tableName, gameVersion) : null;

      if (schemaTable) {
        const result = await processTableData(
          tableName,
          datFiles,
          fetch,
          readDatFile,
          getHeaderLength,
          readColumn,
          schemaTable
        );

        const headers = result.headers;
        const rows = result.rows;

        // ✅ Identify Foreign Keys from Headers
        const foreignKeys = headers.filter(
          (header) => header.type.key && 'table' in header.type.key && header.type.key.foreign
        );

        // ✅ Fetch Referenced Tables
        for (const fk of foreignKeys) {
          const referencedTableName = (fk.type.key as { table?: string; foreign?: boolean })?.table;

          if (referencedTableName && !referencedTables[referencedTableName]) {
            try {
              const refSchemaTable = findTable(schemaFile!, referencedTableName, gameVersion);
              if (refSchemaTable) {
                const refResult = await processTableData(
                  referencedTableName,
                  datFiles,
                  fetch,
                  readDatFile,
                  getHeaderLength,
                  readColumn,
                  refSchemaTable
                );

                referencedTables[referencedTableName] = { rows: refResult.rows };
              } else {
                console.warn(`Referenced table schema not found for: ${referencedTableName}`);
              }
            } catch (error) {
              console.error(`Error processing foreign key table ${referencedTableName}:`, error);
            }
          }
        }

        // ✅ Process Foreign Key Relationships
        for (const foreignKey of foreignKeys) {
          const columnName = foreignKey.name;
          const referencedTableName = (foreignKey.type.key as { table?: string; foreign?: boolean })?.table;

          const referencedTable = referencedTables[referencedTableName!];
          if (!referencedTable) {
            console.warn(`[WARNING] Referenced table "${referencedTableName}" not found in referencedTables.`);
            continue;
          }

          for (const row of rows) {
            const foreignKeyValue = row[columnName];
            if (foreignKeyValue === null || foreignKeyValue === undefined) continue;

            const resolvedValue = resolveForeignKeyValue(foreignKeyValue, referencedTable);

            row[columnName] = typeof resolvedValue === 'object' ? { ...resolvedValue } : resolvedValue;

            if (Array.isArray(resolvedValue)) {
              row[columnName] = resolvedValue.map((v) => (typeof v === 'object' ? { ...v } : v));
            }
          }
        }

        allData[tableName] = {
          headers,
          rows,
          foreignKeys,
        };
      }
    }
  }

  return {
    allData,
    gameVersion,
  };
};
