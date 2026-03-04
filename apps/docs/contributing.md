# Contributing to SmartAgentKit

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for Solidity contracts)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run Solidity tests
pnpm test:contracts
```

## Project Structure

```
smartagentkit/
├── packages/
│   ├── contracts/           # Solidity modules (Foundry)
│   ├── sdk/                 # @smartagentkit/sdk
│   ├── cli/                 # smartagentkit CLI
│   ├── testing/             # @smartagentkit/testing
│   └── integrations/
│       └── langchain/       # @smartagentkit/langchain
├── apps/
│   ├── docs/                # VitePress documentation site
│   └── examples/            # Example projects
└── .github/workflows/       # CI/CD
```

## Making Changes

### Solidity Contracts

```bash
cd packages/contracts
forge build
forge test
forge test --gas-report  # Check gas impact
```

All modules inherit from Rhinestone ModuleKit base classes. Follow existing patterns in `src/modules/`.

### TypeScript Packages

```bash
# Build a specific package
cd packages/sdk
pnpm build

# Run tests in watch mode
pnpm test:watch
```

Tests use Vitest. Place test files in `src/__tests__/`.

### Code Style

- TypeScript: Prettier handles formatting (`pnpm format`)
- Solidity: Follow existing conventions (4-space indent, NatSpec comments)
- Keep changes focused -- one concern per PR

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes and add tests
3. Ensure all tests pass: `pnpm test && pnpm test:contracts`
4. Ensure the build succeeds: `pnpm build`
5. Open a PR with a clear description of what changed and why

### PR Guidelines

- Keep PRs small and focused
- Add tests for new functionality
- Update documentation if behavior changes
- Reference related issues in the PR description

## Documentation

When making changes that affect the public API or user-facing behavior:

- **API changes**: Update the relevant page in `apps/docs/api/`
- **New features**: Add or update the relevant guide in `apps/docs/guides/`
- **New examples**: Add a page in `apps/docs/examples/`
- **Verify**: Run `pnpm docs:build` before committing to catch broken links

The documentation site is built with [VitePress](https://vitepress.dev/) and lives in `apps/docs/`.

### Running Docs Locally

```bash
pnpm docs:dev      # Start dev server
pnpm docs:build    # Production build
pnpm docs:preview  # Preview production build
```

## Contributing a Policy Plugin

New policy plugins are one of the most impactful contributions you can make. SmartAgentKit's plugin architecture is designed to make adding policies straightforward.

### Getting Started

1. Run the [Policy Playground](/examples/policy-playground) to understand how plugins work
2. Read the [Custom Policies Guide](/guides/custom-policies) for the full walkthrough
3. Open an issue to discuss your idea before starting

### What a Policy Contribution Includes

A complete policy contribution has:

1. **Solidity hook** in `packages/contracts/src/modules/` extending `ERC7579HookDestruct`
2. **Foundry tests** in `packages/contracts/test/` including edge cases and fuzz tests
3. **TypeScript plugin** in `packages/sdk/src/plugins/` implementing `PolicyPlugin`
4. **Registration** in `packages/sdk/src/plugins/index.ts`
5. **Config type** added to the `PolicyConfig` union in `packages/sdk/src/types.ts`
6. **SDK tests** in `packages/sdk/src/__tests__/plugins.test.ts`
7. **Documentation** — either a new guide or an addition to [Policy Configuration](/guides/policy-configuration)
8. **Changeset** via `pnpm changeset`

### Labels

- `good-first-issue` — Policy plugins that are self-contained and well-scoped
- `policy-plugin` — Any PR that adds or modifies a policy plugin
- `needs-solidity` — Contributions that require a new Solidity contract
- `needs-tests` — PRs that need test coverage added

## Reporting Issues

Open an issue on [GitHub](https://github.com/smartagentkit/smartagentkit/issues) with:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, chain, etc.)

## Security

If you find a security vulnerability, please **do not** open a public issue. Instead, email security@smartagentkit.dev with details.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
