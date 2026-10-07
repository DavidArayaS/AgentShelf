// SPDX-License-Identifier: Apache-2.0
import {
  CATEGORIES,
  type ValidationCategory,
  type ValidationResult,
} from '@agentshelf/validators';
export const SCORING_VERSION = '1.0.0';
export const DEFAULT_WEIGHTS: Readonly<Record<ValidationCategory, number>> =
  Object.freeze({
    discovery: 5,
    'machine-readability': 10,
    'product-identity': 10,
    'semantic-completeness': 10,
    pricing: 15,
    availability: 10,
    inventory: 5,
    variants: 5,
    images: 5,
    shipping: 8,
    returns: 7,
    reviews: 3,
    trust: 2,
    'protocol-readiness': 5,
  });
export interface Score {
  scoringVersion: string;
  overall: number;
  categories: Record<ValidationCategory, number>;
  counts: { pass: number; fail: number; unknown: number };
  weights: Record<ValidationCategory, number>;
}
export function scoreResults(
  results: readonly ValidationResult[],
  weights: Readonly<Record<ValidationCategory, number>> = DEFAULT_WEIGHTS,
): Score {
  let weighted = 0;
  let total = 0;
  const categories = {} as Record<ValidationCategory, number>;
  for (const category of CATEGORIES) {
    const weight = weights[category];
    if (!Number.isFinite(weight) || weight < 0)
      throw new Error(`Invalid scoring weight: ${category}`);
    const checks = results.filter((result) => result.category === category);
    const score = checks.length
      ? (100 * checks.filter((result) => result.status === 'pass').length) /
        checks.length
      : 0;
    categories[category] = Math.round(score);
    weighted += score * weight;
    total += weight;
  }
  if (!total) throw new Error('Scoring weights must have positive total');
  return {
    scoringVersion: SCORING_VERSION,
    overall: Math.round(weighted / total),
    categories,
    weights: { ...weights },
    counts: {
      pass: results.filter((r) => r.status === 'pass').length,
      fail: results.filter((r) => r.status === 'fail').length,
      unknown: results.filter((r) => r.status === 'unknown').length,
    },
  };
}
