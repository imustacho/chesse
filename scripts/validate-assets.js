import { readdir, readFile, writeFile } from 'node:fs/promises';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import assert from 'node:assert/strict';

const sections = {
  'branding/logos': { min: 512, count: 4 },
  'branding/icons': { min: 512, count: 4, transparent: true },
  expressions: { min: 512, count: 8, transparent: true },
  emojis: { size: 128, count: 7, transparent: true },
  'chess/pieces/light': { size: 256, count: 6, transparent: true },
  'chess/pieces/dark': { size: 256, count: 6, transparent: true },
  previews: { count: 5 },
  references: { count: 4 },
};
const catalog = [];
for (const [section, rules] of Object.entries(sections)) {
  const files = (await readdir(`assets/${section}`)).filter(file => file.endsWith('.png')).sort();
  assert.equal(files.length, rules.count, `${section}: unexpected or duplicate images`);
  for (const file of files) {
    const path = `assets/${section}/${file}`, bytes = await readFile(path), image = await loadImage(bytes);
    if (rules.size) { assert.equal(image.width, rules.size); assert.equal(image.height, rules.size); }
    if (rules.min) assert.ok(image.width >= rules.min && image.height >= rules.min, `${path}: low-resolution master`);
    if (section === 'emojis') assert.ok(bytes.length < 256 * 1024, `${path}: exceeds the emoji size limit`);
    if (rules.transparent) {
      const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0, `${path}: missing transparency`);
    }
    catalog.push({ section, file: `${section}/${file}`, width: image.width, height: image.height, bytes: bytes.length });
  }
}
await writeFile('assets/metadata/catalog.json', JSON.stringify(catalog, null, 2));
console.log(`Validated ${catalog.length} organized PNG assets; catalog saved to assets/metadata/catalog.json.`);
