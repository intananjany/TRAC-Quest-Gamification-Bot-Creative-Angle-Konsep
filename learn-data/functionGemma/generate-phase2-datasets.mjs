import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { INTERCOMSWAP_TOOLS } from '../../src/prompt/tools.js';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'learn-data', 'functionGemma');

const SRC_FILES = [
  path.join(OUT_DIR, 'intercomswap-tools-finetune.jsonl'),
  path.join(OUT_DIR, 'intercomswap-intent-routing-finetune.jsonl'),
  path.join(OUT_DIR, 'intercomswap-ops-intent-routing-finetune.jsonl'),
];

const OUT_TRAIN = path.join(OUT_DIR, 'intercomswap-finetune-train-v2.jsonl');
const OUT_EVAL = path.join(OUT_DIR, 'intercomswap-finetune-eval-v2.jsonl');
const OUT_MANIFEST = path.join(OUT_DIR, 'intercomswap-finetune-manifest-v2.json');

const byTool = new Map(INTERCOMSWAP_TOOLS.map((t) => [t.function.name, t]));
const TOOL_NAMES = INTERCOMSWAP_TOOLS.map((t) => t.function.name);

const BASE58 = [
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  '6pkWUm7K1xaFHDkQX4RAp4v3AXf7W3s9FawDSewvLURW',
  'tX3WFqfsXCcZykW416r9LDwnaT9uRc9Uq3sDrppUnJH',
  '7z7w8T4w99uULxQ4jDkSLW8VCpP9A2v1uTQW9kYnHidv',
  '11111111111111111111111111111111',
];

const NODE_ID_ACINQ = '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f';
const NODE_ID_1 = `02${'a'.repeat(64)}`;
const NODE_ID_2 = `03${'b'.repeat(64)}`;

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);
const HEX_D = 'd'.repeat(64);

const SAMPLE_BOLT11 =
  'lnbc10u1p5ce630pp5gglk6e39yfc625szvf6r0f68pthe2u5gxyk32qagrhurfnpx4ycqdygwfn8zttjvecj6vfhxucrsdpjxyurzde5xqkkzde4vyunscmy95cnwdes8q6ryd3hxycnzdpqf9h8getjvdhk6grnwashqgrjvecj6vfhxucrsdpjxyurzde5xqkkzde4vyunscmycqzzsxqrrsssp5fumz3pfmg3r9w5f4tgc6ey3k2tlleyys0cgneygh4x8fx5462s4s9qxpqysgqanr2qws7jwl8plyveue9h8jec7q08580xys2u3tcrjzewuxh40z3lp9m5ysg9gv2430k82q4kdpqc3t2yfwmtglq3k3u9363gm9u37qqypaxzl';

const SYSTEM_TOOLCALL =
  'You are functionGemma in IntercomSwap tool-calling mode. Always emit schema-valid tool calls. For invalid user payloads, explain what is invalid and do not call tools.';

const SYSTEM_TRADE_INTENT =
  'You are functionGemma in IntercomSwap prompt intent mode. Direction mapping is strict: sell BTC/sats means RFQ; buy BTC/sats means Offer. Never invert direction, even when user labels offer/rfq incorrectly. Convert BTC->sats and USDT->6-decimal atomic strings.';

const SYSTEM_OPS_INTENT =
  'You are functionGemma in IntercomSwap operations intent mode. Map natural-language operator requests to deterministic tools. If a request is ambiguous/unsafe or missing required values, ask clarification and do not execute.';

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function jsonHashByte(input) {
  return crypto.createHash('sha256').update(String(input)).digest()[0];
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function asAtomicUsdt(s) {
  const t = String(s).trim();
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  const fp = `${f}000000`.slice(0, 6);
  return `${BigInt(i) * 1_000_000n + BigInt(fp)}`;
}

function asSats(btcOrSats, unit = 'sats') {
  if (unit === 'sats') return Number.parseInt(String(btcOrSats), 10);
  const t = String(btcOrSats).trim();
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  const fp = `${f}00000000`.slice(0, 8);
  const out = BigInt(i) * 100_000_000n + BigInt(fp);
  if (out > BigInt(Number.MAX_SAFE_INTEGER) || out < 1n) return null;
  return Number(out);
}

function sampleFromPattern(pattern, key = '') {
  const p = String(pattern || '');
  const k = String(key || '').toLowerCase();
  if (p === '^[0-9a-fA-F]{64}$') return HEX_A;
  if (p === '^[0-9a-fA-F]{66}$') return NODE_ID_1;
  if (p === '^[1-9A-HJ-NP-Za-km-z]+$') return BASE58[0];
  if (p === '^[0-9]+$') {
    if (k.includes('usdt') || k === 'amount') return '670000';
    if (k.includes('lamports')) return '20000000';
    return '42';
  }
  if (p === '^[0-9]+(?:\\.[0-9]{1,8})?$') return '1.00000000';
  if (p === '^[^\\s]+$') return 'value_1';
  if (p.startsWith('^secret:')) return 'secret:abc123ef-001';
  if (p === '^[A-Za-z0-9._-]+$') return 'name_1';
  return null;
}

function sampleString(key = '', schema = {}, mode = 'typical') {
  const k = String(key || '').toLowerCase();
  const pattern = schema?.pattern || '';
  if (schema?.enum?.length) {
    return mode === 'alt' && schema.enum.length > 1 ? schema.enum[1] : schema.enum[0];
  }
  const fromPattern = sampleFromPattern(pattern, k);
  if (fromPattern) return fromPattern;

  if (k === 'channel') return mode === 'alt' ? 'swap:rfq-1771000001-abcd' : '0000intercomswapbtcusdt';
  if (k === 'via') return '0000intercomswapbtcusdt';
  if (k === 'swap_channel') return 'swap:rfq-1771000000-a1b2c3d4';
  if (k === 'trade_id') return mode === 'alt' ? 'rfq-1771000001-e5f6a7b8' : 'rfq-1771000000-a1b2c3d4';
  if (k === 'rfq_id' || k.includes('hash')) return HEX_B;
  if (k.includes('preimage')) return HEX_D;
  if (k === 'peer') return `${NODE_ID_ACINQ}@3.33.236.230:9735`;
  if (k === 'node_id') return NODE_ID_ACINQ;
  if (k === 'address') return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
  if (k === 'mint' || k.includes('sol_mint')) return BASE58[0];
  if (k.includes('recipient') || k.includes('refund') || k === 'to' || k.includes('owner') || k.includes('collector')) return BASE58[1];
  if (k === 'bolt11') return SAMPLE_BOLT11;
  if (k === 'label') return 'swap-invoice-001';
  if (k === 'description') return 'swap settlement invoice';
  if (k === 'name') return mode === 'alt' ? 'maker_beta' : 'maker_alpha';
  if (k === 'store' || k === 'peer_store') return mode === 'alt' ? 'taker_store' : 'maker_store';
  if (k === 'compose_file') return 'dev/lnd-regtest/docker-compose.yml';
  if (k === 'password_file') return 'onchain/lnd/mainnet/wallet.pw';
  if (k === 'db') return 'onchain/receipts/mainnet.sqlite';
  if (k === 'keypair_path' || k === 'out') return 'onchain/solana/keys/signer.json';
  if (k === 'log_path') return 'onchain/logs/peer-maker.log';
  if (k === 'welcome_text') return 'Welcome to the swap channel.';
  if (k === 'reason') return 'operator_requested';
  if (k === 'note') return 'status update';
  if (k === 'signal') return mode === 'alt' ? 'SIGINT' : 'SIGTERM';

  const max = Number.isInteger(schema?.maxLength) ? schema.maxLength : 64;
  const base = mode === 'alt' ? 'value_two' : 'value_one';
  return base.slice(0, max);
}

function sampleInt(key = '', schema = {}, mode = 'typical') {
  const k = String(key || '').toLowerCase();
  const min = Number.isInteger(schema?.minimum) ? schema.minimum : 0;
  const max = Number.isInteger(schema?.maximum) ? schema.maximum : min + 1000;

  if (k.includes('btc_sats')) return mode === 'min' ? Math.max(min, 1000) : Math.min(max, 250000);
  if (k.includes('amount_sats')) return mode === 'min' ? Math.max(min, 300001) : Math.min(max, 500000);
  if (k.includes('push_sats')) return mode === 'min' ? Math.max(min, 30000) : Math.min(max, 150000);
  if (k.includes('amount_msat')) return mode === 'min' ? Math.max(min, 1000000) : Math.min(max, 3000000);
  if (k.includes('interval_sec')) return mode === 'min' ? Math.max(min, 10) : Math.min(max, 60);
  if (k.includes('ttl_sec')) return mode === 'min' ? Math.max(min, 3600) : Math.min(max, 86400);
  if (k.includes('valid_for_sec')) return mode === 'min' ? Math.max(min, 600) : Math.min(max, 1800);
  if (k.includes('valid_until_unix') || k.includes('refund_after_unix')) return mode === 'min' ? Math.max(min, 1772000000) : Math.min(max, 1772600000);
  if (k.includes('fee_bps')) return mode === 'min' ? Math.max(min, 10) : Math.min(max, 25);
  if (k === 'sc_port') return 9334;
  if (k.includes('timeout_ms') || k.includes('wait_ms') || k.includes('ready_timeout_ms')) return mode === 'min' ? Math.max(min, 15000) : Math.min(max, 60000);
  if (k === 'rpc_port') return 8899;
  if (k === 'faucet_port') return 9900;
  if (k.includes('cu_limit')) return mode === 'min' ? Math.max(min, 200000) : Math.min(max, 400000);
  if (k.includes('cu_price')) return mode === 'min' ? Math.max(min, 5000) : Math.min(max, 25000);
  if (k.includes('offset')) return 0;
  if (k.includes('limit')) return mode === 'min' ? Math.max(min, 20) : Math.min(max, 100);
  if (k.includes('decimals')) return mode === 'min' ? Math.max(min, 6) : Math.min(max, 9);

  if (mode === 'min') return min;
  if (mode === 'max') return max;
  if (min === max) return min;
  return Math.max(min, Math.min(max, min + Math.floor((max - min) / 3)));
}

function chooseAnyOf(schema, mode = 'typical') {
  if (!Array.isArray(schema?.anyOf) || schema.anyOf.length === 0) return schema;
  if (mode === 'alt') {
    const obj = schema.anyOf.find((s) => s?.type === 'object');
    if (obj) return obj;
  }
  const str = schema.anyOf.find((s) => s?.type === 'string');
  if (str) return str;
  return schema.anyOf[0];
}

function sampleValue(key, schema, mode = 'typical') {
  if (!schema) return null;
  const chosen = chooseAnyOf(schema, mode);
  const t = Array.isArray(chosen?.type) ? chosen.type.find((x) => x !== 'null') : chosen?.type;

  if (chosen?.enum?.length) return mode === 'alt' && chosen.enum.length > 1 ? chosen.enum[1] : chosen.enum[0];

  if ((t === 'object' || (!t && isObject(chosen?.properties))) && isObject(chosen?.properties)) {
    const out = {};
    const required = Array.isArray(chosen?.required) ? chosen.required : [];
    const keys = mode === 'min' ? required : Object.keys(chosen.properties);
    for (const k of keys) out[k] = sampleValue(k, chosen.properties[k], mode);
    return out;
  }

  if (t === 'array') {
    const item = chosen?.items || { type: 'string' };
    const min = Number.isInteger(chosen?.minItems) ? chosen.minItems : 0;
    const max = Number.isInteger(chosen?.maxItems) ? chosen.maxItems : Math.max(2, min);
    const count = mode === 'min' ? Math.max(min, min > 0 ? 1 : 0) : Math.min(max, Math.max(min, 2));
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      const v = sampleValue(`${key}[${i}]`, item, mode === 'alt' && i === 1 ? 'min' : mode);
      if (String(key).toLowerCase().includes('channels')) {
        arr.push(i === 0 ? '0000intercomswapbtcusdt' : `swap:rfq-177100000${i}-abcd${i}`);
      } else {
        arr.push(v);
      }
    }
    return arr;
  }

  if (t === 'string' || !t) return sampleString(key, chosen, mode);
  if (t === 'integer' || t === 'number') return sampleInt(key, chosen, mode);
  if (t === 'boolean') return mode === 'min' ? false : true;
  return null;
}

function buildArgs(toolDef, mode = 'typical') {
  const schema = toolDef?.function?.parameters || { type: 'object', properties: {}, required: [] };
  const args = sampleValue('root', schema, mode);
  return postProcess(toolDef.function.name, args, mode);
}

function postProcess(toolName, args, mode = 'typical') {
  const out = deepClone(args || {});
  if (toolName === 'intercomswap_offer_post') {
    out.channels = Array.isArray(out.channels) && out.channels.length ? out.channels : ['0000intercomswapbtcusdt'];
    out.name = out.name || 'maker:prompt';
    out.offers = Array.isArray(out.offers) && out.offers.length ? out.offers : [{ btc_sats: 1000, usdt_amount: '120000' }];
    if (out.valid_until_unix && out.ttl_sec) delete out.valid_until_unix;
    out.ttl_sec = out.ttl_sec || 86400;
    out.offers = out.offers.map((o, i) => {
      const row = isObject(o) ? { ...o } : {};
      row.btc_sats = Number.isInteger(row.btc_sats) && row.btc_sats > 0 ? row.btc_sats : (i + 1) * 1000;
      row.usdt_amount = typeof row.usdt_amount === 'string' && /^[0-9]+$/.test(row.usdt_amount) ? row.usdt_amount : `${(i + 1) * 120000}`;
      return row;
    });
  }
  if (toolName === 'intercomswap_rfq_post') {
    out.channel = out.channel || '0000intercomswapbtcusdt';
    out.trade_id = out.trade_id || 'rfq-1771000000-a1b2c3d4';
    out.btc_sats = out.btc_sats || 1000;
    out.usdt_amount = typeof out.usdt_amount === 'string' && /^[0-9]+$/.test(out.usdt_amount) ? out.usdt_amount : '120000';
  }
  if (toolName === 'intercomswap_quote_post' || toolName === 'intercomswap_quote_post_from_rfq') {
    if (!out.valid_for_sec && !out.valid_until_unix) out.valid_for_sec = 600;
    if (out.valid_for_sec && out.valid_until_unix) delete out.valid_until_unix;
  }
  if (toolName === 'intercomswap_autopost_start') {
    if (mode === 'alt') {
      return {
        name: `rfq_prompt_${Date.now()}`,
        tool: 'intercomswap_rfq_post',
        interval_sec: 60,
        ttl_sec: 3600,
        args: {
          channel: '0000intercomswapbtcusdt',
          trade_id: `rfq-${Date.now()}-alt`,
          btc_sats: 1002,
          usdt_amount: '330000',
        },
      };
    }
    return {
      name: `offer_prompt_${Date.now()}`,
      tool: 'intercomswap_offer_post',
      interval_sec: 10,
      ttl_sec: 86400,
      args: {
        channels: ['0000intercomswapbtcusdt'],
        name: 'maker:prompt',
        rfq_channels: ['0000intercomswapbtcusdt'],
        offers: [{ btc_sats: 1000, usdt_amount: '120000' }],
      },
    };
  }
  if (toolName === 'intercomswap_ln_fundchannel') {
    out.peer = out.peer || `${NODE_ID_ACINQ}@3.33.236.230:9735`;
    out.amount_sats = out.amount_sats || 300001;
    if (out.push_sats === undefined) out.push_sats = 30000;
  }
  if (toolName.includes('invoice') && !toolName.includes('decode') && !toolName.includes('swap_sol')) {
    if (toolName === 'intercomswap_ln_invoice_create') {
      out.amount_msat = out.amount_msat || 1000000;
      out.label = out.label || 'swap-invoice';
      out.description = out.description || 'swap settlement';
    }
  }
  if (toolName.includes('sol_escrow') || toolName.includes('swap_sol_escrow_init_and_post')) {
    out.payment_hash_hex = out.payment_hash_hex || HEX_C;
    out.mint = out.mint || BASE58[0];
    out.amount = out.amount || '670000';
    out.recipient = out.recipient || BASE58[1];
    out.refund = out.refund || BASE58[2];
    out.refund_after_unix = out.refund_after_unix || 1772100000;
    if ('trade_fee_collector' in (toolDefShape(toolName) || {})) out.trade_fee_collector = out.trade_fee_collector || BASE58[2];
  }
  if (toolName === 'intercomswap_sol_transfer_sol' && out.lamports && typeof out.lamports !== 'string') out.lamports = `${out.lamports}`;
  if (toolName === 'intercomswap_sol_airdrop' && out.lamports && typeof out.lamports !== 'string') out.lamports = `${out.lamports}`;
  if (toolName === 'intercomswap_sol_token_transfer' && out.amount && typeof out.amount !== 'string') out.amount = `${out.amount}`;
  return out;
}

function toolDefShape(name) {
  return byTool.get(name)?.function?.parameters?.properties || null;
}

function toolCall(id, name, args) {
  return {
    role: 'assistant',
    tool_calls: [
      {
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

function toolResultMsg(id, name, result) {
  return {
    role: 'tool',
    tool_call_id: id,
    name,
    content: JSON.stringify(result),
  };
}

function classify(toolName) {
  if (toolName.startsWith('intercomswap_sc_')) return 'sc';
  if (toolName.startsWith('intercomswap_peer_')) return 'peer';
  if (toolName.startsWith('intercomswap_tradeauto_')) return 'tradeauto';
  if (toolName.startsWith('intercomswap_rfqbot_')) return 'rfqbot';
  if (toolName.startsWith('intercomswap_autopost_')) return 'autopost';
  if (toolName.startsWith('intercomswap_ln_') || toolName.includes('_ln_')) return 'ln';
  if (toolName.startsWith('intercomswap_sol_') || toolName.includes('_sol_')) return 'sol';
  if (toolName.startsWith('intercomswap_receipts_') || toolName.startsWith('intercomswap_swaprecover_')) return 'receipts';
  if (toolName.startsWith('intercomswap_stack_')) return 'stack';
  if (toolName.includes('offer') || toolName.includes('rfq') || toolName.includes('quote') || toolName.includes('terms') || toolName.includes('swap_invite')) return 'swap';
  if (toolName.startsWith('intercomswap_app_') || toolName.startsWith('intercomswap_env_')) return 'meta';
  return 'generic';
}

function successResult(toolName, args, variant = 'ok') {
  const cat = classify(toolName);
  if (cat === 'meta') {
    if (toolName === 'intercomswap_app_info') {
      return {
        ok: true,
        app_tag: 'intercomswap',
        app_hash: '9f2c4d6e8a1b3c5d7e9f00112233445566778899aabbccddeeff001122334455',
        solana_program_id: '4RS6xpspM1V2K7FKSqeSH6VVaZbtzHzhJqacwrz8gJrF',
      };
    }
    return {
      ok: true,
      ln_network: 'mainnet',
      solana_rpc: 'https://api.mainnet-beta.solana.com',
      receipts_db: 'onchain/receipts/mainnet.sqlite',
    };
  }
  if (cat === 'stack') {
    return {
      ok: true,
      action: toolName.endsWith('_start') ? 'started' : 'stopped',
      peer: args?.peer_name || 'maker_main',
      sc_port: args?.sc_port || 9334,
      ln: variant === 'alt' ? 'already_ready' : 'ready',
      solana: variant === 'alt' ? 'already_ready' : 'ready',
    };
  }
  if (cat === 'sc') {
    if (toolName.endsWith('_wait_envelope')) {
      return {
        ok: true,
        channel: args?.channels?.[0] || '0000intercomswapbtcusdt',
        envelope_kind: args?.kinds?.[0] || 'swap.rfq',
        handle: 'secret:evt-001',
      };
    }
    if (toolName.endsWith('_subscribe')) return { ok: true, subscribed: args?.channels || [] };
    if (toolName.endsWith('_price_get')) return { ok: true, pair: 'BTC/USDT', price: variant === 'alt' ? 67550.22 : 67000.0 };
    return {
      ok: true,
      action: toolName.replace('intercomswap_sc_', ''),
      channel: args?.channel || args?.channels?.[0] || '0000intercomswapbtcusdt',
    };
  }
  if (cat === 'peer' || cat === 'rfqbot' || cat === 'autopost') {
    if (toolName.endsWith('_status')) {
      return {
        ok: true,
        instances: [{ name: args?.name || 'default', status: 'running', pid: variant === 'alt' ? 31002 : 31001 }],
      };
    }
    if (toolName === 'intercomswap_autopost_start') {
      return {
        type: 'autopost_started',
        name: args?.name || 'job',
        tool: args?.tool || 'intercomswap_offer_post',
        interval_sec: args?.interval_sec || 10,
        valid_until_unix: 1772000000,
        first: { ok: true, posted: true },
      };
    }
    if (toolName === 'intercomswap_autopost_stop') return { type: 'autopost_stopped', name: args?.name || 'job', ok: true };
    return { ok: true, name: args?.name || 'default', status: toolName.includes('stop') ? 'stopped' : 'running' };
  }
  if (cat === 'tradeauto') {
    if (toolName.endsWith('_status')) {
      return {
        ok: true,
        running: true,
        channels: ['0000intercomswapbtcusdt'],
        trace_enabled: variant === 'alt',
        active_trades: variant === 'alt' ? 3 : 1,
      };
    }
    if (toolName.endsWith('_trace_set')) return { ok: true, trace_enabled: Boolean(args?.trace_enabled) };
    return { ok: true, running: !toolName.endsWith('_stop') };
  }
  if (cat === 'swap') {
    return {
      ok: true,
      channel: args?.channel || '0000intercomswapbtcusdt',
      trade_id: args?.trade_id || 'rfq-1771000000-a1b2c3d4',
      envelope_id: crypto.createHash('sha256').update(`${toolName}:${variant}`).digest('hex'),
    };
  }
  if (cat === 'ln') {
    if (toolName.includes('decodepay')) {
      return { ok: true, destination: NODE_ID_ACINQ, amount_sat: 1000, payment_hash_hex: HEX_C, route_hints: variant === 'alt' ? 1 : 0 };
    }
    if (toolName.includes('invoice_create')) return { ok: true, bolt11: SAMPLE_BOLT11, payment_hash_hex: HEX_C };
    if (toolName.includes('pay')) return { ok: true, payment_hash_hex: HEX_C, status: 'SUCCEEDED', preimage_hex: HEX_D, fee_sat: variant === 'alt' ? 2 : 1 };
    if (toolName.includes('listchannels')) {
      return {
        ok: true,
        channels: [
          {
            channel_point: 'f51acb9df477a98b1e624e89a3f8e36a86f46f6f8baf3deee302a22cd76bb6b2:1',
            active: true,
            private: false,
            capacity_sats: 442491,
            local_sats: 141547,
            remote_sats: 300000,
          },
        ],
      };
    }
    if (toolName.includes('listfunds')) return { ok: true, onchain_sats: variant === 'alt' ? 1500000 : 900000, outbound_sats: 400707, inbound_sats: 97386 };
    return { ok: true, impl: 'lnd', backend: 'cli' };
  }
  if (cat === 'sol') {
    if (toolName.endsWith('_balance') && !toolName.endsWith('_token_balance')) return { ok: true, lamports: variant === 'alt' ? '120000000' : '50000000' };
    if (toolName.endsWith('_token_balance')) return { ok: true, amount: variant === 'alt' ? '35000000' : '120240', decimals: 6 };
    if (toolName.endsWith('_escrow_get')) {
      return {
        ok: true,
        escrow: {
          payment_hash_hex: HEX_C,
          mint: BASE58[0],
          amount: '670000',
          recipient: BASE58[1],
          refund: BASE58[2],
          refund_after_unix: 1772100000,
        },
      };
    }
    if (toolName.endsWith('_config_get')) return { ok: true, platform_fee_bps: 10, fee_collector: BASE58[2] };
    if (toolName.endsWith('_trade_config_get')) return { ok: true, fee_bps: 10, fee_collector: args?.fee_collector || BASE58[2] };
    return { ok: true, signature: 'LSrXboijW2eeH6T31d8Mt7JseqsPn4j7j8a9yZ4NxmawAmSHgRUbv7F3rH2ePuxVEVzuYmA9wmMJregP9Qc6kWQ' };
  }
  if (cat === 'receipts') {
    if (toolName.endsWith('_show')) return { ok: true, receipt: { trade_id: args?.trade_id || 'rfq-1771000000-a1b2c3d4', state: variant === 'alt' ? 'claimed' : 'ln_paid' } };
    return {
      ok: true,
      total: 2,
      items: [
        { trade_id: 'rfq-1771000000-a1b2c3d4', state: 'accepted' },
        { trade_id: 'rfq-1771000001-e5f6a7b8', state: 'claimed' },
      ],
    };
  }
  return { ok: true };
}

function runtimeFailure(toolName) {
  const cat = classify(toolName);
  if (cat === 'stack') return { ok: false, code: 'STACK_BOOTSTRAP_FAILED', error: 'stack_start failed: unable to reach SC bridge port within timeout' };
  if (cat === 'sc') return { ok: false, code: 'SC_NOT_JOINED', error: 'channel not joined locally' };
  if (cat === 'peer') return { ok: false, code: 'PEER_ALREADY_EXISTS', error: 'peer start failed: name already exists' };
  if (cat === 'rfqbot') return { ok: false, code: 'RFQBOT_ALREADY_EXISTS', error: 'rfq bot already running' };
  if (cat === 'autopost') return { ok: false, code: 'AUTOPOST_DUPLICATE', error: 'autopost_start: name already exists' };
  if (cat === 'tradeauto') return { ok: false, code: 'TRADEAUTO_BUSY', error: 'tradeauto worker already running' };
  if (cat === 'swap') {
    if (toolName.includes('quote_post')) return { ok: false, code: 'FEE_LIMIT_EXCEEDED', error: 'on-chain trade fee exceeds RFQ max_trade_fee_bps' };
    if (toolName.includes('terms_post')) return { ok: false, code: 'MISSING_USDT_MINT', error: 'terms_post: missing usdt_mint' };
    return { ok: false, code: 'LISTING_NOT_ACTIONABLE', error: 'listing expired, filled, or locked' };
  }
  if (cat === 'ln') {
    if (toolName.includes('fundchannel')) {
      return {
        ok: false,
        code: 'LN_INSUFFICIENT_FUNDS',
        error: '[lncli] rpc error: code = Unknown desc = funder balance too small (-962000) with fee=303 sat, minimum=708 sat required',
      };
    }
    return {
      ok: false,
      code: 'LN_NO_ROUTE',
      error: '[lncli] FAILED: {"status":"FAILED","failure_reason":"FAILURE_REASON_NO_ROUTE"}',
    };
  }
  if (cat === 'sol') {
    return {
      ok: false,
      code: 'SOL_INSUFFICIENT_LAMPORTS',
      error: 'Simulation failed: Transfer: insufficient lamports 1943865, need 2721360',
    };
  }
  if (cat === 'receipts') return { ok: false, code: 'RECEIPT_NOT_FOUND', error: 'receipt not found for requested trade_id' };
  return { ok: false, code: 'RUNTIME_ERROR', error: `${toolName} runtime failure` };
}

function invalidVariant(toolDef, goodArgs, style = 'missing_required') {
  const schema = toolDef?.function?.parameters || {};
  const props = isObject(schema?.properties) ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const bad = deepClone(goodArgs || {});

  if (style === 'unexpected_argument') {
    bad.unexpected_field = 'bad';
    return {
      args: bad,
      reason: `unexpected argument "unexpected_field" is not allowed`,
    };
  }

  if (Object.keys(props).length === 0) {
    bad.anything = true;
    return {
      args: bad,
      reason: 'this tool accepts no arguments',
    };
  }

  const key = required[0] || Object.keys(props)[0];
  const prop = props[key] || {};

  if (style === 'missing_required' && required.length > 0) {
    const miss = required[0];
    const copy = deepClone(bad);
    delete copy[miss];
    return {
      args: copy,
      reason: `${miss} is required`,
    };
  }

  if (style === 'wrong_type') {
    bad[key] = 'invalid_type';
    const t = Array.isArray(prop.type) ? prop.type[0] : prop.type;
    if (t === 'string') bad[key] = 123;
    if (t === 'integer' || t === 'number') bad[key] = 'not-an-integer';
    if (t === 'boolean') bad[key] = 'true';
    if (t === 'array') bad[key] = 'not-an-array';
    if (t === 'object') bad[key] = 'not-an-object';
    return {
      args: bad,
      reason: `${key} has invalid type`,
    };
  }

  bad[key] = '';
  return {
    args: bad,
    reason: `${key} is invalid`,
  };
}

function makeRecord({ id, source, scenario, tools, messages }) {
  return {
    id,
    source,
    scenario,
    tools,
    messages,
  };
}

function addToolSamples(records) {
  for (const toolName of TOOL_NAMES) {
    const t = byTool.get(toolName);
    if (!t) continue;
    const tools = [t];
    const minArgs = buildArgs(t, 'min');
    const typArgs = buildArgs(t, 'typical');
    const altArgs = buildArgs(t, 'alt');

    const call1 = `call_${toolName}_min`;
    records.push(
      makeRecord({
        id: `phase2_${toolName}_valid_min`,
        source: 'phase2_tooling',
        scenario: 'tool_valid_min',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} with minimal valid arguments: ${JSON.stringify(minArgs)}` },
          toolCall(call1, toolName, minArgs),
          toolResultMsg(call1, toolName, successResult(toolName, minArgs, 'ok')),
          { role: 'assistant', content: `${toolName} completed successfully.` },
        ],
      })
    );

    const call2 = `call_${toolName}_typ`;
    records.push(
      makeRecord({
        id: `phase2_${toolName}_valid_typical`,
        source: 'phase2_tooling',
        scenario: 'tool_valid_typical',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} with a typical argument set: ${JSON.stringify(typArgs)}` },
          toolCall(call2, toolName, typArgs),
          toolResultMsg(call2, toolName, successResult(toolName, typArgs, 'ok')),
          { role: 'assistant', content: `${toolName} completed with the typical profile.` },
        ],
      })
    );

    const call3 = `call_${toolName}_alt`;
    records.push(
      makeRecord({
        id: `phase2_${toolName}_valid_alt`,
        source: 'phase2_tooling',
        scenario: 'tool_valid_alternative',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} using an alternative/edge argument shape: ${JSON.stringify(altArgs)}` },
          toolCall(call3, toolName, altArgs),
          toolResultMsg(call3, toolName, successResult(toolName, altArgs, 'alt')),
          { role: 'assistant', content: `${toolName} succeeded with alternative arguments.` },
        ],
      })
    );

    const call4 = `call_${toolName}_fail`;
    records.push(
      makeRecord({
        id: `phase2_${toolName}_runtime_fail`,
        source: 'phase2_tooling',
        scenario: 'tool_runtime_failure',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} now with this valid payload and report backend failures if they happen: ${JSON.stringify(typArgs)}` },
          toolCall(call4, toolName, typArgs),
          toolResultMsg(call4, toolName, runtimeFailure(toolName)),
          { role: 'assistant', content: `${toolName} failed at runtime. Keep the error verbatim and suggest prerequisite fixes before retry.` },
        ],
      })
    );

    const invMissing = invalidVariant(t, typArgs, 'missing_required');
    records.push(
      makeRecord({
        id: `phase2_${toolName}_invalid_missing`,
        source: 'phase2_tooling',
        scenario: 'tool_invalid_missing_required',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} with this payload: ${JSON.stringify(invMissing.args)}` },
          { role: 'assistant', content: `Cannot call ${toolName}. ${invMissing.reason}. Provide corrected arguments.` },
        ],
      })
    );

    const invType = invalidVariant(t, typArgs, 'wrong_type');
    records.push(
      makeRecord({
        id: `phase2_${toolName}_invalid_type`,
        source: 'phase2_tooling',
        scenario: 'tool_invalid_wrong_type',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} with this payload: ${JSON.stringify(invType.args)}` },
          { role: 'assistant', content: `Cannot call ${toolName}. ${invType.reason}. Fix type/shape and retry.` },
        ],
      })
    );

    const invUnexpected = invalidVariant(t, typArgs, 'unexpected_argument');
    records.push(
      makeRecord({
        id: `phase2_${toolName}_invalid_unexpected`,
        source: 'phase2_tooling',
        scenario: 'tool_invalid_unexpected_argument',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TOOLCALL },
          { role: 'user', content: `Run ${toolName} with this payload: ${JSON.stringify(invUnexpected.args)}` },
          { role: 'assistant', content: `Cannot call ${toolName}. ${invUnexpected.reason}.` },
        ],
      })
    );
  }
}

function addTradeIntentSamples(records) {
  const tools = [
    byTool.get('intercomswap_autopost_start'),
    byTool.get('intercomswap_offer_post'),
    byTool.get('intercomswap_rfq_post'),
    byTool.get('intercomswap_autopost_stop'),
  ].filter(Boolean);

  const sellVerbs = ['sell', 'offload', 'list', 'quote out'];
  const buyVerbs = ['buy', 'acquire', 'bid for', 'pick up'];
  const amountKinds = [
    { label: '1000 sats', sats: 1000 },
    { label: '2500 satoshis', sats: 2500 },
    { label: '0.001 btc', sats: asSats('0.001', 'btc') },
    { label: '0.01 btc', sats: asSats('0.01', 'btc') },
    { label: '0.1 btc', sats: asSats('0.1', 'btc') },
  ];
  const usdtVals = ['0.12', '0.67', '1.75', '30', '6700'];
  const intervals = [
    { text: 'every 5s', sec: 5 },
    { text: 'every 10s', sec: 10 },
    { text: 'every 30 sec', sec: 30 },
    { text: 'every 60 seconds', sec: 60 },
    { text: 'every 2 minutes', sec: 120 },
  ];
  const ttls = [
    { text: 'for 1 hour', sec: 3600 },
    { text: 'for 10h', sec: 36000 },
    { text: 'for a day', sec: 86400 },
    { text: 'for 2 days', sec: 172800 },
    { text: 'valid 1 day', sec: 86400 },
  ];
  const wrappers = [
    (x) => x,
    (x) => `please ${x}`,
    (x) => `can you ${x}`,
    (x) => `${x}.`,
    (x) => `${x} now`,
  ];

  let idx = 0;

  for (const side of ['sell', 'buy']) {
    const verbs = side === 'sell' ? sellVerbs : buyVerbs;
    for (const verb of verbs) {
      for (const amt of amountKinds) {
        for (const usdt of usdtVals) {
          for (const intv of intervals) {
            for (const ttl of ttls) {
              const w = wrappers[idx % wrappers.length];
              idx += 1;
              const prompt = w(`${verb} ${amt.label} for ${usdt} usdt ${intv.text} ${ttl.text}`);
              const usdtAtomic = asAtomicUsdt(usdt);
              const nowMs = 1771090273648 + idx * 1111;
              const rand = crypto.createHash('sha256').update(`${prompt}:${idx}`).digest('hex').slice(0, 8);
              const callId = `call_trade_${idx}`;
              const nested = side === 'sell' ? 'intercomswap_rfq_post' : 'intercomswap_offer_post';
              const args =
                side === 'sell'
                  ? {
                      name: `rfq_prompt_${rand}_${nowMs}`,
                      tool: nested,
                      interval_sec: intv.sec,
                      ttl_sec: ttl.sec,
                      args: {
                        channel: '0000intercomswapbtcusdt',
                        trade_id: `rfq-${Math.floor(nowMs / 1000)}-${rand}`,
                        btc_sats: amt.sats,
                        usdt_amount: usdtAtomic,
                      },
                    }
                  : {
                      name: `offer_prompt_${rand}_${nowMs}`,
                      tool: nested,
                      interval_sec: intv.sec,
                      ttl_sec: ttl.sec,
                      args: {
                        channels: ['0000intercomswapbtcusdt'],
                        name: 'maker:prompt',
                        rfq_channels: ['0000intercomswapbtcusdt'],
                        offers: [{ btc_sats: amt.sats, usdt_amount: usdtAtomic }],
                      },
                    };
              records.push(
                makeRecord({
                  id: `phase2_trade_intent_auto_${idx}`,
                  source: 'phase2_trade_intent',
                  scenario: 'trade_autopost_directional',
                  tools,
                  messages: [
                    { role: 'system', content: SYSTEM_TRADE_INTENT },
                    { role: 'user', content: prompt },
                    toolCall(callId, 'intercomswap_autopost_start', args),
                    toolResultMsg(callId, 'intercomswap_autopost_start', {
                      type: 'autopost_started',
                      name: args.name,
                      tool: args.tool,
                      interval_sec: args.interval_sec,
                      valid_until_unix: Math.floor(nowMs / 1000) + ttl.sec,
                      first: { ok: true, posted: true },
                    }),
                    {
                      role: 'assistant',
                      content:
                        side === 'sell'
                          ? 'Started repeating BTC-sell RFQ autopost with converted amounts.'
                          : 'Started repeating BTC-buy Offer autopost with converted amounts.',
                    },
                  ],
                })
              );
              if (idx >= 2200) break;
            }
            if (idx >= 2200) break;
          }
          if (idx >= 2200) break;
        }
        if (idx >= 2200) break;
      }
      if (idx >= 2200) break;
    }
    if (idx >= 2200) break;
  }

  // Wrong-label but semantic direction should win.
  const conflicting = [
    {
      prompt: 'create rfq to buy 1000 sats for 0.12 usdt every 10s for 1 day',
      side: 'buy',
      sats: 1000,
      usdt: '0.12',
      interval: 10,
      ttl: 86400,
    },
    {
      prompt: 'create offer to sell 1000 sats for 0.12 usdt every 10s for 1 day',
      side: 'sell',
      sats: 1000,
      usdt: '0.12',
      interval: 10,
      ttl: 86400,
    },
  ];
  for (let j = 0; j < 300; j += 1) {
    const c = conflicting[j % conflicting.length];
    const callId = `call_conflict_${j}`;
    const nowMs = 1772090273648 + j * 1000;
    const rand = crypto.createHash('sha256').update(`${c.prompt}:${j}`).digest('hex').slice(0, 8);
    const args =
      c.side === 'sell'
        ? {
            name: `rfq_prompt_${rand}_${nowMs}`,
            tool: 'intercomswap_rfq_post',
            interval_sec: c.interval,
            ttl_sec: c.ttl,
            args: {
              channel: '0000intercomswapbtcusdt',
              trade_id: `rfq-${Math.floor(nowMs / 1000)}-${rand}`,
              btc_sats: c.sats,
              usdt_amount: asAtomicUsdt(c.usdt),
            },
          }
        : {
            name: `offer_prompt_${rand}_${nowMs}`,
            tool: 'intercomswap_offer_post',
            interval_sec: c.interval,
            ttl_sec: c.ttl,
            args: {
              channels: ['0000intercomswapbtcusdt'],
              name: 'maker:prompt',
              rfq_channels: ['0000intercomswapbtcusdt'],
              offers: [{ btc_sats: c.sats, usdt_amount: asAtomicUsdt(c.usdt) }],
            },
          };
    records.push(
      makeRecord({
        id: `phase2_trade_intent_conflict_${j}`,
        source: 'phase2_trade_intent',
        scenario: 'trade_direction_conflicting_label',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TRADE_INTENT },
          { role: 'user', content: c.prompt },
          toolCall(callId, 'intercomswap_autopost_start', args),
          toolResultMsg(callId, 'intercomswap_autopost_start', {
            type: 'autopost_started',
            name: args.name,
            tool: args.tool,
            interval_sec: args.interval_sec,
            valid_until_unix: Math.floor(nowMs / 1000) + c.ttl,
            first: { ok: true, posted: true },
          }),
          { role: 'assistant', content: 'Used semantic buy/sell direction mapping and ignored conflicting label text.' },
        ],
      })
    );
  }

  const invalid = [
    ['trade 1000 sats for 0.12 usdt every 10s for a day', 'Please specify whether you want to buy BTC or sell BTC.'],
    ['sell btc every 10s for a day', 'Missing amounts. Provide BTC amount and USDT amount.'],
    ['buy 1000 sats for 0.12 usdt every 1s for a day', 'Repeat interval is too low. Use at least 5 seconds.'],
    ['sell 1000 sats for 0.12 usdt every 10s for 10 days', 'Validity horizon is too long. Use 7 days or less.'],
    ['sell -1000 sats for 0.12 usdt every 10s', 'BTC amount must be positive.'],
    ['buy 1000 sats for -0.12 usdt every 10s', 'USDT amount must be positive.'],
    ['do the same as before and repeat it', 'Prompt is ambiguous. Provide explicit buy/sell and exact amounts.'],
    ['is this a good price for 1000 sats?', 'Question detected. No side effects executed.'],
  ];
  for (let j = 0; j < 900; j += 1) {
    const [prompt, msg] = invalid[j % invalid.length];
    records.push(
      makeRecord({
        id: `phase2_trade_intent_invalid_${j}`,
        source: 'phase2_trade_intent',
        scenario: 'trade_intent_invalid_or_ambiguous',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TRADE_INTENT },
          { role: 'user', content: prompt },
          { role: 'assistant', content: msg },
        ],
      })
    );
  }

  // Recovery chains for known failure modes.
  const recover = [
    {
      user: 'buy 1000 sats for 0.12 usdt every 10s for 1 day',
      firstErr: 'autopost_start: name already exists (offer_prompt_dup)',
      firstArgs: {
        name: 'offer_prompt_dup',
        tool: 'intercomswap_offer_post',
        interval_sec: 10,
        ttl_sec: 86400,
        args: {
          channels: ['0000intercomswapbtcusdt'],
          name: 'maker:prompt',
          rfq_channels: ['0000intercomswapbtcusdt'],
          offers: [{ btc_sats: 1000, usdt_amount: '120000' }],
        },
      },
      secondArgs: {
        name: 'offer_prompt_040267c8_1771090273648',
        tool: 'intercomswap_offer_post',
        interval_sec: 10,
        ttl_sec: 86400,
        args: {
          channels: ['0000intercomswapbtcusdt'],
          name: 'maker:prompt',
          rfq_channels: ['0000intercomswapbtcusdt'],
          offers: [{ btc_sats: 1000, usdt_amount: '120000' }],
        },
      },
    },
    {
      user: 'sell 1002 sats for 0.33 usdt every 60s',
      firstErr: 'intercomswap_rfq_post: usdt_amount must be a decimal string integer',
      firstArgs: {
        name: 'rfq_prompt_aa_1771091273648',
        tool: 'intercomswap_rfq_post',
        interval_sec: 60,
        ttl_sec: 86400,
        args: {
          channel: '0000intercomswapbtcusdt',
          trade_id: 'rfq-1771091273-aa',
          btc_sats: 1002,
          usdt_amount: '0.33',
        },
      },
      secondArgs: {
        name: 'rfq_prompt_ab_1771091274648',
        tool: 'intercomswap_rfq_post',
        interval_sec: 60,
        ttl_sec: 86400,
        args: {
          channel: '0000intercomswapbtcusdt',
          trade_id: 'rfq-1771091274-ab',
          btc_sats: 1002,
          usdt_amount: '330000',
        },
      },
    },
    {
      user: 'sell 1000 sats for 0.67 usdt every 10s for 1 day',
      firstErr: 'intercomswap_rfq_post: provide at most one of ttl_sec or valid_until_unix',
      firstArgs: {
        name: 'rfq_prompt_ac_1771091275648',
        tool: 'intercomswap_rfq_post',
        interval_sec: 10,
        ttl_sec: 86400,
        valid_until_unix: 1772000000,
        args: {
          channel: '0000intercomswapbtcusdt',
          trade_id: 'rfq-1771091275-ac',
          btc_sats: 1000,
          usdt_amount: '670000',
        },
      },
      secondArgs: {
        name: 'rfq_prompt_ad_1771091276648',
        tool: 'intercomswap_rfq_post',
        interval_sec: 10,
        ttl_sec: 86400,
        args: {
          channel: '0000intercomswapbtcusdt',
          trade_id: 'rfq-1771091276-ad',
          btc_sats: 1000,
          usdt_amount: '670000',
        },
      },
    },
  ];
  for (let j = 0; j < 500; j += 1) {
    const r = recover[j % recover.length];
    const id1 = `call_trade_recover_1_${j}`;
    const id2 = `call_trade_recover_2_${j}`;
    records.push(
      makeRecord({
        id: `phase2_trade_intent_recovery_${j}`,
        source: 'phase2_trade_intent',
        scenario: 'trade_intent_error_recovery',
        tools,
        messages: [
          { role: 'system', content: SYSTEM_TRADE_INTENT },
          { role: 'user', content: r.user },
          toolCall(id1, 'intercomswap_autopost_start', r.firstArgs),
          toolResultMsg(id1, 'intercomswap_autopost_start', { ok: false, error: r.firstErr }),
          { role: 'assistant', content: 'Retrying with corrected arguments.' },
          toolCall(id2, 'intercomswap_autopost_start', r.secondArgs),
          toolResultMsg(id2, 'intercomswap_autopost_start', {
            type: 'autopost_started',
            name: r.secondArgs.name,
            tool: r.secondArgs.tool,
            interval_sec: r.secondArgs.interval_sec,
            valid_until_unix: 1771280000,
            first: { ok: true, posted: true },
          }),
          { role: 'assistant', content: 'Autopost started after correction.' },
        ],
      })
    );
  }
}

function addOpsIntentSamples(records) {
  const commonTools = [
    'intercomswap_stack_start',
    'intercomswap_stack_stop',
    'intercomswap_env_get',
    'intercomswap_app_info',
    'intercomswap_sc_join',
    'intercomswap_sc_leave',
    'intercomswap_sc_send_text',
    'intercomswap_sc_wait_envelope',
    'intercomswap_sc_subscribe',
    'intercomswap_peer_start',
    'intercomswap_peer_stop',
    'intercomswap_peer_status',
    'intercomswap_peer_restart',
    'intercomswap_tradeauto_start',
    'intercomswap_tradeauto_stop',
    'intercomswap_tradeauto_status',
    'intercomswap_tradeauto_trace_set',
    'intercomswap_ln_info',
    'intercomswap_ln_listchannels',
    'intercomswap_ln_connect',
    'intercomswap_ln_peer_probe',
    'intercomswap_ln_fundchannel',
    'intercomswap_ln_rebalance_selfpay',
    'intercomswap_ln_withdraw',
    'intercomswap_ln_unlock',
    'intercomswap_sol_signer_pubkey',
    'intercomswap_sol_balance',
    'intercomswap_sol_token_balance',
    'intercomswap_sol_transfer_sol',
    'intercomswap_sol_token_transfer',
    'intercomswap_sol_airdrop',
    'intercomswap_sol_config_get',
    'intercomswap_sol_trade_config_get',
    'intercomswap_sol_fees_withdraw',
    'intercomswap_receipts_list',
    'intercomswap_receipts_show',
    'intercomswap_receipts_list_open_claims',
    'intercomswap_receipts_list_open_refunds',
    'intercomswap_swaprecover_claim',
    'intercomswap_swaprecover_refund',
  ]
    .map((n) => byTool.get(n))
    .filter(Boolean);

  const templates = [
    {
      prompt: 'start stack with peer maker_main on 9334 and join 0000intercomswapbtcusdt',
      calls: [
        ['intercomswap_stack_start', { peer_name: 'maker_main', peer_store: 'maker_store', sc_port: 9334, sidechannels: ['0000intercomswapbtcusdt'], ln_bootstrap: true, sol_bootstrap: false }],
      ],
    },
    {
      prompt: 'stop stack and stop lightning and solana too',
      calls: [['intercomswap_stack_stop', { peer_name: 'maker_main', sc_port: 9334, ln_stop: true, sol_stop: true }]],
    },
    {
      prompt: 'join 0000intercomswapbtcusdt and send hello traders',
      calls: [
        ['intercomswap_sc_join', { channel: '0000intercomswapbtcusdt' }],
        ['intercomswap_sc_send_text', { channel: '0000intercomswapbtcusdt', text: 'hello traders' }],
      ],
    },
    {
      prompt: 'listen for next swap quote envelope',
      calls: [
        ['intercomswap_sc_subscribe', { channels: ['0000intercomswapbtcusdt'] }],
        ['intercomswap_sc_wait_envelope', { channels: ['0000intercomswapbtcusdt'], kinds: ['swap.quote'], timeout_ms: 60000 }],
      ],
    },
    {
      prompt: 'start peer alpha store alpha_store on port 9444',
      calls: [['intercomswap_peer_start', { name: 'alpha', store: 'alpha_store', sc_port: 9444, sidechannels: ['0000intercomswapbtcusdt'] }]],
    },
    {
      prompt: 'restart peer alpha',
      calls: [['intercomswap_peer_restart', { name: 'alpha', wait_ms: 2000, ready_timeout_ms: 15000 }]],
    },
    {
      prompt: 'enable backend auto trading on 0000intercomswapbtcusdt',
      calls: [
        ['intercomswap_tradeauto_start', { channels: ['0000intercomswapbtcusdt'], trace_enabled: false, ln_liquidity_mode: 'single_channel', enable_settlement: true }],
        ['intercomswap_tradeauto_status', {}],
      ],
    },
    {
      prompt: 'turn on trade logging',
      calls: [['intercomswap_tradeauto_trace_set', { trace_enabled: true }]],
    },
    {
      prompt: 'connect to ACINQ and open channel 300001 sats with 30000 push',
      calls: [
        ['intercomswap_ln_connect', { peer: `${NODE_ID_ACINQ}@3.33.236.230:9735` }],
        ['intercomswap_ln_fundchannel', { peer: `${NODE_ID_ACINQ}@3.33.236.230:9735`, amount_sats: 300001, push_sats: 30000 }],
      ],
    },
    {
      prompt: 'self-pay rebalance inbound 1000 sats',
      calls: [['intercomswap_ln_rebalance_selfpay', { amount_sats: 1000, fee_limit_sat: 10 }]],
    },
    {
      prompt: 'withdraw 25000 sats to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      calls: [['intercomswap_ln_withdraw', { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', amount_sats: 25000 }]],
    },
    {
      prompt: 'unlock lnd with onchain/lnd/mainnet/wallet.pw',
      calls: [['intercomswap_ln_unlock', { password_file: 'onchain/lnd/mainnet/wallet.pw', timeout_ms: 30000 }]],
    },
    {
      prompt: 'show signer and usdt balance',
      calls: [
        ['intercomswap_sol_signer_pubkey', {}],
        ['intercomswap_sol_token_balance', { owner: BASE58[1], mint: BASE58[0] }],
      ],
    },
    {
      prompt: 'send 0.02 sol to collector',
      calls: [['intercomswap_sol_transfer_sol', { to: BASE58[2], lamports: '20000000' }]],
    },
    {
      prompt: 'send 0.81 usdt to recipient',
      calls: [['intercomswap_sol_token_transfer', { mint: BASE58[0], to_owner: BASE58[3], amount: '810000', create_ata: true }]],
    },
    {
      prompt: 'list receipts and open claims',
      calls: [
        ['intercomswap_receipts_list', { limit: 50, offset: 0 }],
        ['intercomswap_receipts_list_open_claims', { limit: 50, offset: 0 }],
      ],
    },
    {
      prompt: 'recover claim for rfq-1771000000-a1b2c3d4',
      calls: [['intercomswap_swaprecover_claim', { trade_id: 'rfq-1771000000-a1b2c3d4' }]],
    },
    {
      prompt: 'recover refund for hash cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      calls: [['intercomswap_swaprecover_refund', { payment_hash_hex: HEX_C }]],
    },
  ];

  for (let j = 0; j < 1100; j += 1) {
    const t = templates[j % templates.length];
    const messages = [{ role: 'system', content: SYSTEM_OPS_INTENT }, { role: 'user', content: t.prompt }];
    for (let k = 0; k < t.calls.length; k += 1) {
      const [name, args] = t.calls[k];
      const callId = `call_ops_${j}_${k}`;
      messages.push(toolCall(callId, name, args));
      messages.push(toolResultMsg(callId, name, successResult(name, args, k % 2 === 0 ? 'ok' : 'alt')));
    }
    messages.push({ role: 'assistant', content: 'Operation completed.' });
    records.push(
      makeRecord({
        id: `phase2_ops_intent_positive_${j}`,
        source: 'phase2_ops_intent',
        scenario: 'ops_intent_positive',
        tools: commonTools,
        messages,
      })
    );
  }

  const invalid = [
    ['join channel', 'Channel name is missing. Provide the sidechannel name.'],
    ['start peer alpha on port 99999', 'Port is invalid. Use a port between 1 and 65535.'],
    ['withdraw minus 100 sats', 'Amount must be positive.'],
    ['send 0.0000001 usdt', 'USDT amount too small after 6-decimal conversion.'],
    ['show receipt details', 'trade_id is required to show one receipt.'],
    ['connect lightning peer', 'Peer URI is required in nodeid@host:port format.'],
    ['refund escrow for hash xyz', 'payment_hash_hex must be 64 hex characters.'],
    ['should i restart peer now?', 'Question detected. No action executed.'],
    ['delete wallet files', 'Refusing destructive wallet deletion.'],
    ['start and stop tradeauto now', 'Conflicting intent. Specify start or stop.'],
  ];
  for (let j = 0; j < 520; j += 1) {
    const [prompt, reply] = invalid[j % invalid.length];
    records.push(
      makeRecord({
        id: `phase2_ops_intent_invalid_${j}`,
        source: 'phase2_ops_intent',
        scenario: 'ops_intent_invalid_or_ambiguous',
        tools: commonTools,
        messages: [
          { role: 'system', content: SYSTEM_OPS_INTENT },
          { role: 'user', content: prompt },
          { role: 'assistant', content: reply },
        ],
      })
    );
  }

  const recover = [
    {
      user: 'send hello on swap:rfq-1771000000-a1b2c3d4',
      first: ['intercomswap_sc_send_text', { channel: 'swap:rfq-1771000000-a1b2c3d4', text: 'hello' }, { ok: false, error: 'channel not joined locally' }],
      second: ['intercomswap_sc_join', { channel: 'swap:rfq-1771000000-a1b2c3d4' }, { ok: true }],
      third: ['intercomswap_sc_send_text', { channel: 'swap:rfq-1771000000-a1b2c3d4', text: 'hello' }, { ok: true, message_id: 'm2' }],
      final: 'Joined channel then sent message.',
    },
    {
      user: 'rebalance inbound by self-pay 1000 sats',
      first: ['intercomswap_ln_rebalance_selfpay', { amount_sats: 1000 }, { ok: false, error: 'FAILURE_REASON_NO_ROUTE' }],
      second: ['intercomswap_ln_fundchannel', { peer: `${NODE_ID_ACINQ}@3.33.236.230:9735`, amount_sats: 300001, push_sats: 30000 }, { ok: true, channel_point: 'txid:2' }],
      third: ['intercomswap_ln_rebalance_selfpay', { amount_sats: 1000 }, { ok: true, payment_hash_hex: HEX_C, status: 'SUCCEEDED' }],
      final: 'Added channel liquidity and retried rebalance successfully.',
    },
    {
      user: 'withdraw platform fees 1 usdt',
      first: ['intercomswap_sol_fees_withdraw', { mint: BASE58[0], to: BASE58[3], amount: '1000000' }, { ok: false, error: 'insufficient lamports' }],
      second: ['intercomswap_sol_balance', { pubkey: BASE58[1] }, { ok: true, lamports: '120000000' }],
      third: ['intercomswap_sol_fees_withdraw', { mint: BASE58[0], to: BASE58[3], amount: '1000000' }, { ok: true, signature: 'sig_withdraw_1' }],
      final: 'After funding SOL fees, withdrawal succeeded.',
    },
    {
      user: 'unlock lnd wallet',
      first: ['intercomswap_ln_unlock', { password_file: 'onchain/lnd/mainnet/missing.pw' }, { ok: false, error: 'password file not found' }],
      second: ['intercomswap_ln_unlock', { password_file: 'onchain/lnd/mainnet/wallet.pw' }, { ok: true, unlocked: true }],
      third: null,
      final: 'Unlock succeeded with corrected password file path.',
    },
    {
      user: 'show receipt for rfq-unknown',
      first: ['intercomswap_receipts_show', { trade_id: 'rfq-unknown' }, { ok: false, error: 'receipt not found for trade_id=rfq-unknown' }],
      second: ['intercomswap_receipts_list', { limit: 20, offset: 0 }, { ok: true, total: 2, items: [{ trade_id: 'rfq-1' }, { trade_id: 'rfq-2' }] }],
      third: null,
      final: 'Trade id not found; listed available receipt ids.',
    },
  ];
  for (let j = 0; j < 260; j += 1) {
    const r = recover[j % recover.length];
    const msgs = [{ role: 'system', content: SYSTEM_OPS_INTENT }, { role: 'user', content: r.user }];
    const id1 = `call_ops_recover_1_${j}`;
    msgs.push(toolCall(id1, r.first[0], r.first[1]));
    msgs.push(toolResultMsg(id1, r.first[0], r.first[2]));
    msgs.push({ role: 'assistant', content: 'Applying recovery step.' });
    const id2 = `call_ops_recover_2_${j}`;
    msgs.push(toolCall(id2, r.second[0], r.second[1]));
    msgs.push(toolResultMsg(id2, r.second[0], r.second[2]));
    if (r.third) {
      msgs.push({ role: 'assistant', content: 'Retrying after prerequisites were fixed.' });
      const id3 = `call_ops_recover_3_${j}`;
      msgs.push(toolCall(id3, r.third[0], r.third[1]));
      msgs.push(toolResultMsg(id3, r.third[0], r.third[2]));
    }
    msgs.push({ role: 'assistant', content: r.final });
    records.push(
      makeRecord({
        id: `phase2_ops_intent_recovery_${j}`,
        source: 'phase2_ops_intent',
        scenario: 'ops_intent_recovery',
        tools: commonTools,
        messages: msgs,
      })
    );
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const out = [];
  for (const line of raw.split(/\n+/)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch (_e) {
      // ignore malformed source lines
    }
  }
  return out;
}

function normalizeRecord(r, fallbackPrefix = 'seed') {
  const id = String(r?.id || '').trim() || `${fallbackPrefix}_${crypto.randomUUID()}`;
  const source = String(r?.source || 'seed');
  const scenario = String(r?.scenario || 'seed');
  const tools = Array.isArray(r?.tools) ? r.tools : [];
  const messages = Array.isArray(r?.messages) ? r.messages : [];
  return { id, source, scenario, tools, messages };
}

function splitTrainEval(records) {
  const train = [];
  const evalSet = [];
  for (const r of records) {
    const b = jsonHashByte(r.id);
    if (b < 26) evalSet.push(r); // ~10.2%
    else train.push(r);
  }
  return { train, eval: evalSet };
}

function summarize(records) {
  const byScenario = {};
  const bySource = {};
  let noToolCall = 0;
  let hasToolCall = 0;
  let runtimeFailLike = 0;

  for (const r of records) {
    byScenario[r.scenario] = (byScenario[r.scenario] || 0) + 1;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    const msgs = Array.isArray(r.messages) ? r.messages : [];
    const toolCalls = msgs.some((m) => Array.isArray(m?.tool_calls) && m.tool_calls.length > 0);
    if (toolCalls) hasToolCall += 1;
    else noToolCall += 1;
    const toolFails = msgs.some((m) => m?.role === 'tool' && /"ok"\s*:\s*false|FAILURE_REASON_NO_ROUTE|insufficient lamports|not found|name already exists/i.test(String(m?.content || '')));
    if (toolFails) runtimeFailLike += 1;
  }

  return {
    total: records.length,
    by_source: bySource,
    by_scenario: byScenario,
    messages_with_tool_call: hasToolCall,
    messages_without_tool_call: noToolCall,
    records_with_failure_signal: runtimeFailLike,
    failure_ratio: records.length ? runtimeFailLike / records.length : 0,
  };
}

function dedupe(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const sig = crypto.createHash('sha256').update(`${r.id}\n${JSON.stringify(r.messages)}`).digest('hex');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(r);
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const seed = [];
  for (const p of SRC_FILES) {
    const rows = readJsonl(p).map((r, idx) => normalizeRecord(r, `seed_${path.basename(p)}_${idx}`));
    seed.push(...rows);
  }

  const generated = [];
  addToolSamples(generated);
  addTradeIntentSamples(generated);
  addOpsIntentSamples(generated);

  const all = dedupe([...seed, ...generated]);
  const { train, eval: evalSet } = splitTrainEval(all);

  const trainText = `${train.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const evalText = `${evalSet.map((r) => JSON.stringify(r)).join('\n')}\n`;
  fs.writeFileSync(OUT_TRAIN, trainText, 'utf8');
  fs.writeFileSync(OUT_EVAL, evalText, 'utf8');

  const manifest = {
    generated_at_unix_ms: Date.now(),
    source_files: SRC_FILES.map((p) => path.relative(ROOT, p)),
    output_files: {
      train: path.relative(ROOT, OUT_TRAIN),
      eval: path.relative(ROOT, OUT_EVAL),
    },
    counts: {
      seed_records: seed.length,
      generated_records: generated.length,
      deduped_total_records: all.length,
      train_records: train.length,
      eval_records: evalSet.length,
    },
    train_summary: summarize(train),
    eval_summary: summarize(evalSet),
  };
  fs.writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(manifest, null, 2));
}

main();

