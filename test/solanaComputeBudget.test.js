import test from 'node:test';
import assert from 'node:assert/strict';

import { ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';

import { buildComputeBudgetIxs } from '../src/solana/computeBudget.js';
import { createEscrowTx, claimEscrowTx, LN_USDT_ESCROW_PROGRAM_ID } from '../src/solana/lnUsdtEscrowClient.js';

function dummyConnection() {
  return {
    // Enough for our tx builders (they only need a recent blockhash).
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0 };
    },
  };
}

test('solana compute budget: builder returns empty when unset', () => {
  const ixs = buildComputeBudgetIxs({});
  assert.equal(ixs.length, 0);
});

test('solana compute budget: builder returns limit then price', () => {
  const ixs = buildComputeBudgetIxs({ computeUnitLimit: 200_000, computeUnitPriceMicroLamports: 1234 });
  assert.equal(ixs.length, 2);
  assert.equal(ixs[0].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());
  assert.equal(ixs[1].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());

  const wantLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
  const wantPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1234 });
  assert.equal(ixs[0].data.toString('hex'), wantLimit.data.toString('hex'));
  assert.equal(ixs[1].data.toString('hex'), wantPrice.data.toString('hex'));
});

test('ln-usdt-escrow tx builders: include compute budget ixs when configured', async () => {
  const connection = dummyConnection();

  const payer = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const paymentHashHex = '00'.repeat(32);
  const recipient = Keypair.generate().publicKey;
  const refund = Keypair.generate().publicKey;
  const tradeFeeCollector = Keypair.generate().publicKey;

  const { tx: noCbTx } = await createEscrowTx({
    connection,
    payer,
    payerTokenAccount: payer.publicKey, // not validated here; fine for instruction shape.
    mint,
    paymentHashHex,
    recipient,
    refund,
    refundAfterUnix: Math.floor(Date.now() / 1000) + 3600,
    amount: 123n,
    expectedPlatformFeeBps: 50,
    expectedTradeFeeBps: 50,
    tradeFeeCollector,
    programId: LN_USDT_ESCROW_PROGRAM_ID,
  });
  assert.equal(noCbTx.instructions.length, 1);
  assert.equal(noCbTx.instructions[0].programId.toBase58(), LN_USDT_ESCROW_PROGRAM_ID.toBase58());

  const { tx: cbTx } = await createEscrowTx({
    connection,
    payer,
    payerTokenAccount: payer.publicKey,
    mint,
    paymentHashHex,
    recipient,
    refund,
    refundAfterUnix: Math.floor(Date.now() / 1000) + 3600,
    amount: 123n,
    expectedPlatformFeeBps: 50,
    expectedTradeFeeBps: 50,
    tradeFeeCollector,
    computeUnitLimit: 200_000,
    computeUnitPriceMicroLamports: 1234,
    programId: LN_USDT_ESCROW_PROGRAM_ID,
  });
  assert.equal(cbTx.instructions.length, 3);
  assert.equal(cbTx.instructions[0].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());
  assert.equal(cbTx.instructions[1].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());
  assert.equal(cbTx.instructions[2].programId.toBase58(), LN_USDT_ESCROW_PROGRAM_ID.toBase58());

  const recipientKp = Keypair.generate();
  const recipientTokenAccount = Keypair.generate().publicKey;
  const { tx: claimTx } = await claimEscrowTx({
    connection,
    recipient: recipientKp,
    recipientTokenAccount,
    mint,
    paymentHashHex,
    preimageHex: '11'.repeat(32),
    tradeFeeCollector,
    computeUnitLimit: 111_111,
    computeUnitPriceMicroLamports: 2222,
    programId: LN_USDT_ESCROW_PROGRAM_ID,
  });
  assert.equal(claimTx.instructions.length, 3);
  assert.equal(claimTx.instructions[0].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());
  assert.equal(claimTx.instructions[1].programId.toBase58(), ComputeBudgetProgram.programId.toBase58());
  assert.equal(claimTx.instructions[2].programId.toBase58(), LN_USDT_ESCROW_PROGRAM_ID.toBase58());

  // Also sanity-check the tx is still signable (ComputeBudget ixs shouldn't affect signing).
  assert.equal(claimTx.feePayer.toBase58(), recipientKp.publicKey.toBase58());
});

