// Copies files the browser loads at run time from node_modules into public/ (not committed):
// pdf.js character maps for Korean PDFs, and the character recognizer with Korean + English data.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`missing ${from}; run npm install`);
  cpSync(from, to, { recursive: true });
};

copy('node_modules/pdfjs-dist/cmaps', 'public/cmaps');

mkdirSync('public/ocr/core', { recursive: true });
mkdirSync('public/ocr/lang', { recursive: true });
copy('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) copy(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `public/ocr/core/tesseract-core-${v}.wasm.js`);
for (const l of ['kor', 'eng']) copy(`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `public/ocr/lang/${l}.traineddata.gz`);
