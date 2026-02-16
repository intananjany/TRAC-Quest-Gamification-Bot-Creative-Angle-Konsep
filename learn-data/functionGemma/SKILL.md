---
name: functiongemma-dataset-harness
description: Build, expand, and evaluate tool-calling fine-tune datasets for IntercomSwap-style systems, including pair-agnostic generation for forks with different or N×M asset pairs.
---

# FunctionGemma Dataset + Harness Skill

## Purpose
This skill defines a repeatable way to:
1. Generate tool-calling training data.
2. Include non-happy-path behavior by design.
3. Evaluate whether a fine-tuned model is safe and reliable for production tool use.
4. Generalize to forks that use different trading pairs (including `N x M` pair matrices).

This document is structural and technology-agnostic. It describes patterns, constraints, and interfaces, not one specific ML vendor or runtime.

## Current Artifacts In This Folder
- `generate-phase2-datasets.mjs`
  - Deterministic expansion/splitting script.
- `training-corpus.zip`
  - Compressed corpus bundle containing:
    - `intercomswap-tools-finetune.jsonl`
    - `intercomswap-intent-routing-finetune.jsonl`
    - `intercomswap-ops-intent-routing-finetune.jsonl`
    - `intercomswap-finetune-train-v2.jsonl`
    - `intercomswap-finetune-eval-v2.jsonl`
    - `intercomswap-finetune-manifest-v2.json`
- `SKILL.md`
  - This skill and workflow reference.

## Unpack Step (Required)
Before using datasets for training or evaluation, unzip the corpus in this folder:

```bash
cd learn-data/functionGemma
unzip -o training-corpus.zip
```

## Phases

### Phase 1: Tool-Schema Grounding
Goal:
- Force correct tool name selection and schema-valid argument shape.

Required scenario families:
1. Valid minimal payload.
2. Valid typical payload.
3. Valid alternative/edge payload.
4. Runtime failure with valid payload.
5. Missing required field.
6. Wrong type.
7. Unexpected field.

Why:
- Most production failures in tool-calling happen before business logic: wrong name, wrong shape, wrong type.

### Phase 2: Intent + Operations Expansion
Goal:
- Teach natural-language routing to deterministic tool calls.

Required scenario families:
1. Trade intent mapping:
  - `sell BTC/sats` => RFQ path.
  - `buy BTC/sats` => Offer path.
2. Unit normalization:
  - BTC -> sats.
  - quote currency -> atomic integer string.
3. Conflict resolution:
  - If user label conflicts with semantics, semantics win.
4. Non-happy path:
  - ambiguous prompts -> no tool call.
  - invalid intervals/TTL/amounts -> no tool call.
  - retry-after-error behavior.
5. Non-trade ops intents:
  - stack, peer lifecycle, channels, balances, fees, recovery, etc.

### Phase 3: Harness + Release Gating
Goal:
- Decide if a fine-tune is production-safe, not just “looks good”.

Required outputs:
1. Offline evaluator against held-out eval split.
2. Deterministic score report by scenario family.
3. Release gate thresholds.

Suggested hard gates:
1. Tool name accuracy: `>= 99%`
2. Schema-valid argument rate: `>= 99%`
3. Direction inversion count on trade intents: `0`
4. Ambiguous prompt side-effect rate: `0` (must ask clarification)
5. Recovery behavior pass rate on known failures: `>= 95%`

## Pair-Agnostic Data Model (For Forks / N×M Pairs)
Do not hardcode one pair. Use a pair registry.

### PairSpec
Each pair should define:
1. `pair_id`: canonical id (`BASE/QUOTE` style).
2. `base_asset`, `quote_asset`.
3. `base_units`, `quote_units`:
  - display precision
  - atomic precision
  - conversion rules
4. `base_settlement`, `quote_settlement`:
  - network/transport family
  - constraints (timeouts, fees, channel/routing assumptions)
5. `role_mapping`:
  - what “buy base” means in tool terms
  - what “sell base” means in tool terms
6. `fee_policy`:
  - platform/trade/total constraints
7. `expiry_policy`:
  - ttl min/max, absolute expiration rules

### MatrixSpec (`N x M`)
Define:
1. `assets`: full asset list.
2. `supported_pairs`: subset mapping with PairSpec.
3. `routing_rules`:
  - which tools are valid per pair.
4. `directional_intents`:
  - per pair: NL semantics -> tool workflow.

Then generate datasets by iterating over:
1. PairSpec.
2. Intent templates.
3. Amount templates.
4. Time templates.
5. Failure templates.

This yields consistent behavior even when forks add/remove assets or settlement rails.

## Theoretical Rebuild Procedure (Fork-Safe)
Use this when a fork has different tools/pairs:

1. Inventory tool surface:
  - Extract tool names, schema, constraints from canonical tool registry.
2. Build PairSpec + MatrixSpec:
  - No dataset generation before this mapping is explicit.
3. Generate schema-grounding set:
  - Per tool: valid/invalid/failure templates.
4. Generate intent-routing set:
  - Per pair: buy/sell mapping, conversions, ambiguity cases.
5. Generate ops-intent set:
  - Peer/channel/wallet/recovery/admin paths.
6. Add failure-driven recovery chains:
  - Seed from known failure classes in the fork.
7. Deterministic split:
  - Stable hash-based train/eval split.
8. Build manifest:
  - counts, scenario coverage, non-happy ratio, split checksum.
9. Run harness:
  - compute metrics and gate pass/fail.

## Harness Architecture (Structural, No Tech Lock-In)
Implement as logical modules:

1. `DatasetLoader`
  - Reads train/eval JSONL.
2. `PromptRunner`
  - Sends user/system + tools to target model.
3. `CallExtractor`
  - Parses tool calls from model output.
4. `SchemaValidator`
  - Validates extracted args against tool schemas.
5. `SemanticValidator`
  - Checks directional rules, conversion correctness, safety rules.
6. `ExecutionSimulator` (optional but recommended)
  - Replays canned tool results to test multi-turn recovery.
7. `Scorer`
  - Computes per-scenario and aggregate metrics.
8. `GateEvaluator`
  - Enforces release thresholds.
9. `Reporter`
  - Emits machine-readable + human-readable reports.

## Failure Taxonomy (Must Be Explicit)
Track at least:
1. `wrong_tool_name`
2. `schema_invalid_args`
3. `direction_inversion`
4. `unit_conversion_error`
5. `unsafe_side_effect_on_ambiguous_prompt`
6. `missing_recovery_after_runtime_error`
7. `hallucinated_fields`
8. `dropped_required_fields`

Without taxonomy, improvements are not measurable.

## Data Mix Guidance
Recommended target mix:
1. 55-65% valid execution records.
2. 35-45% non-happy-path records:
  - no-tool clarification records
  - runtime failure records
  - recovery-chain records

This prevents overfitting to happy-path tool calls.

## Safety Baselines
Always encode these into data + harness checks:
1. Ambiguous/unsafe prompt => ask clarification, no action.
2. No destructive wallet/seed/password operations.
3. No secret-file exfiltration behavior.
4. No tool calls when required core fields are missing.
5. No silent direction inversion.

## Fork Adaptation Checklist
Before training on a fork:
1. Confirm tool schemas match current code.
2. Confirm PairSpec for every enabled pair.
3. Regenerate datasets from fork definitions (do not reuse old mappings blindly).
4. Rebuild eval split and manifest.
5. Re-run harness and gate before rollout.

## Notes
- Keep datasets deterministic and reproducible.
- Keep eval split held-out and immutable per version.
- Version your manifests so training runs can be audited and compared.
