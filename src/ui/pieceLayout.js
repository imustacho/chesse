import { createCanvas } from '@napi-rs/canvas';

// Visible piece dimensions, shared by both colors. Transparent PNG padding is ignored.
export const PIECE_SIZES = {
  p: [52, 68], n: [62, 80], b: [58, 82], r: [60, 72], q: [70, 82], k: [66, 86],
};

export function alphaBounds(image) {
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (data[(y * image.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('The piece image is empty.');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function normalizePiece(image, type) {
  const bounds = alphaBounds(image), [width, height] = PIECE_SIZES[type];
  const canvas = createCanvas(100, 100), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, (100 - width) / 2, 92 - height, width, height);
  return canvas;
}
