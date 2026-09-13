// Optional maintenance utility: regenerate web copies and narration handoff.
// Requires sharp (or pass the absolute path to a sharp installation as the first argument).
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const folder = path.dirname(fileURLToPath(import.meta.url));
const slides = JSON.parse(await readFile(path.join(folder, 'slides.json'), 'utf8'));
const runtime = path.resolve(folder, '../apps/web/static/introduction-comic');
await mkdir(runtime, { recursive: true });
await mkdir(path.join(runtime, 'audio'), { recursive: true });
for (let index = 0; index < slides.length - 1; index++) {
  await copyFile(path.resolve(folder, '../audio', `Track ${index + 1}.mp3`), path.join(runtime, 'audio', slides[index].id + '.mp3'));
}
await copyFile(path.resolve(folder, '../audio/music.mp3'), path.join(runtime, 'audio/music.mp3'));
for (const slide of slides.filter((s) => s.id !== '08-title')) {
  const source = path.join(folder, 'artwork', slide.id + '.png');
  try { await access(source); } catch { console.log('Missing artwork:', slide.id); continue; }
  const info = await sharp(source).webp({ quality: 88, effort: 6 }).toFile(path.join(runtime, slide.id + '.webp'));
  console.log(slide.id, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
}
const timing = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
let start = 0;
const sections = slides.map((slide, i) => {
  const end = start + slide.durationMs / 1000;
  const section = `## Page ${i + 1} — ${slide.title}\n\nSuggested timing: ${timing(start)}–${timing(end)} (${slide.durationMs / 1000} seconds).\n\n${slide.narration || '[No narration. Hold the MIMIC title, then transition to the existing main menu.]'}\n\nVisual: ${slide.alt}\n`;
  start = end;
  return section;
});
await writeFile(path.join(folder, 'Narration.md'), '# MIMIC — introduction narration\n\nThe user-supplied recordings are in ../audio/Track 1.mp3 through Track 7.mp3, in page order. ../audio/music.mp3 provides the background score. The title has music only.\n\nEach page stays for 14 seconds as requested, including the title. Total: ' + start + ' seconds, excluding pauses or buffering. The following text is the on-screen script; page names, timings, and visual directions are not spoken.\n\n' + sections.join('\n'));
await writeFile(path.join(folder, 'Narration.txt'), slides.map((s, i) => `PAGE ${i + 1} — ${s.title.toUpperCase()}\n${s.narration || '[Silent title card.]'}`).join('\n\n') + '\n');
