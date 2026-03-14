/**
 * Generates extension icons at 16, 48, and 128px.
 * Requires: npm install canvas
 * Usage:    npm run generate-icons
 */
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '..', 'icons');
mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 48, 128];

const variants = [
  { suffix: '',        funnelColor: '#656d76' }, // inactive (grey)
  { suffix: '-active',  funnelColor: '#1f883d' }, // active (green)
];

for (const { suffix, funnelColor } of variants) {
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const s = size; // shorthand

    // Background (transparent)
    ctx.clearRect(0, 0, s, s);

    // Draw funnel shape
    ctx.fillStyle = funnelColor;
    ctx.strokeStyle = funnelColor;
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pad = s * 0.1;
    const topY = s * 0.2;
    const midY = s * 0.5;
    const botY = s * 0.8;
    const topLeft = pad;
    const topRight = s - pad;
    const neckLeft = s * 0.38;
    const neckRight = s * 0.62;

    ctx.beginPath();
    ctx.moveTo(topLeft, topY);
    ctx.lineTo(topRight, topY);
    ctx.lineTo(neckRight, midY);
    ctx.lineTo(neckRight, botY);
    ctx.lineTo(neckLeft, botY);
    ctx.lineTo(neckLeft, midY);
    ctx.closePath();
    ctx.fill();

    // Draw "T" letter overlay in white
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(s * 0.32)}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', s / 2, s * 0.52);

    const buffer = canvas.toBuffer('image/png');
    const outPath = path.join(iconsDir, `icon${suffix}-${size}.png`);
    writeFileSync(outPath, buffer);
    console.log(`Created ${outPath}`);
  }
}
