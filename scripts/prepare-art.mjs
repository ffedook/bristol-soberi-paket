import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
const sizes = {
  'home-bg-2': 1100,
  'core-bg-2': 1100,
  bag: 900,
  squirrel: 650,
  thief: 650,
  paw: 500,
  coins: 650,
  gift: 500,
  coin: 128,
  bottle: 150,
  chips: 150,
};
for (const [name, width] of Object.entries(sizes)) {
  await sharp(`source-art/${name}.png`)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 86, effort: 6 })
    .toFile(`public/art/${name}.webp`);
}
for (const size of [192, 512]) {
  const bag = await sharp('source-art/bag.png')
    .trim()
    .resize(Math.round(size * 0.7), Math.round(size * 0.7), { fit: 'inside' })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#ae0e36' },
  })
    .composite([{ input: bag, gravity: 'centre' }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
