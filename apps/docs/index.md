---
layout: home

hero:
  name: SmartAgentKit
  text: Policy-Governed Smart Wallets for AI Agents
  tagline: Deploy ERC-4337 smart accounts with built-in spending limits, allowlists, and emergency pause — enforced on-chain.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quickstart
    - theme: alt
      text: API Reference
      link: /api/sdk/client
    - theme: alt
      text: GitHub
      link: https://github.com/smartagentkit/smartagentkit

features:
  - icon: "\U0001F4B0"
    title: Spending Limits
    details: Per-token caps over rolling time windows. Set a daily ETH budget and the on-chain hook enforces it — no trust required.
  - icon: "\U0001F4CB"
    title: Allowlist / Blocklist
    details: Control which contracts and functions your agent can call. Restrict interactions to known-safe protocols.
  - icon: "\U0001F6D1"
    title: Emergency Pause
    details: Circuit breaker to freeze all wallet activity instantly. Auto-unpause after a configurable duration.
  - icon: "\U0001F511"
    title: Session Keys
    details: Scoped, time-limited key pairs via Smart Sessions. Agents get only the permissions they need, nothing more.
  - icon: "\U0001F916"
    title: LangChain Integration
    details: Drop-in tools for AI agent frameworks. Check balances, send transactions, and query policies from your LangChain agent.
  - icon: "\U0001F9EA"
    title: Mock Testing
    details: Test your entire agent workflow without deploying contracts or funding wallets. Full policy enforcement in-memory.
---
