// Copies the user guide into static/ so it is served at /MIMIC-User-Guide.pdf.
// The copy is git-ignored; docs/MIMIC-User-Guide.pdf stays the only tracked version.
import { copyFileSync, existsSync } from 'node:fs';

const source = new URL('../../../docs/MIMIC-User-Guide.pdf', import.meta.url);
const target = new URL('../static/MIMIC-User-Guide.pdf', import.meta.url);

if (existsSync(source)) copyFileSync(source, target);
else console.warn('copy-guide: docs/MIMIC-User-Guide.pdf not found, skipping');
