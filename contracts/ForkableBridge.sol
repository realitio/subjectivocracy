// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {PolygonZkEVMBridge, IBasePolygonZkEVMGlobalExitRoot} from "@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol";
import {IPolygonZkEVMBridge} from "@RealityETH/zkevm-contracts/contracts/interfaces/IPolygonZkEVMBridge.sol";
import {TokenWrapped} from "@RealityETH/zkevm-contracts/contracts/lib/TokenWrapped.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IForkableBridge} from "./interfaces/IForkableBridge.sol";
import {IForkonomicToken} from "./interfaces/IForkonomicToken.sol";
import {ForkableStructure} from "./mixin/ForkableStructure.sol";
import {BridgeAssetOperations} from "./lib/BridgeAssetOperations.sol";

contract ForkableBridge is
    IForkableBridge,
    ForkableStructure,
    PolygonZkEVMBridge
{
    // @dev Address of the hard asset manager that can send
    // tokens to the children-bridge contracts
    address internal _hardAssetManager;

    // @dev Mapping to keep track of the allowances for the child tokens minting process
    // @param user Address of the token
    // @param token Address of the token
    // @param isChild0 Boolean to indicate if the allowance is for the first or second child-bridge contract
    // @param amount Amount of tokens allowed to be minted
    mapping(address => mapping(address => mapping(bool => uint256)))
        public childTokenAllowances;

    // @inheritdoc IForkableBridge
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
    ) public virtual initializer {
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

    /**
     * @notice Function to send hard assets to the children-bridge contracts
     * @param token Address of the token
     * @param amount Amount of tokens to transfer
     * @param to Address to transfer the tokens to
     */
    function transferHardAssetsToChild(
        address token,
        uint256 amount,
        address to
    ) external onlyAfterForking {
        require(_hardAssetManager == msg.sender, "Not authorized");
        require(to == children[0] || to == children[1], "Invalid to address");
        IERC20(token).transfer(to, amount);
    }

    /**
     * @notice Function to check if an index is claimed or not
     * @param index Index. function is overridden to check for a potential
     * claim in the parent contract
     * note: This function is recursive and could run into stack too deep issues
     * hence users need to claim their tokens before several forks happened.
     */
    function isClaimed(uint256 index) public view override returns (bool) {
        if (depositCount < index) {
            return false;
        }
        bool isClaimedInCurrentContract = PolygonZkEVMBridge.isClaimed(index);
        if (isClaimedInCurrentContract) {
            return true;
        }
        if (parentContract != address(0)) {
            // Also check the parent contract for claims if it is set
            return ForkableBridge(parentContract).isClaimed(index);
        } else {
            return false;
        }
    }

    /**
     * @notice Function to check that an index is not claimed and set it as claimed
     * @param index Index
     */
    function _setAndCheckClaimed(uint256 index) internal override {
        // Additional to the normal implemenation, we also check the parent contract
        // for already claimed indexes
        if (parentContract != address(0)) {
            if (ForkableBridge(parentContract).isClaimed(index)) {
                revert AlreadyClaimed();
            }
        }
        PolygonZkEVMBridge._setAndCheckClaimed(index);
    }

    // @inheritdoc IForkableBridge
    function createChild1() external onlyForkManger returns (address) {
        // process all pending deposits/messages before coping over the state root.
        updateGlobalExitRoot();
        return _createChild1();
    }

    // @inheritdoc IForkableBridge
    function createChild2(
        address implementation
    ) external onlyForkManger returns (address) {
        // process all pending deposits/messages before coping over the state root.
        updateGlobalExitRoot();
        return _createChild2(implementation);
    }

    // @inheritdoc IForkableBridge
    function createChildren(
        address implementation
    ) external onlyForkManger returns (address, address) {
        // process all pending deposits/messages before coping over the state root.
        updateGlobalExitRoot();
        return _createChildren(implementation);
    }

    // @inheritdoc IForkableBridge
    function mintForkableToken(
        address token,
        uint32 originNetwork,
        uint256 amount,
        bytes calldata metadata,
        address destinationAddress
    ) external onlyParent {
        require(originNetwork != networkID, "Token is from this network");
        _issueBridgedTokens(
            originNetwork,
            token,
            metadata,
            destinationAddress,
            amount
        );
    }

    function prepareSplittinTokens(
        address token,
        uint256 amount
    ) public onlyAfterForking {
        TokenWrapped(token).burn(msg.sender, amount);
        childTokenAllowances[msg.sender][token][true] += amount;
        childTokenAllowances[msg.sender][token][false] += amount;
    }

    // @inheritdoc IForkableBridge
    function splitTokenIntoChildTokens(
        address token,
        uint256 amount
    ) external onlyAfterForking {
        prepareSplittinTokens(token, amount);
        createChildToken(token, amount, true);
        createChildToken(token, amount, false);
    }

    // @inheritdoc IForkableBridge
    function createChildToken(
        address token,
        uint256 amount,
        bool firstChild
    ) public onlyAfterForking {
        require(
            childTokenAllowances[msg.sender][token][firstChild] >= amount,
            "Not enough allowance"
        );
        childTokenAllowances[msg.sender][token][firstChild] -= amount;
        BridgeAssetOperations.createChildToken(
            token,
            amount,
            wrappedTokenToTokenInfo[token],
            firstChild ? children[0] : children[1]
        );
    }

    // @inheritdoc IForkableBridge
    function burnForkableTokens(
        address user,
        address originTokenAddress,
        uint32 originNetwork,
        uint256 amount
    ) external onlyParent {
        bytes32 infoHash = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );
        TokenWrapped(tokenInfoToWrappedToken[infoHash]).burn(user, amount);
    }

    // @inheritdoc IForkableBridge
    function mergeChildTokens(
        address token,
        uint256 amount
    ) external onlyAfterForking {
        BridgeAssetOperations.mergeChildTokens(
            token,
            amount,
            wrappedTokenToTokenInfo[token],
            children[0],
            children[1]
        );
    }

    /**
     * @dev Allows the forkmanager to take out the forkonomic tokens
     * and send them to the children-bridge contracts
     * Notice that forkonomic tokens are special, as they their main contract
     * is on L1, but they are still forkable tokens as all the tokens from
     * @param firstChild boolean indicating for which child the operation should be run
     */
    function sendForkonomicTokensToChild(
        bool firstChild
    ) public onlyForkManger onlyAfterForking {
        BridgeAssetOperations.sendForkonomicTokensToChild(
            gasTokenAddress,
            firstChild ? children[0] : children[1],
            firstChild
        );
    }

    /////////////////////////////////////////////////////
    // Overwriting function to disable them after forking
    /////////////////////////////////////////////////////

    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    )
        public
        payable
        override(PolygonZkEVMBridge, IPolygonZkEVMBridge)
        onlyBeforeCreatingChild1
    {
        PolygonZkEVMBridge.bridgeAsset(
            destinationNetwork,
            destinationAddress,
            amount,
            token,
            forceUpdateGlobalExitRoot,
            permitData
        );
    }

    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    )
        public
        payable
        virtual
        override(PolygonZkEVMBridge, IPolygonZkEVMBridge)
        onlyBeforeCreatingChild1
    {
        PolygonZkEVMBridge.bridgeMessage(
            destinationNetwork,
            destinationAddress,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }

    function claimMessage(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    )
        public
        override(IPolygonZkEVMBridge, PolygonZkEVMBridge)
        onlyBeforeCreatingChild1
    {
        PolygonZkEVMBridge.claimMessage(
            smtProof,
            index,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );
    }

    function claimAsset(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    )
        public
        override(IPolygonZkEVMBridge, PolygonZkEVMBridge)
        onlyBeforeCreatingChild1
    {
        PolygonZkEVMBridge.claimAsset(
            smtProof,
            index,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );
    }

    ///////////////////////////////
    /// View functions
    ////////////////////////////////

    function getHardAssetManager() external view returns (address) {
        return _hardAssetManager;
    }

    function getLastUpdatedDepositCount() external view returns (uint32) {
        return lastUpdatedDepositCount;
    }

    function getBranch()
        external
        view
        returns (bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] memory)
    {
        return branch;
    }
}
