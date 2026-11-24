export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

/** 가로·세로 상한(WebP 최대 16383). 머리가 이상한 값이면 이미지로 보지 않는다. */
const MAX_SIDE = 16384;

function png(b: Buffer): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !signature.every((byte, i) => b[i] === byte)) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { type: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // 채움 바이트
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // 길이 없는 표지
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // 크기 정보(SOF) 전에 끝나거나 영상 데이터가 시작됨
    const length = b.readUInt16BE(i + 2);
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      return { type: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { type: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
    return {
      type: 'image/webp',
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}

/**
 * 보낸 사람이 적은 형식을 믿지 않고 파일 앞부분(매직 바이트)과 이미지 머리를 읽어 PNG·JPEG·WebP인지와 가로·세로를
 * 확인한다(디코드는 하지 않는다). 아니면 null.
 */
export function sniffImage(bytes: Buffer): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info) return null;
  const ok = (side: number) => Number.isInteger(side) && side >= 1 && side <= MAX_SIDE;
  return ok(info.width) && ok(info.height) ? info : null;
}
