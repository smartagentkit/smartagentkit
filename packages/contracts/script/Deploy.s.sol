// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Script.sol";
import { SpendingLimitHook } from "../src/modules/SpendingLimitHook.sol";
import { AllowlistHook } from "../src/modules/AllowlistHook.sol";
import { EmergencyPauseHook } from "../src/modules/EmergencyPauseHook.sol";
import { AutomationExecutor } from "../src/modules/AutomationExecutor.sol";
import { ModuleSetupHelper } from "../src/factory/ModuleSetupHelper.sol";

/**
 * @title Deploy SmartAgentKit Modules
 * @notice Deploys all 4 ERC-7579 modules + ModuleSetupHelper for SmartAgentKit.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:DeployModules \
 *     --rpc-url $BASE_SEPOLIA_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvvv
 *
 *   For Sepolia:
 *   forge script script/Deploy.s.sol:DeployModules \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY \
 *     -vvvv
 */
contract DeployModules is Script {
    function run() external {
        // Support either private key or mnemonic
        uint256 deployerKey;
        string memory mnemonic = vm.envOr("DEPLOYER_MNEMONIC", string(""));
        if (bytes(mnemonic).length > 0) {
            uint32 index = uint32(vm.envOr("DEPLOYER_ADDRESS_INDEX", uint256(0)));
            deployerKey = vm.deriveKey(mnemonic, index);
        } else {
            deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        }
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. SpendingLimitHook
        SpendingLimitHook spendingLimit = new SpendingLimitHook();
        console.log("SpendingLimitHook:", address(spendingLimit));

        // 2. AllowlistHook
        AllowlistHook allowlist = new AllowlistHook();
        console.log("AllowlistHook:    ", address(allowlist));

        // 3. EmergencyPauseHook
        EmergencyPauseHook emergencyPause = new EmergencyPauseHook();
        console.log("EmergencyPauseHook:", address(emergencyPause));

        // 4. AutomationExecutor
        AutomationExecutor automation = new AutomationExecutor();
        console.log("AutomationExecutor:", address(automation));

        // 5. ModuleSetupHelper
        ModuleSetupHelper setupHelper = new ModuleSetupHelper();
        console.log("ModuleSetupHelper: ", address(setupHelper));

        vm.stopBroadcast();

        // Print summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Chain ID:           ", block.chainid);
        console.log("SpendingLimitHook:  ", address(spendingLimit));
        console.log("AllowlistHook:      ", address(allowlist));
        console.log("EmergencyPauseHook: ", address(emergencyPause));
        console.log("AutomationExecutor: ", address(automation));
        console.log("ModuleSetupHelper:  ", address(setupHelper));
        console.log("");
        console.log("Add these to your SDK config:");
        console.log("  moduleAddresses: {");
        console.log("    spendingLimitHook: \"", address(spendingLimit), "\",");
        console.log("    allowlistHook: \"", address(allowlist), "\",");
        console.log("    emergencyPauseHook: \"", address(emergencyPause), "\",");
        console.log("    automationExecutor: \"", address(automation), "\",");
        console.log("    moduleSetupHelper: \"", address(setupHelper), "\",");
        console.log("  }");
    }
}
