import fs from 'node:fs';

const tools = JSON.parse(fs.readFileSync('tools-inventory-raw.json', 'utf8'));

const catMap = {};
for (const t of tools) {
  if (!catMap[t.category]) catMap[t.category] = [];
  catMap[t.category].push({ id: t.id, title: t.title, mode: t.mode, in: t.inFormats, out: t.outFormats });
}

for (const [cat, items] of Object.entries(catMap)) {
  console.log(`\n=== CATEGORY: ${cat.toUpperCase()} (${items.length} tools) ===`);
  for (const item of items) {
    console.log(` - [${item.mode.padEnd(7)}] ${item.id.padEnd(22)}: ${item.title} (in: ${item.in.join(',') || '*'} -> out: ${item.out.join(',') || '*'})`);
  }
}
