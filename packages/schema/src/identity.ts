// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
/** Identity depends on its namespace/source key, never on price or wall-clock time. */
export function stableId(namespace: string, sourceKey: string): string {
  if (!namespace.trim() || !sourceKey.trim())
    throw new Error('Identity namespace and source key must not be empty');
  return createHash('sha256')
    .update(
      JSON.stringify([namespace.normalize('NFC'), sourceKey.normalize('NFC')]),
    )
    .digest('hex');
}
