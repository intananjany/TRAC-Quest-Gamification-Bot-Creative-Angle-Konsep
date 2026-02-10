import test from 'node:test';
import assert from 'node:assert/strict';

import { AutopostManager } from '../src/prompt/autopost.js';

test('AutopostManager starts, runs immediately, repeats, and stops', async () => {
  let calls = 0;
  const mgr = new AutopostManager({
    runTool: async ({ tool, args }) => {
      calls += 1;
      return { type: 'ok', tool, args };
    },
  });

  const started = await mgr.start({
    name: 'job1',
    tool: 'intercomswap_rfq_post',
    interval_sec: 1,
    ttl_sec: 60,
    args: { channel: 'c', trade_id: 'rfq-1', btc_sats: 1, usdt_amount: '1' },
  });
  assert.equal(started.type, 'autopost_started');
  assert.equal(calls, 1, 'runs once immediately');

  // Wait for at least one interval tick.
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(calls >= 2, `expected at least 2 calls, got ${calls}`);

  const stopped = await mgr.stop({ name: 'job1' });
  assert.equal(stopped.type, 'autopost_stopped');

  const afterStop = calls;
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(calls, afterStop, 'no further calls after stop');
});

test('AutopostManager stops automatically on expiry and does not extend validity', async () => {
  let calls = 0;
  const seenValidUntil = new Set();
  const mgr = new AutopostManager({
    runTool: async ({ tool, args }) => {
      calls += 1;
      seenValidUntil.add(Number(args?.valid_until_unix));
      return { type: 'ok', tool, args };
    },
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const validUntil = nowSec + 10;

  const started = await mgr.start({
    name: 'job2',
    tool: 'intercomswap_rfq_post',
    interval_sec: 1,
    ttl_sec: 10,
    valid_until_unix: validUntil,
    args: { channel: 'c', trade_id: 'rfq-2', btc_sats: 1, usdt_amount: '1' },
  });
  assert.equal(started.type, 'autopost_started');
  assert.equal(started.valid_until_unix, validUntil);
  assert.equal(calls, 1, 'runs once immediately');

  // Wait long enough for expiry and the interval to observe it.
  await new Promise((r) => setTimeout(r, 11_500));
  const st = mgr.status();
  assert.ok(!st.jobs.find((j) => j.name === 'job2'), 'job removed after expiry');

  // Reposts must not extend validity; every run must share the same fixed valid_until_unix.
  assert.equal(seenValidUntil.size, 1);
  assert.ok(seenValidUntil.has(validUntil));

  const afterExpiry = calls;
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(calls, afterExpiry, 'no further calls after expiry stop');
});
