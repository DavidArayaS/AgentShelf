// SPDX-License-Identifier: Apache-2.0
import { createRequire } from 'node:module';
export interface JsonSchemaValidationError {
  instancePath: string;
  message?: string;
}
export interface JsonSchemaValidator {
  (value: unknown): boolean;
  errors?: JsonSchemaValidationError[] | null;
}
interface ValidatorEngine extends JsonSchemaValidator {
  errors?: JsonSchemaValidationError[] | null;
}
interface SchemaEngine {
  addSchema(schema: object): unknown;
  compile(schema: object): ValidatorEngine;
}
type SchemaEngineConstructor = new (options: {
  allErrors: true;
  strict: false;
}) => SchemaEngine;
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js').default as SchemaEngineConstructor;
const addFormats = require('ajv-formats').default as (
  instance: SchemaEngine,
) => unknown;
/** Validate fixed, vendored Draft 2020-12 protocol fixtures without runtime network fetches. */
export function createJsonSchemaValidator(
  referencedSchemas: readonly object[],
  targetSchema: object,
): JsonSchemaValidator {
  const engine = new Ajv2020({ allErrors: true, strict: false });
  addFormats(engine);
  for (const schema of referencedSchemas) engine.addSchema(schema);
  return engine.compile(targetSchema);
}
