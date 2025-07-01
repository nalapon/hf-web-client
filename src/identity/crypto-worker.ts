import { CryptoEngine } from "./crypto-engine";

/**
 * A thin wrapper around the CryptoEngine for use in browser environments.
 * It handles the message passing between the main thread and the engine.
 */
const engine = new CryptoEngine();

self.onmessage = async (event: MessageEvent) => {
  const { action, payload, engineType } = event.data;

  // Delegate the actual work to the engine.
  const result = await engine.performAction(action, payload, engineType);

  // Send the result back to the main thread.
  self.postMessage(result);
}; 