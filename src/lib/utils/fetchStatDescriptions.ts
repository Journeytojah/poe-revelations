export async function fetchStatDescriptions(
  fetch: (input: RequestInfo | URL) => Promise<Response>,
  patchUrl: string,
  path: string
): Promise<string> {
  const indexUrl = `https://ggpk.exposed/files?q=search&adapter=${encodeURIComponent(patchUrl)}&path=metadata%2Fstatdescriptions&filter=type:file&limit=1000`;
  const fileList = await fetch(indexUrl).then((r) => r.json());

  // Normalize and prepare the path
  let pathWithExtension = path.replace(/\/$/, '');
  if (!pathWithExtension.includes('.')) {
    pathWithExtension += '.csd';
  }
  pathWithExtension = pathWithExtension.toLowerCase();

  // console.log('Fetching Stat Descriptions:', pathWithExtension);
  // console.log(indexUrl);

  const file = fileList.files.find((f: { path: string }) => f.path === pathWithExtension);
  if (!file) {
    throw new Error(`File not found: ${pathWithExtension}`);
  }

  // console.log('Found file:', file);
  const fileUrl = file.url;
  let fileData = await fetch(fileUrl).then((r) => r.text());
  // console.log('Raw File Data:', fileData);

  // Process includes recursively
  const includeRegex = /include "(.*?)"/g;
  let match: RegExpExecArray | null;

  while ((match = includeRegex.exec(fileData)) !== null) {
    const includePath = match[1];
    // console.log('Include Path:', includePath);

    const includedFileData = await fetchStatDescriptions(fetch, patchUrl, includePath);
    fileData = fileData.replace(match[0], includedFileData); // Replace include statement with included content
  }

  // Remove non-English blocks
  fileData = filterEnglishContent(fileData);

  // console.log('Processed English-only File Data:', fileData);
  return fileData;
}

// Helper function to filter English content
function filterEnglishContent(data: string): string {
  // Remove all blocks starting with lang "<language>" until the next description or lang block
  return data.replace(/lang ".*?"[\s\S]*?(?=(lang "|description|$))/g, '');
}
