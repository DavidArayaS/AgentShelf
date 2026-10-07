// SPDX-License-Identifier: Apache-2.0
import { lintSource } from '@secretlint/core';
import { creator as aws } from '@secretlint/secretlint-rule-aws';
import { creator as github } from '@secretlint/secretlint-rule-github';
import { creator as npm } from '@secretlint/secretlint-rule-npm';
import { creator as openai } from '@secretlint/secretlint-rule-openai';
import { creator as privatekey } from '@secretlint/secretlint-rule-privatekey';

/** @param {string} content @param {string} filePath */
export async function scanSecrets(content, filePath) {
  const result = await lintSource({
    source: { content, filePath, contentType: 'text' },
    options: {
      maskSecrets: true,
      config: {
        rules: [
          { id: 'aws', rule: aws },
          { id: 'github', rule: github },
          { id: 'npm', rule: npm },
          { id: 'openai', rule: openai },
          { id: 'privatekey', rule: privatekey },
        ],
      },
    },
  });
  // Return identifiers/locations only: never expose secret-bearing content or messages.
  return result.messages.map((message) => ({
    ruleId: message.ruleId,
    line: message.loc.start.line,
  }));
}
