# OpenClaw Wallet Skill

An OpenClaw SKILL.md integration that lets any OpenClaw-powered AI agent manage SmartAgentKit wallets through natural language.

## What is OpenClaw?

[OpenClaw](https://openclaw.ai) is an open-source AI agent framework that uses `SKILL.md` files to teach AI agents how to use CLI tools. When an agent has a skill installed, it can interpret natural language requests and execute the appropriate CLI commands.

## What is a SKILL.md?

A SKILL.md file is a structured document that describes a CLI tool's capabilities in natural language. It includes YAML frontmatter (name, description, requirements) and detailed instructions for each command. OpenClaw's built-in LLM reads this file and translates user requests into CLI invocations.

## Architecture

```
User (natural language)
 |
 v
OpenClaw Agent (built-in LLM)
 |
 v
SKILL.md (command reference)
 |
 v
SmartAgentKit CLI (`sak` commands)
 |
 v
SmartAgentKit SDK
 |
 v
ERC-4337 Bundler --> On-chain Policies --> Safe Smart Account
```

## Installation

1. Install the SmartAgentKit CLI globally:

```bash
npm i -g smartagentkit
```

2. Copy the skill to your OpenClaw skills directory:

```bash
mkdir -p ~/.openclaw/skills/smartagentkit-wallet
cp SKILL.md ~/.openclaw/skills/smartagentkit-wallet/SKILL.md
```

3. Configure the CLI (interactive):

```bash
sak config init
```

Or set environment variables (see `.env.example`).

## Prerequisites

- SmartAgentKit CLI installed globally (`npm i -g smartagentkit`)
- OpenClaw agent running locally
- A funded wallet on Base Sepolia or Sepolia testnet
- A Pimlico API key for the ERC-4337 bundler
- Deployed SmartAgentKit module contracts

## Example Conversations

### Creating a Treasury Wallet

```
User: Create a new treasury wallet for my AI agent

Agent: I'll create a smart wallet using the treasury-agent preset. This configures:
- Weekly spending limit of 5 ETH
- Emergency pause (manual only, no auto-unpause)

Running: sak create --preset treasury-agent --owner 0x1234... --private-key 0xabcd...

Done! Your treasury wallet has been deployed at 0x7890...
- Spending limit: 5 ETH per week
- Guardian: 0x1234... (you)
- Chain: Base Sepolia
```

### Monitoring and Pausing

```
User: Check the status of wallet 0x7890... and pause it if spending is too high

Agent: Let me check the wallet status first.

Running: sak status 0x7890...

Status:
- Balance: 2.5 ETH
- Paused: No
- Remaining weekly allowance: 0.8 ETH (84% used)

The wallet has used 84% of its weekly spending limit. That's quite high.
I'll pause it as a precaution.

Running: sak pause 0x7890... --private-key 0xabcd...

Wallet 0x7890... is now paused. No transactions can be executed until you unpause it.
```

### Session Key Management

```
User: Set up a session key for my trading bot that expires in 24 hours

Agent: I'll create a time-scoped session key for your trading bot.

Running: sak session create 0x7890... --expires 24h --target 0xDEX... --selector 0xa9059cbb --private-key 0xabcd...

Session key created:
- Key: 0xef01...
- Expires: 2026-02-25 14:30 UTC (24 hours)
- Scope: transfer() calls to 0xDEX... only
- Permission ID: 0x5678...

The bot can now execute transactions within these constraints. The key will automatically expire in 24 hours.
```

## What it Demonstrates

- **OpenClaw integration** — AI agents using CLI tools via SKILL.md
- **No TypeScript code** — Pure configuration, works with any LLM
- **Full CLI coverage** — All 8 SmartAgentKit CLI commands documented
- **Natural language to on-chain actions** — User intent translated to ERC-4337 operations

## Security Considerations

- Private keys are passed via CLI arguments — in production, use a secure key management solution
- OpenClaw runs commands in a sandboxed shell — verify your sandbox configuration
- Always test on testnet first before using mainnet
- The SKILL.md instructs the agent to use testnet by default
- Review the agent's planned commands before approving execution
