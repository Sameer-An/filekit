import fs from 'node:fs';
import path from 'node:path';

const registryPath = path.resolve('src/lib/tools-registry.ts');
const text = fs.readFileSync(registryPath, 'utf8');

// Parse tool definitions
const toolBlocks = text.split(/\{\s*id:\s*'/).slice(1);

const tools = toolBlocks.map((block) => {
  const id = block.split("'")[0];
  const title = (block.match(/title:\s*'([^']+)'/) || [])[1] || '';
  const category = (block.match(/category:\s*'([^']+)'/) || [])[1] || '';
  const mode = (block.match(/mode:\s*'([^']+)'/) || [])[1] || '';
  const description = (block.match(/description:\s*'([^']+)'/) || [])[1] || '';
  
  const inFormatsMatch = block.match(/inputFormats:\s*\[([^\]]*)\]/);
  const inFormats = inFormatsMatch
    ? inFormatsMatch[1].replace(/['"\s]/g, '').split(',').filter(Boolean)
    : [];

  const outFormatsMatch = block.match(/outputFormats:\s*\[([^\]]*)\]/);
  const outFormats = outFormatsMatch
    ? outFormatsMatch[1].replace(/['"\s]/g, '').split(',').filter(Boolean)
    : [];

  return { id, title, category, mode, description, inFormats, outFormats };
});

console.log(`Total tools in registry: ${tools.length}`);
console.log('Categories:', [...new Set(tools.map((t) => t.category))]);

fs.writeFileSync('tools-inventory-raw.json', JSON.stringify(tools, null, 2), 'utf8');
console.log('Wrote tools-inventory-raw.json');
