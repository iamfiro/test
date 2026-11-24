/**
 * `multipart/form-data` 본문에서 이름이 `field`인 파일 하나를 꺼낸다(업로드 경로 하나만 쓰므로 스트리밍 파서
 * 의존성을 두지 않는다. 본문 크기는 경로의 bodyLimit이 먼저 막는다). 형식이 틀렸거나 그 필드가 없으면 null.
 */
export function parseMultipartFile(body: Buffer, contentType: string, field: string): Buffer | null {
  const match = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) return null;
  const delimiter = Buffer.from(`--${boundary}`);
  const CRLF = Buffer.from('\r\n');
  const HEADER_END = Buffer.from('\r\n\r\n');

  let found: Buffer | null = null;
  let start = body.indexOf(delimiter);
  if (start === -1) return null;
  for (;;) {
    const afterDelimiter = start + delimiter.length;
    if (body.subarray(afterDelimiter, afterDelimiter + 2).toString() === '--') break; // 끝 경계
    if (!body.subarray(afterDelimiter, afterDelimiter + 2).equals(CRLF)) return null;
    const headerStart = afterDelimiter + 2;
    const headerEnd = body.indexOf(HEADER_END, headerStart);
    if (headerEnd === -1) return null;
    const next = body.indexOf(Buffer.concat([CRLF, delimiter]), headerEnd + 4);
    if (next === -1) return null;
    const headers = body.subarray(headerStart, headerEnd).toString('utf8');
    const disposition = /^content-disposition:\s*form-data;(.*)$/im.exec(headers)?.[1] ?? '';
    const name = /\bname="([^"]*)"/i.exec(disposition)?.[1];
    if (name === field) {
      if (found) return null; // 같은 필드가 둘이면 어느 것인지 고르지 않는다
      found = body.subarray(headerEnd + 4, next);
    }
    start = next + 2;
  }
  return found;
}
