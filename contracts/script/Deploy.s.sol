// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DuelEscrow} from "../src/DuelEscrow.sol";

interface Vm {
    function envUint(string calldata name) external view returns (uint256);
    function envAddress(string calldata name) external view returns (address);
    function startBroadcast(uint256 key) external;
    function stopBroadcast() external;
}

/// DEPLOYER_PRIVATE_KEY=… DUEL_REFEREE=0x… forge script script/Deploy.s.sol --rpc-url base --broadcast
contract Deploy {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant TREASURY = 0xba3F8fCE8DC521Cddcb6DCA1720b84AD59F868F6;

    function run() external returns (DuelEscrow escrow) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        escrow = new DuelEscrow(TREASURY, vm.envAddress("DUEL_REFEREE"));
        vm.stopBroadcast();
    }
}
