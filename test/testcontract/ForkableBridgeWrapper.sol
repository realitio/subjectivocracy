pragma solidity ^0.8.20;

import {ForkableBridge} from "../../contracts/ForkableBridge.sol";
import {IBasePolygonZkEVMGlobalExitRoot} from "@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol";
import {PolygonZkEVMBridge, IBasePolygonZkEVMGlobalExitRoot} from "@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol";
import {IPolygonZkEVMBridge} from "@RealityETH/zkevm-contracts/contracts/interfaces/IPolygonZkEVMBridge.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {TokenWrapped} from "@RealityETH/zkevm-contracts/contracts/lib/TokenWrapped.sol";
import {IForkableBridge} from "../../contracts/interfaces/IForkableBridge.sol";
import {IForkonomicToken} from "../../contracts/interfaces/IForkonomicToken.sol";
import {ForkableStructure} from "../../contracts/mixin/ForkableStructure.sol";

contract ForkableBridgeWrapper is ForkableBridge {
    function initialize(
        address _forkmanager,
        address _parentContract,
        uint32 _networkID,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonZkEVMaddress,
        address _gasTokenAddress,
        bool _isDeployedOnL2,
        address hardAssetManager,
        uint32 lastUpdatedDepositCount,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata depositTreeHashes
    ) public override initializer {
        // The following code is copied from the ForkableBridge contract
        // ForkableBridge.initialize() is avoided to make ForkableBridge.initialize() an initializer
        ForkableStructure.initialize(_forkmanager, _parentContract);
        PolygonZkEVMBridge.initialize(
            _networkID,
            _globalExitRootManager,
            _polygonZkEVMaddress,
            _gasTokenAddress,
            _isDeployedOnL2,
            lastUpdatedDepositCount,
            depositTreeHashes
        );
        _hardAssetManager = hardAssetManager;
    }

    function setAndCheckClaimed(uint256 index) public {
        _setAndCheckClaimed(index);
    }

    function setLastUpdatedDepositCount(uint32 nr) public {
        lastUpdatedDepositCount = nr;
    }

    function setClaimedBit(uint256 index) public {
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(index);
        uint256 mask = (1 << bitPos);
        claimedBitMap[wordPos] = mask;
    }
}
