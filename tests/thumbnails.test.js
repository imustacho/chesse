import test from 'node:test';
import assert from 'node:assert/strict';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { brandImage, brandThumbnailAttachment } from '../src/ui/brand.js';

test('all thumbnails resolve to real high-resolution transparent PNG attachments', async () => {
  for (const expression of ['happy', 'think', 'win', 'lose', 'check', 'checkmate', 'blunder']) {
    const name = `chesse_face_${expression}`;
    assert.equal(brandImage(name), `attachment://${name}.png`);
    const attachment = brandThumbnailAttachment(name);
    assert.equal(attachment.name, `${name}.png`);
    const image = await loadImage(await readFile(attachment.attachment));
    assert.ok(image.width >= 512 && image.height >= 512);
    const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0);
  }
});
