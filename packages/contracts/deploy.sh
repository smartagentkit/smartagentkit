#!/usr/bin/env bash
set -euo pipefail

# ─── SmartAgentKit Module Deployment Script ──────────────────────
#
# Deploys all SmartAgentKit ERC-7579 modules via Foundry, parses the
# broadcast output, and writes deployed addresses to deployments/*.json.
#
# Usage:
#   ./deploy.sh base-sepolia      # Deploy to Base Sepolia
#   ./deploy.sh sepolia           # Deploy to Sepolia
#   ./deploy.sh --dry-run sepolia # Validate env without deploying
#
# Prerequisites:
#   - cp .env.example .env && fill in values
#   - jq installed (brew install jq / apt install jq)
#   - forge installed (https://book.getfoundry.sh)
# ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Parse arguments ────────────────────────────────────────────

DRY_RUN=false
CHAIN=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) CHAIN="$arg" ;;
  esac
done

if [[ -z "$CHAIN" ]]; then
  echo "Usage: ./deploy.sh [--dry-run] <chain>"
  echo ""
  echo "Supported chains:"
  echo "  base-sepolia   (Chain ID: 84532)"
  echo "  sepolia        (Chain ID: 11155111)"
  exit 1
fi

# ─── Chain configuration ────────────────────────────────────────

case "$CHAIN" in
  base-sepolia)
    CHAIN_ID=84532
    RPC_VAR="BASE_SEPOLIA_RPC_URL"
    ETHERSCAN_VAR="BASESCAN_API_KEY"
    FORGE_CHAIN="base_sepolia"
    ;;
  sepolia)
    CHAIN_ID=11155111
    RPC_VAR="SEPOLIA_RPC_URL"
    ETHERSCAN_VAR="ETHERSCAN_API_KEY"
    FORGE_CHAIN="sepolia"
    ;;
  *)
    echo "Error: Unsupported chain '$CHAIN'"
    echo "Supported chains: base-sepolia, sepolia"
    exit 1
    ;;
esac

# ─── Load .env ──────────────────────────────────────────────────

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ─── Validate prerequisites ────────────────────────────────────

ERRORS=()

if ! command -v jq &>/dev/null; then
  ERRORS+=("jq is required but not installed. Install with: brew install jq")
fi

if ! command -v forge &>/dev/null; then
  ERRORS+=("forge is required but not installed. See: https://book.getfoundry.sh")
fi

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" && -z "${DEPLOYER_MNEMONIC:-}" ]]; then
  ERRORS+=("No deployer credential set. Set DEPLOYER_PRIVATE_KEY or DEPLOYER_MNEMONIC in your .env file.")
fi

RPC_URL="${!RPC_VAR:-}"
if [[ -z "$RPC_URL" ]]; then
  ERRORS+=("$RPC_VAR is not set. Add it to your .env file.")
fi

ETHERSCAN_KEY="${!ETHERSCAN_VAR:-}"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "Error: Missing prerequisites"
  echo ""
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi

# ─── Dry-run mode ──────────────────────────────────────────────

if [[ "$DRY_RUN" == true ]]; then
  echo "=== Dry Run ==="
  echo "Chain:         $CHAIN (ID: $CHAIN_ID)"
  echo "RPC URL:       ${RPC_URL:0:40}..."
  echo "Etherscan Key: ${ETHERSCAN_KEY:+set}${ETHERSCAN_KEY:-not set}"
  if [[ -n "${DEPLOYER_MNEMONIC:-}" ]]; then
    echo "Auth:          mnemonic (index: ${DEPLOYER_ADDRESS_INDEX:-0})"
  else
    echo "Auth:          private key"
  fi
  echo ""
  echo "Would run:"
  echo "  forge script script/Deploy.s.sol:DeployModules \\"
  echo "    --rpc-url \$$RPC_VAR \\"
  echo "    --broadcast \\"
  if [[ -n "$ETHERSCAN_KEY" ]]; then
    echo "    --verify \\"
    echo "    --etherscan-api-key \$$ETHERSCAN_VAR \\"
  fi
  echo "    -vvvv"
  echo ""
  echo "Deployment JSON will be written to: deployments/$CHAIN.json"
  exit 0
fi

# ─── Deploy ─────────────────────────────────────────────────────

echo "=== Deploying SmartAgentKit Modules ==="
echo "Chain: $CHAIN (ID: $CHAIN_ID)"
echo ""

FORGE_ARGS=(
  script script/Deploy.s.sol:DeployModules
  --rpc-url "$RPC_URL"
  --broadcast
  -vvvv
)

if [[ -n "$ETHERSCAN_KEY" ]]; then
  FORGE_ARGS+=(--verify --etherscan-api-key "$ETHERSCAN_KEY")
fi

# Run deployment. Verification failures should not block address extraction,
# so we capture the exit code and only fail if the broadcast file is missing.
FORGE_EXIT=0
forge "${FORGE_ARGS[@]}" || FORGE_EXIT=$?

if [[ $FORGE_EXIT -ne 0 ]]; then
  echo ""
  echo "Warning: forge exited with code $FORGE_EXIT (verification may have failed)."
  echo "Checking for broadcast output..."
fi

# ─── Parse broadcast JSON ──────────────────────────────────────

BROADCAST_FILE="broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"

if [[ ! -f "$BROADCAST_FILE" ]]; then
  echo "Error: Broadcast file not found at $BROADCAST_FILE"
  echo "The deployment may have failed. Check forge output above."
  exit 1
fi

echo ""
echo "=== Parsing deployment addresses ==="

# Extract deployed contract addresses from Foundry broadcast JSON.
# Foundry records each CREATE transaction with contractName and contractAddress.
get_address() {
  local name="$1"
  jq -r ".transactions[] | select(.transactionType == \"CREATE\" and .contractName == \"$name\") | .contractAddress" "$BROADCAST_FILE"
}

SPENDING_LIMIT=$(get_address "SpendingLimitHook")
ALLOWLIST=$(get_address "AllowlistHook")
EMERGENCY_PAUSE=$(get_address "EmergencyPauseHook")
AUTOMATION=$(get_address "AutomationExecutor")
SETUP_HELPER=$(get_address "ModuleSetupHelper")

# Validate all addresses were found
MISSING=()
[[ -z "$SPENDING_LIMIT" ]] && MISSING+=("SpendingLimitHook")
[[ -z "$ALLOWLIST" ]] && MISSING+=("AllowlistHook")
[[ -z "$EMERGENCY_PAUSE" ]] && MISSING+=("EmergencyPauseHook")
[[ -z "$AUTOMATION" ]] && MISSING+=("AutomationExecutor")
[[ -z "$SETUP_HELPER" ]] && MISSING+=("ModuleSetupHelper")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Could not find addresses for: ${MISSING[*]}"
  echo "Check the broadcast file: $BROADCAST_FILE"
  exit 1
fi

# ─── Write deployments JSON ────────────────────────────────────

DEPLOYMENT_FILE="deployments/$CHAIN.json"
mkdir -p deployments

jq -n \
  --argjson chainId "$CHAIN_ID" \
  --arg entryPoint "0x0000000071727De22E5E9d8BAf0edAc6f37da032" \
  --arg safe7579Module "0x7579EE8307284F293B1927136486880611F20002" \
  --arg safe7579Launchpad "0x7579011aB74c46090561ea277Ba79D510c6C00ff" \
  --arg rhinestoneAttester "0x000000333034E9f539ce08819E12c1b8Cb29084d" \
  --arg hookMultiPlexer "0xF6782ed057F95f334D04F0Af1Af4D14fb84DE549" \
  --arg spendingLimitHook "$SPENDING_LIMIT" \
  --arg allowlistHook "$ALLOWLIST" \
  --arg emergencyPauseHook "$EMERGENCY_PAUSE" \
  --arg automationExecutor "$AUTOMATION" \
  --arg moduleSetupHelper "$SETUP_HELPER" \
  '{
    chainId: $chainId,
    entryPoint: $entryPoint,
    safe7579Module: $safe7579Module,
    safe7579Launchpad: $safe7579Launchpad,
    rhinestoneAttester: $rhinestoneAttester,
    hookMultiPlexer: $hookMultiPlexer,
    spendingLimitHook: $spendingLimitHook,
    allowlistHook: $allowlistHook,
    emergencyPauseHook: $emergencyPauseHook,
    automationExecutor: $automationExecutor,
    moduleSetupHelper: $moduleSetupHelper
  }' > "$DEPLOYMENT_FILE"

echo "Wrote: $DEPLOYMENT_FILE"

# Also update SDK deployment JSONs if they exist
SDK_DEPLOYMENT_DIR="../sdk/src/deployments"
if [[ -d "$SDK_DEPLOYMENT_DIR" ]]; then
  cp "$DEPLOYMENT_FILE" "$SDK_DEPLOYMENT_DIR/$CHAIN.json"
  echo "Wrote: $SDK_DEPLOYMENT_DIR/$CHAIN.json"
fi

# ─── Print summary ─────────────────────────────────────────────

echo ""
echo "=== Deployment Summary ==="
echo "Chain:              $CHAIN (ID: $CHAIN_ID)"
echo "SpendingLimitHook:  $SPENDING_LIMIT"
echo "AllowlistHook:      $ALLOWLIST"
echo "EmergencyPauseHook: $EMERGENCY_PAUSE"
echo "AutomationExecutor: $AUTOMATION"
echo "ModuleSetupHelper:  $SETUP_HELPER"
echo ""
echo "SDK moduleAddresses config:"
echo ""
echo "  moduleAddresses: {"
echo "    spendingLimitHook: \"$SPENDING_LIMIT\","
echo "    allowlistHook: \"$ALLOWLIST\","
echo "    emergencyPauseHook: \"$EMERGENCY_PAUSE\","
echo "    automationExecutor: \"$AUTOMATION\","
echo "  }"
echo ""
echo "After deploying, rebuild the SDK to pick up new addresses:"
echo "  cd ../.. && pnpm build"
