// SPDX-License-Identifier: Apache-2.0
/** Only exact, reviewed license expressions are accepted. Unknown expressions fail closed. */
export const approvedLicenses = new Set([
  'Apache-2.0',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
]);
/** @param {unknown} expression */
export function isApprovedLicense(expression) {
  if (typeof expression !== 'string') return false;
  // Accept only unambiguous OR choices composed entirely of approved identifiers.
  return expression
    .split(' OR ')
    .every((identifier) => approvedLicenses.has(identifier));
}
/** @param {unknown} report */
export function auditLicenses(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Invalid pnpm license report');
  }
  /** @type {{name: string, version: string, license: string, approved: boolean}[]} */
  const dependencies = [];
  for (const [license, entries] of Object.entries(report)) {
    if (!Array.isArray(entries)) throw new Error('Invalid license group');
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry.name !== 'string' ||
        !Array.isArray(entry.versions) ||
        entry.versions.length === 0 ||
        !entry.versions.every(
          /** @param {unknown} version */ (version) =>
            typeof version === 'string',
        )
      ) {
        throw new Error('Invalid dependency identity');
      }
      for (const version of entry.versions)
        dependencies.push({
          name: entry.name,
          version,
          license,
          approved: isApprovedLicense(license),
        });
    }
  }
  if (dependencies.length === 0) throw new Error('Empty license inventory');
  return dependencies.sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}
