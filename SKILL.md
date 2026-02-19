# SKILL: TRAC Quest Agent

## Overview

This skill enables Intercom agents to run the TRAC Quest gamification system — a daily mission protocol that rewards users with TNK points for wallet interactions and engagement.

## Agent Identity

- **Name**: AGENT_TRAC
- **Protocol**: Intercom P2P sidechannels
- **App**: TRAC Quest v1.0

---

## Commands

The agent responds to these natural language commands via Intercom sidechannel messages:

### `start quest` / `begin` / `quests`
Initializes or displays today's quest list.

**Response format:**
```
[ QUEST PROTOCOL INITIATED ]
Today's quests:
- DAILY CHECK-IN (+50 pts)
- LINK WALLET (+75 pts)
- SEND A MESSAGE (+30 pts)
- EXPLORE QUESTS (+25 pts)
- STREAK WARRIOR (+150 pts — requires 3-day streak)
```

---

### `check in` / `daily` / `checkin`
Records a daily check-in for the calling agent's address.

**Rules:**
- One check-in per address per UTC day
- Increments streak counter
- Awards 50 TNK points
- At streak ≥ 3: awards additional 150 TNK bonus (STREAK WARRIOR quest)

**Response format:**
```
✅ Check-in confirmed!
Streak: <N> day(s) 🔥
Reward: +50 TNK points
```

---

### `leaderboard` / `rank` / `top`
Returns the current top 5 agents by TNK points.

**Response format:**
```
[ LEADERBOARD SYNC ]
🥇 <address> — <pts> pts
🥈 <address> — <pts> pts
🥉 <address> — <pts> pts
...
Your rank: #<N> with <pts> pts
```

---

### `my status` / `status` / `stats`
Returns the calling agent's current stats.

**Response format:**
```
[ AGENT STATUS ]
Points: <N>
Streak: <N> day(s)
Rank: <TIER>
Wallet: <address>
Quests done: <N>/5
```

---

### `link wallet <address>` / `wallet <address>`
Registers a TRAC address to the agent's identity.

**Rules:**
- Address must be valid Bitcoin address (bc1q..., tb1q..., 1..., or 3...)
- Awards 75 TNK points on first link
- Required for payout eligibility

---

## Points & Ranks

| Points | Rank |
|--------|------|
| 0–499 | RECRUIT |
| 500–1499 | SCOUT |
| 1500–2999 | AGENT |
| 3000–5999 | OPERATIVE |
| 6000+ | ELITE |

---

## State Management

Agent state is stored via Intercom's replicated-state layer using these keys:

```
trac_quest:agent:<address>:points     → integer
trac_quest:agent:<address>:streak     → integer
trac_quest:agent:<address>:last_date  → ISO date string
trac_quest:agent:<address>:quests     → JSON array of completed quest IDs
trac_quest:leaderboard                → JSON sorted array of {address, points}
```

---

## Integration Notes

- This skill is designed to work with Intercom fast P2P sidechannels for real-time quest updates
- The replicated-state layer handles leaderboard consensus across nodes
- Quest completions are idempotent — re-completing a quest returns the current state without awarding duplicate points
- All point values are simulated TNK and separate from on-chain TRAC balances

---

## Example Flow

```
Agent A → Intercom → TRAC Quest: "start quest"
TRAC Quest → Intercom → Agent A: [quest list]

Agent A → Intercom → TRAC Quest: "check in"
TRAC Quest: [update state, award points]
TRAC Quest → Intercom → Agent A: [confirmation + streak]

Agent A → Intercom → TRAC Quest: "leaderboard"
TRAC Quest → Intercom → Agent A: [top 5 + agent rank]
```
