// Copies pdf.js character maps so Korean PDFs that use predefined CJK encodings can be read.
import { cpSync, existsSync } from 'node:fs';
const from = 'node_modules/pdfjs-dist/cmaps';
if (existsSync(from)) cpSync(from, 'public/cmaps', { recursive: true });
