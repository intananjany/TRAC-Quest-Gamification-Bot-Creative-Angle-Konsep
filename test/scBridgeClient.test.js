import test from 'node:test';
import assert from 'node:assert/strict';

import { ScBridgeClient } from '../src/sc-bridge/client.js';

test('ScBridgeClient: rpc timeout rejects and resets connection', async () => {
  const OriginalWebSocket = globalThis.WebSocket;
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      this.readyState = 0;
      setTimeout(() => {
        this.readyState = 1;
        if (typeof this.onopen === 'function') this.onopen();
        if (typeof this.onmessage === 'function') {
          this.onmessage({ data: JSON.stringify({ type: 'hello', requiresAuth: false }) });
        }
      }, 0);
    }

    send(_data) {
      // Intentionally no reply to trigger rpc timeout.
    }

    close() {
      this.readyState = 3;
      if (typeof this.onclose === 'function') this.onclose();
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  try {
    const client = new ScBridgeClient({ url: 'ws://fake', token: null });
    client.rpcTimeoutMs = 20;
    await client.connect({ timeoutMs: 100 });
    await assert.rejects(client.info(), /rpc timeout/i);
    assert.equal(client.ws, null);
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
  }
});
