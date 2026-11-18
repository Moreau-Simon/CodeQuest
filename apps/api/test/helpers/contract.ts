import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

/** Racine du dépôt, vue depuis `apps/api/test/helpers`. */
export const REPO_ROOT = path.resolve(__dirname, '../../../..');

export const OPENAPI_PATH = path.join(
  REPO_ROOT,
  'specs/001-codequest-platform/contracts/openapi.yaml'
);

const DOCUMENT_ID = 'https://codequest.local/openapi.json';
const JSON_CONTENT_TYPE = 'application~1json';

export type JsonObject = Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Operation {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}

let cachedDocument: JsonObject | undefined;
let cachedValidator: ContractValidator | undefined;

/** Charge et met en cache `contracts/openapi.yaml`. */
export function loadOpenApi(documentPath: string = OPENAPI_PATH): JsonObject {
  if (documentPath === OPENAPI_PATH && cachedDocument) return cachedDocument;

  const parsed = parse(readFileSync(documentPath, 'utf8')) as JsonObject;
  if (!parsed || typeof parsed !== 'object' || !parsed.paths) {
    throw new Error(`Contrat OpenAPI invalide : ${documentPath}`);
  }

  if (documentPath === OPENAPI_PATH) cachedDocument = parsed;
  return parsed;
}

/**
 * Ajv ne connaît pas le mot-clé `nullable` d'OpenAPI 3.0. On le convertit en
 * union de types JSON Schema avant de compiler, pour que `null` soit réellement
 * accepté (ex. `nextCursor`, `avatarUrl`).
 */
function normalizeSchemas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemas);
  if (!value || typeof value !== 'object') return value;

  const source = value as JsonObject;
  const normalized: JsonObject = {};
  for (const [key, child] of Object.entries(source)) {
    normalized[key] = normalizeSchemas(child);
  }

  if (source.nullable === true && typeof source.type === 'string') {
    normalized.type = [source.type, 'null'];
    delete normalized.nullable;
  }

  return normalized;
}

/** Échappe un segment de pointeur JSON (RFC 6901). */
export function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Validateur de contrat (T042) : toutes les réponses de l'API doivent être
 * conformes à `contracts/openapi.yaml`. Les `$ref` internes sont résolus par
 * Ajv à partir du document OpenAPI complet.
 */
export class ContractValidator {
  private readonly ajv: Ajv;
  private readonly document: JsonObject;

  constructor(document: JsonObject = loadOpenApi()) {
    this.document = document;
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
      validateFormats: true
    });
    addFormats(this.ajv);

    const schemaDocument = normalizeSchemas({
      ...document,
      $id: DOCUMENT_ID
    }) as JsonObject;
    this.ajv.addSchema(schemaDocument);
  }

  get paths(): string[] {
    return Object.keys((this.document.paths as JsonObject | undefined) ?? {});
  }

  /** Schéma JSON de réponse pour une opération et un statut donnés. */
  responseSchema(operation: Operation, status: number | string): JsonObject | undefined {
    const response = this.responseObject(operation, status);
    if (!response) return undefined;
    const content = response.content as JsonObject | undefined;
    const media = content?.['application/json'] as JsonObject | undefined;
    return media?.schema as JsonObject | undefined;
  }

  validateResponse(operation: Operation, status: number | string, body: unknown): ValidationResult {
    const schema = this.responseSchema(operation, status);
    // 204, 201 sans corps, etc. : rien à valider.
    if (!schema) return { valid: true, errors: [] };
    return this.validateSchema(
      schema,
      body,
      `response ${operation.method} ${operation.path} ${status}`
    );
  }

  validateRequestBody(operation: Operation, body: unknown): ValidationResult {
    const requestBody = this.operation(operation)?.requestBody as JsonObject | undefined;
    const content = requestBody?.content as JsonObject | undefined;
    const schema = (content?.['application/json'] as JsonObject | undefined)?.schema as
      JsonObject | undefined;
    if (!schema) return { valid: true, errors: [] };
    return this.validateSchema(schema, body, `request ${operation.method} ${operation.path}`);
  }

  /** Compile un schéma référencé par pointeur (`#/components/schemas/...`). */
  compilePointer(pointer: string): ValidateFunction {
    return this.ajv.compile({ $ref: `${DOCUMENT_ID}#${pointer}` });
  }

  /** Vérifie un schéma nommé de `components.schemas`. */
  validateNamedSchema(name: string, body: unknown): ValidationResult {
    const validate = this.compilePointer(`/components/schemas/${escapePointer(name)}`);
    const valid = validate(body) as boolean;
    return {
      valid,
      errors: valid ? [] : (validate.errors ?? []).map((error) => formatError(error))
    };
  }

  private validateSchema(schema: JsonObject, body: unknown, label: string): ValidationResult {
    const validate = this.ajv.compile(this.inlineRefs(schema) as Record<string, unknown>);
    const valid = validate(body) as boolean;
    if (valid) return { valid: true, errors: [] };
    return {
      valid: false,
      errors: (validate.errors ?? []).map((error) => `${label}${formatError(error)}`)
    };
  }

  /**
   * Résout les `$ref` internes avant compilation : Ajv ne peut pas résoudre
   * `#/components/...` depuis un sous-schéma sans base `$id`. Les cycles
   * éventuels conservent leur `$ref` (aucun schéma du contrat n'en a).
   */
  private inlineRefs(schema: unknown, seen: Set<string> = new Set()): unknown {
    if (Array.isArray(schema)) return schema.map((item) => this.inlineRefs(item, seen));
    if (!schema || typeof schema !== 'object') return schema;

    const source = schema as JsonObject;
    const ref = source.$ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return source;
      const target = this.resolvePointer(ref);
      if (target) {
        const nextSeen = new Set(seen).add(ref);
        const rest: JsonObject = { ...source };
        delete rest.$ref;
        return {
          ...(this.inlineRefs(target, nextSeen) as JsonObject),
          ...(this.inlineRefs(rest, nextSeen) as JsonObject)
        };
      }
      return source;
    }

    const result: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
      result[key] = this.inlineRefs(value, seen);
    }
    return result;
  }

  private resolvePointer(ref: string): unknown {
    if (!ref.startsWith('#/')) return undefined;
    let current: unknown = this.document;
    for (const raw of ref.slice(2).split('/')) {
      const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      current = (current as JsonObject | undefined)?.[segment];
    }
    return current;
  }

  private operation(operation: Operation): JsonObject | undefined {
    const paths = this.document.paths as JsonObject;
    const entry = paths[operation.path] as JsonObject | undefined;
    return entry?.[operation.method] as JsonObject | undefined;
  }

  private responseObject(operation: Operation, status: number | string): JsonObject | undefined {
    const responses = this.operation(operation)?.responses as JsonObject | undefined;
    if (!responses) return undefined;

    const key = String(status);
    const candidates = [key, key.replace(/\d$/g, 'XX'), 'default'];
    for (const candidate of candidates) {
      const response = responses[candidate] as JsonObject | undefined;
      if (response) return this.dereference(response);
    }
    return undefined;
  }

  /** `responses.Error` est un `$ref` : on le résout pour lire son contenu. */
  private dereference(value: JsonObject): JsonObject {
    const target = typeof value.$ref === 'string' ? this.resolvePointer(value.$ref) : undefined;
    return (target as JsonObject | undefined) ?? value;
  }
}

function formatError(error: { instancePath?: string; message?: string }): string {
  const where = error.instancePath || '/';
  return `${where} ${error.message ?? 'invalide'}`;
}

/** Validateur partagé par les suites de contrat (chargé une seule fois). */
export function contractValidator(): ContractValidator {
  if (!cachedValidator) cachedValidator = new ContractValidator();
  return cachedValidator;
}

/** Sucre syntaxique pour les tests de contrat. */
export function expectValidResponse(
  operation: Operation,
  status: number | string,
  body: unknown
): void {
  const result = contractValidator().validateResponse(operation, status, body);
  if (!result.valid) {
    throw new Error(
      `Réponse non conforme au contrat (${operation.method} ${operation.path} ${status}) :\n- ${result.errors.join('\n- ')}`
    );
  }
}

export { JSON_CONTENT_TYPE };
