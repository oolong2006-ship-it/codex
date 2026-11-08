import { deflateSync, crc32 } from "node:zlib";

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/**
 * Minimal PNG encoder for generated wallet images: a rounded tile in `bg`
 * with a centred disc in `fg`. No native image dependencies.
 */
export function tilePng(size: number, bg: string, fg: string): Buffer {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const [br, bgc, bb] = parse(bg);
  const [fr, fgc, fb] = parse(fg);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = (size - 1) / 2;
  const radius = size * 0.22;
  const disc = size * 0.26;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const o = row + 1 + x * 4;
      // rounded-rect alpha
      const dx = Math.max(Math.abs(x - c) - (c - radius), 0);
      const dy = Math.max(Math.abs(y - c) - (c - radius), 0);
      const inside = Math.hypot(dx, dy) <= radius;
      const inDisc = Math.hypot(x - c, y - c) <= disc;
      const [r, g, b] = inDisc ? [fr, fgc, fb] : [br, bgc, bb];
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
