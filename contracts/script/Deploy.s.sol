// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/MockPyth.sol";
import "../src/RaptorCore.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        MockPyth pyth = new MockPyth();
        RaptorCore core = new RaptorCore(
            msg.sender, // admin
            msg.sender, // treasury
            address(usdc),
            address(pyth),
            100         // 1% fee
        );

        // Mint 100k USDC to treasury for seeding markets
        usdc.mint(msg.sender, 100_000_000_000);

        console.log("MockUSDC:   ", address(usdc));
        console.log("MockPyth:   ", address(pyth));
        console.log("RaptorCore: ", address(core));
        console.log("Next: call grantOperator(<market_ops_wallet>) on RaptorCore");

        vm.stopBroadcast();
    }
}
