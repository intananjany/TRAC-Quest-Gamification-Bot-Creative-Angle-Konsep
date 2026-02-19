# 🎮 TRAC Quest — Daily Mission & Gamification System

> A fork of [Trac-Systems/intercom](https://github.com/Trac-Systems/intercom) that adds a **daily quest + reward system** for TRAC Network users.

---

## 💡 What Is TRAC Quest?

TRAC Quest is a gamified layer on top of the Intercom P2P protocol. Users interact with an **AI Agent** that:

- Assigns **daily quests** tied to TRAC wallet interactions
- Awards **TNK points** for completing missions
- Maintains a **global leaderboard** of top agents
- Tracks **daily streaks** with bonus rewards
- Keeps all state via Intercom's replicated-state layer

It's fun, viral-friendly, and shows how Intercom sidechannels can power real-time agent coordination beyond simple swaps.
<img width="889" height="864" alt="image" src="https://github.com/user-attachments/assets/08f8bc6c-2246-4c65-a90e-b6d802dd205c" />
<img width="1158" height="715" alt="image" src="https://github.com/user-attachments/assets/7eabe175-a5ae-4e63-8346-b26ae64ba43b" />

---

## 🚀 Live App

Open `index.html` in any browser — no server required.

Or view the hosted demo: **`index.html`** (static, runs fully client-side)
<img width="1228" height="606" alt="image" src="https://github.com/user-attachments/assets/4a6d4d13-287f-4362-a755-d1d7c976a53b" />
<img width="1311" height="847" alt="image" src="https://github.com/user-attachments/assets/7cdff2a3-c50f-4d5c-9b47-2a48688d0465" />

---

## 📸 How It Works

```
User: "start quest"

AGENT_TRAC:
  [ QUEST PROTOCOL INITIATED ]
  Today's quests are now active.
  
  Quest: DAILY CHECK-IN    → +50 TNK pts
  Quest: LINK WALLET       → +75 TNK pts  
  Quest: SEND A MESSAGE    → +30 TNK pts
  Quest: STREAK WARRIOR    → +150 TNK pts (3-day streak)
```

---

## 🏆 Quest System

| Quest | Description | Reward |
|-------|-------------|--------|
| 📅 Daily Check-in | Check in every day | +50 pts |
| 🔗 Link Wallet | Connect TRAC address | +75 pts |
| 💬 Send a Message | Interact with agent | +30 pts |
| 🗺️ Explore Quests | View leaderboard | +25 pts |
| 🔥 Streak Warrior | 3-day check-in streak | +150 pts |

---

## 🔧 Tech Stack

- **Frontend**: Pure HTML/CSS/JS (zero dependencies)
- **Agent Protocol**: Intercom P2P sidechannels (Trac Network)
- **State**: Intercom replicated-state layer + localStorage for demo
- **Wallet**: TRAC address linking for payout eligibility

---

##  Files

```
/
├── index.html      ← Main app (standalone, open in browser)
├── SKILL.md        ← Agent skill file for Intercom agents
└── README.md       ← This file
```

---

##  TRAC Payout Address

```
trac13gmxfpn6vvrpzks9mra6k7zu7pazap6n6wscrmhu2u5ccsrjy2jq822npm
```

>  Replace the above with your actual TRAC/Bitcoin address before submitting the PR.

---

##  Fork Info

- **Upstream**: https://github.com/Trac-Systems/intercom
- **This fork adds**: Quest system, gamification UI, agent interaction layer
- **Submitted to**: https://github.com/Trac-Systems/awesome-intercom

---

## 📬 Contributing

PRs welcome! Ideas for future quests:
- On-chain transaction verification via Intercom
- Multi-player quest chains
- NFT badge rewards
- Guild/team leaderboards
