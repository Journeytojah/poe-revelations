import type { SchemaFile, SchemaTable } from 'pathofexile-dat-schema';

export async function fetchSchema(fetch: (input: RequestInfo | URL) => Promise<Response>): Promise<SchemaFile | null> {
  try {
    // const url = 'https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json';
    const url = './schema.min.json';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching schema:', error);
    return null;
  }
}


export function findTable(schema: SchemaFile, tableName: string, version: string): SchemaTable | null {
  if (!version || isNaN(parseInt(version, 10))) {
    console.error("Invalid version:", version);
    return null;
  }

  const versionNumber = parseInt(version, 10);

  return (
    schema?.tables.find((t) => {
      const tableNameMatches = new RegExp(`^${tableName}$`, 'i').test(t.name);
      const versionMatches = t.validFor === versionNumber || t.validFor === 3;

      if (tableNameMatches && versionMatches) {
        // console.log("Matched table:", t.name, "Valid for version:", t.validFor);
      }

      return tableNameMatches && versionMatches;
    }) || null
  );
}
