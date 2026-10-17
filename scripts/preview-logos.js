import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';

const variants = [['sunny', 'Sunny'], ['midnight', 'Midnight'], ['royal', 'Royal'], ['knight', 'Cheese Knight']];
const canvas = createCanvas(1200, 380), ctx = canvas.getContext('2d');
ctx.fillStyle = '#FFF8E7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
for (let i = 0; i < variants.length; i++) {
  const [name, title] = variants[i];
  const image = await loadImage(`assets/branding/logos/chesse-${name}.png`);
  ctx.drawImage(image, i * 300 + 20, 25, 260, 260);
  ctx.textAlign = 'center'; ctx.fillStyle = '#29251E'; ctx.font = 'bold 23px sans-serif';
  ctx.fillText(title, i * 300 + 150, 328);
}
await writeFile('assets/previews/logos.png', canvas.toBuffer('image/png'));
console.log('Logo preview generated.');
