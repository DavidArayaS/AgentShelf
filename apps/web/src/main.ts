// SPDX-License-Identifier: Apache-2.0
import { startWeb } from './index.js';
const app = await startWeb();
console.log(
  'AgentShelf local demo: http://127.0.0.1:3000\nChoose “Try demo store” for an offline scan.',
);
process.once('SIGINT', () => {
  void app.close();
});
process.once('SIGTERM', () => {
  void app.close();
});
