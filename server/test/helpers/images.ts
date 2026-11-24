/** 업로드 테스트용 최소 이미지 바이트(머리만 맞으면 된다. 서버는 디코드하지 않고 형식·가로세로만 읽는다). */

/** 1×1 PNG(실제로 열리는 파일). */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** SOI + APP0 + SOF0(가로 640, 세로 480) + EOI. */
export function jpeg(width = 640, height = 480): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2); // 길이
  sof[4] = 8; // 정밀도
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** RIFF/WEBP + VP8X(가로·세로 24비트 − 1). */
export function webp(width = 1200, height = 400): Buffer {
  const chunk = Buffer.alloc(18);
  chunk.write('VP8X', 0, 'ascii');
  chunk.writeUInt32LE(10, 4);
  chunk.writeUIntLE(width - 1, 12, 3);
  chunk.writeUIntLE(height - 1, 15, 3);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + chunk.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, chunk]);
}

/** multipart/form-data 본문(파일 필드 하나). */
export function multipart(
  bytes: Buffer,
  options: { field?: string; filename?: string; type?: string; boundary?: string } = {},
): { body: Buffer; contentType: string } {
  const boundary = options.boundary ?? `----sv${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${options.field ?? 'file'}"; filename="${options.filename ?? 'a.png'}"\r\n` +
      `Content-Type: ${options.type ?? 'image/png'}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, bytes, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}
