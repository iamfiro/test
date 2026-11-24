import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

type Json = Record<string, any>;

const spec = parse(
  readFileSync(fileURLToPath(new URL('../../docs/api/openapi.yaml', import.meta.url)), 'utf8'),
) as Json;

const ajv = new Ajv2020.default({ strict: false, allErrors: true });
(addFormats as unknown as { default: (a: unknown) => void }).default(ajv);
ajv.addSchema({ $id: 'openapi', components: spec.components });

function resolveRef(ref: string): Json {
  const parts = ref.replace(/^#\//, '').split('/');
  let node: any = spec;
  for (const part of parts) node = node[part];
  return node;
}

function responseSchema(path: string, method: string, status: number): Json {
  const op = spec.paths?.[path]?.[method];
  if (!op) throw new Error(`계약에 없는 동작: ${method.toUpperCase()} ${path}`);
  let response: Json | undefined = op.responses?.[String(status)];
  if (!response) throw new Error(`계약에 없는 응답: ${method.toUpperCase()} ${path} ${status}`);
  if (response.$ref) response = resolveRef(response.$ref);
  const schema = response?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`계약에 본문 스키마가 없는 응답: ${method.toUpperCase()} ${path} ${status}`);
  return schema;
}

/** 응답 본문이 OpenAPI의 해당 응답 스키마와 맞는지 검사한다. `path`는 계약의 경로 템플릿. */
export function expectContract(path: string, method: string, status: number, body: unknown): void {
  const schema = JSON.parse(
    JSON.stringify(responseSchema(path, method.toLowerCase(), status)).replaceAll('"#/components/', '"openapi#/components/'),
  );
  const validate = ajv.compile(schema);
  if (!validate(body)) {
    throw new Error(
      `계약 위반 ${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(body, null, 2)}`,
    );
  }
}
