import CFB from 'cfb';
import { openCfb, ReadError } from './hwp';

type Cfb = ReturnType<typeof CFB.read>;

function streamByName(cfb: Cfb, name: string): Uint8Array | null {
  const i = cfb.FullPaths.findIndex(p => p.replace(/\/$/, '').split('/').pop() === name);
  return i >= 0 && cfb.FileIndex[i].content ? Uint8Array.from(cfb.FileIndex[i].content as ArrayLike<number>) : null;
}

/** Word 97-2003 (.doc): text pieces listed in the piece table (CLX) of the table stream. */
export function readDoc(u8: Uint8Array): string {
  const cfb = openCfb(u8);
  const wd = streamByName(cfb, 'WordDocument');
  if (!wd || wd.length < 0x1aa) throw new ReadError('error');
  const fib = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  const flags = fib.getUint16(0x0a, true);
  if (flags & 0x0100) throw new ReadError('password');
  const table = streamByName(cfb, flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new ReadError('error');
  const fcClx = fib.getUint32(0x1a2, true), lcbClx = fib.getUint32(0x1a6, true);
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let o = fcClx;
  const end = Math.min(fcClx + lcbClx, table.length);
  while (o < end && table[o] === 0x01) o += 3 + tv.getUint16(o + 1, true); // skip Prc entries
  if (table[o] !== 0x02) throw new ReadError('error');
  const lcb = tv.getUint32(o + 1, true);
  const plc = o + 5;
  const n = Math.floor((lcb - 4) / 12);
  let out = '';
  for (let i = 0; i < n; i++) {
    const cpStart = tv.getUint32(plc + i * 4, true), cpEnd = tv.getUint32(plc + (i + 1) * 4, true);
    const fcRaw = tv.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
    const len = cpEnd - cpStart;
    if (fcRaw & 0x40000000) {
      const start = (fcRaw & 0x3fffffff) / 2;
      out += new TextDecoder('windows-1252').decode(wd.subarray(start, start + len));
    } else {
      out += new TextDecoder('utf-16le').decode(wd.subarray(fcRaw, fcRaw + len * 2));
    }
  }
  return out
    .replace(/\x13[^\x13\x14\x15]*\x14([^\x15]*)\x15/g, '$1') // field: keep shown result
    .replace(/\x13[^\x15]*\x15/g, '')
    .replace(/\x07\x07/g, '\n').replace(/\x07/g, '\t').replace(/[\r\x0b\x0c]/g, '\n')
    .replace(/[\x00-\x08\x0e-\x1f]/g, '');
}

/** PowerPoint 97-2003 (.ppt): text atoms of slides and notes, leaving out master-slide placeholders. */
export function readPpt(u8: Uint8Array): string {
  const cfb = openCfb(u8);
  const doc = streamByName(cfb, 'PowerPoint Document');
  if (!doc) throw new ReadError('error');
  if (streamByName(cfb, 'EncryptedSummary')) throw new ReadError('password');
  const dv = new DataView(doc.buffer, doc.byteOffset, doc.byteLength);
  const SKIP = new Set([0x03f8, 0x0fc9, 0x0fd9]); // MainMaster, Handout, slide headers/footers
  const parts: string[] = [];
  const stack: number[] = [];
  let skipping = 0;
  let o = 0;
  while (o + 8 <= doc.length) {
    while (stack.length && o >= stack[stack.length - 1]) { stack.pop(); if (skipping > stack.length) skipping = 0; }
    const verInst = dv.getUint16(o, true), type = dv.getUint16(o + 2, true), len = dv.getUint32(o + 4, true);
    const body = o + 8;
    if ((verInst & 0xf) === 0xf) {
      stack.push(body + len);
      if (!skipping && SKIP.has(type)) skipping = stack.length;
      o = body;
      continue;
    }
    if (!skipping && body + len <= doc.length) {
      if (type === 0x0fa0) parts.push(new TextDecoder('utf-16le').decode(doc.subarray(body, body + len)));
      else if (type === 0x0fa8) parts.push(new TextDecoder('windows-1252').decode(doc.subarray(body, body + len)));
    }
    o = body + len;
  }
  // Lone '*' atoms are slide-number and date placeholders.
  return parts.filter(p => p.trim() !== '*').map(p => p.replace(/[\r\x0b]/g, '\n')).join('\n');
}
