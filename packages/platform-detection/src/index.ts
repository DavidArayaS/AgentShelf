// SPDX-License-Identifier: Apache-2.0
import type {
  DetectionResult,
  Platform,
  DetectionSignal,
} from '@agentshelf/connector-sdk';
interface Detector {
  platform: Platform;
  patterns: readonly RegExp[];
}
const detectors: readonly Detector[] = [
  {
    platform: 'woocommerce',
    patterns: [/woocommerce/i, /wp-content\/plugins\/woocommerce/i],
  },
  { platform: 'shopify', patterns: [/cdn\.shopify\.com/i, /Shopify\.shop/i] },
  { platform: 'wix', patterns: [/wixstatic\.com/i, /X-Wix-/i] },
  {
    platform: 'squarespace',
    patterns: [/static\d*\.squarespace\.com/i, /squarespace-cdn\.com/i],
  },
  { platform: 'magento', patterns: [/Magento_/i, /mage\/cookies/i] },
  {
    platform: 'bigcommerce',
    patterns: [/cdn\d*\.bigcommerce\.com/i, /bigcommerce/i],
  },
  { platform: 'vtex', patterns: [/vtexassets\.com/i, /vteximg\.com/i] },
  { platform: 'tiendanube', patterns: [/tiendanube/i, /nuvemshop/i] },
  { platform: 'prestashop', patterns: [/prestashop/i] },
  { platform: 'shopware', patterns: [/shopware/i, /sw-context-token/i] },
];
/** Confidence is an evidence heuristic, not a calibrated probability or certification. */
export function detectPlatform(
  html: string,
  headers: Readonly<Record<string, string>> = {},
): DetectionResult {
  const sample = html.slice(0, 2 * 1024 * 1024);
  const candidates = detectors
    .map((detector) => {
      const signals: DetectionSignal[] = [];
      for (const pattern of detector.patterns) {
        const match = sample.match(pattern);
        if (match) signals.push({ type: 'html', value: match[0] });
        for (const [key, value] of Object.entries(headers)) {
          const headerMatch = `${key}: ${value}`.match(pattern);
          if (headerMatch)
            signals.push({ type: 'header', value: headerMatch[0] });
        }
      }
      return {
        platform: detector.platform,
        confidence: Math.min(0.95, 0.6 + signals.length * 0.1),
        signals,
      };
    })
    .filter((candidate) => candidate.signals.length)
    .sort((a, b) => b.signals.length - a.signals.length);
  const best = candidates[0];
  if (best) return best;
  if (
    /application\/ld\+json/i.test(sample) &&
    /"@type"\s*:\s*"Product"/.test(sample)
  )
    return {
      platform: 'custom',
      confidence: 0.4,
      signals: [{ type: 'html', value: 'Schema.org Product JSON-LD' }],
    };
  return { platform: 'unknown', confidence: 0, signals: [] };
}
