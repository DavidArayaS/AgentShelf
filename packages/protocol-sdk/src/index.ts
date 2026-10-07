// SPDX-License-Identifier: Apache-2.0
export interface ProtocolSupport {
  protocol: string;
  version: string;
  supportedCapabilities: readonly string[];
  unsupportedCapabilities: readonly string[];
  implementationVersion: string;
  documentationUrl: string;
  sourceCommit: string;
}
export interface ProtocolOptions {
  currency?: string;
}
export interface ProtocolAdapter<Output> {
  support: ProtocolSupport;
  exportCatalog(
    catalog: unknown,
    options?: ProtocolOptions,
  ): Output | Promise<Output>;
}
export class ProtocolValidationError extends Error {
  readonly code = 'PROTOCOL_VALIDATION_ERROR';
}
export function selectedCurrency(
  currencies: Iterable<string>,
  requested?: string,
): string | undefined {
  const unique = [...new Set(currencies)].sort();
  if (requested) {
    if (unique.length && !unique.includes(requested))
      throw new ProtocolValidationError(`Currency ${requested} is unavailable`);
    return requested;
  }
  if (unique.length > 1)
    throw new ProtocolValidationError(
      'Catalog contains multiple currencies; select one explicitly',
    );
  return unique[0];
}
/** Convert an exact decimal to ISO 4217 minor units without rounding or float arithmetic. */
export function minorUnits(amount: string, currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency))
    throw new ProtocolValidationError('Invalid ISO currency code');
  let precision: number;
  try {
    precision =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch (cause) {
    throw new ProtocolValidationError(`Unsupported ISO currency: ${currency}`, {
      cause,
    });
  }
  const [whole = '0', fraction = ''] = amount.split('.');
  if (fraction.slice(precision).replaceAll('0', '') !== '')
    throw new ProtocolValidationError(
      `${amount} ${currency} exceeds ${precision} ISO minor-unit digits`,
    );
  const minor =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.slice(0, precision).padEnd(precision, '0') || '0');
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ProtocolValidationError(
      'Minor-unit price exceeds safe protocol integer range',
    );
  return Number(minor);
}
export function exactMajorUnit(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new ProtocolValidationError(
      'Expected a nonnegative safe minor-unit integer',
    );
  let digits: number;
  try {
    digits =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch (cause) {
    throw new ProtocolValidationError(`Unsupported ISO currency: ${currency}`, {
      cause,
    });
  }
  const value = BigInt(minor),
    base = 10n ** BigInt(digits);
  return digits
    ? `${value / base}.${(value % base).toString().padStart(digits, '0')}`
    : String(value);
}

export { createJsonSchemaValidator } from './json-schema.js';

export type {
  JsonSchemaValidator,
  JsonSchemaValidationError,
} from './json-schema.js';
