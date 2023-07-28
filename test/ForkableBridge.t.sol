pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {ForkableBridge} from "../development/contracts/ForkableBridge.sol";
import {ForkableBridgeWrapper} from "./testcontract/ForkableBridgeWrapper.sol";
import {ForkonomicToken} from "../development/contracts/ForkonomicToken.sol";
import {ForkableGlobalExitRoot} from "../development/contracts/ForkableGlobalExitRoot.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PolygonZkEVMBridge} from "@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol";
import {ForkableGlobalExitRoot} from "./ForkableGlobalExitRoot.t.sol";
import {IBasePolygonZkEVMGlobalExitRoot} from "@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol";
import {ERC20PresetMinterPauser} from "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract ForkableBridgeTest is Test {
    ForkableBridgeWrapper public forkableBridge;
    IERC20Upgradeable public token = IERC20Upgradeable(address(0x987654));

    address public forkmanager = address(0x123);
    address public parentContract = address(0);
    address public polygonZkEVMaddress = address(0x789);
    address public gasTokenAddress = address(0xabc);
    uint32 public networkID = 11;
    bool public isDeployedOnL2 = true;
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager =
        IBasePolygonZkEVMGlobalExitRoot(address(0xdef));
    address hardAssetManger = address(0xde34f);
    bytes32[32] depositTree;

    function setUp() public {
        address bridgeImplementation = address(new ForkableBridgeWrapper());
        forkableBridge = ForkableBridgeWrapper(
            address(new ERC1967Proxy(bridgeImplementation, ""))
        );
        forkableBridge.initialize(
            forkmanager,
            parentContract,
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            2,
            depositTree
        );
    }

    function testInitialize() public {
        assertEq(forkableBridge.forkmanager(), forkmanager);
        assertEq(forkableBridge.parentContract(), parentContract);
        assertEq(forkableBridge.networkID(), networkID);
        assertEq(
            address(forkableBridge.globalExitRootManager()),
            address(_globalExitRootManager)
        );
        assertEq(forkableBridge.polygonZkEVMaddress(), polygonZkEVMaddress);
        assertEq(forkableBridge.gasTokenAddress(), gasTokenAddress);
        assertEq(forkableBridge.isDeployedOnL2(), isDeployedOnL2);
    }

    function testCreateChildren() public {
        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        vm.expectRevert(bytes("Only forkManager is allowed"));
        forkableBridge.createChildren(secondBridgeImplementation);
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );

        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );
        assertTrue(child1 != address(0));
        assertTrue(child2 != address(0));
    }

    function testMintForkableToken() public {
        uint32 originNetwork = 2;
        uint256 amount = 100 * (10 ** 18);
        bytes memory metadata = abi.encode("name", "symbol", uint8(18));
        address destinationAddress = address(this);
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, token)
        );

        vm.expectRevert(bytes("Only available for parent"));
        forkableBridge.mintForkableToken(
            address(token),
            originNetwork,
            amount,
            metadata,
            destinationAddress
        );

        vm.prank(forkableBridge.parentContract());
        vm.expectRevert(bytes("Token is from this network"));
        forkableBridge.mintForkableToken(
            address(token),
            networkID, // <-- this line is changed
            amount,
            metadata,
            destinationAddress
        );

        vm.prank(forkableBridge.parentContract());
        forkableBridge.mintForkableToken(
            address(token),
            originNetwork,
            amount,
            metadata,
            destinationAddress
        );

        address newWrappedToken = forkableBridge.tokenInfoToWrappedToken(
            tokenInfoHash
        );
        (
            uint32 originNetworkFromContract,
            address originTokenAddress
        ) = forkableBridge.wrappedTokenToTokenInfo(newWrappedToken);

        assertEq(originNetworkFromContract, originNetwork);
        assertEq(originTokenAddress, address(token));
        assertEq(
            IERC20Upgradeable(newWrappedToken).balanceOf(destinationAddress),
            amount
        );
    }

    function testBurnForkableToken() public {
        uint32 originNetwork = 2;
        uint256 amount = 100 * (10 ** 18);
        bytes memory metadata = abi.encode("name", "symbol", uint8(18));
        address destinationAddress = address(this);
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, token)
        );

        vm.prank(forkableBridge.parentContract());
        forkableBridge.mintForkableToken(
            address(token),
            originNetwork,
            amount,
            metadata,
            destinationAddress
        );

        address newWrappedToken = forkableBridge.tokenInfoToWrappedToken(
            tokenInfoHash
        );
        (
            uint32 originNetworkFromContract,
            address originTokenAddress
        ) = forkableBridge.wrappedTokenToTokenInfo(newWrappedToken);

        assertEq(originNetworkFromContract, originNetwork);
        assertEq(originTokenAddress, address(token));
        assertEq(
            IERC20Upgradeable(newWrappedToken).balanceOf(destinationAddress),
            amount
        );

        vm.expectRevert(bytes("Only available for parent"));
        forkableBridge.burnForkableTokens(
            destinationAddress,
            originTokenAddress,
            originNetworkFromContract,
            amount
        );
        vm.prank(forkableBridge.parentContract());
        vm.expectRevert(bytes("ERC20: burn amount exceeds balance"));
        forkableBridge.burnForkableTokens(
            destinationAddress,
            originTokenAddress,
            originNetworkFromContract,
            amount + 1
        );
        vm.prank(forkableBridge.parentContract());
        forkableBridge.burnForkableTokens(
            destinationAddress,
            originTokenAddress,
            originNetworkFromContract,
            amount
        );

        assertEq(
            IERC20Upgradeable(newWrappedToken).balanceOf(destinationAddress),
            0
        );
    }

    function testSplitTokenIntoChildTokens() public {
        // Setup parameters
        uint32 originNetwork = 2;
        uint256 amount = 100 * (10 ** 18);
        bytes memory metadata = abi.encode("name", "symbol", uint8(18));
        address destinationAddress = address(this);
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, token)
        );

        // Testing revert if children are not yet created
        vm.expectRevert(bytes("Children not created yet"));
        forkableBridge.splitTokenIntoChildTokens(
            address(token),
            originNetwork,
            amount
        );

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );
        // Testing revert if token was not bridged before (i.e. is not forkable)
        vm.expectRevert(bytes("Token not forkable"));
        forkableBridge.splitTokenIntoChildTokens(
            address(token),
            originNetwork,
            amount
        );

        // Create forkable token
        vm.prank(forkableBridge.parentContract());
        forkableBridge.mintForkableToken(
            address(token),
            originNetwork,
            amount,
            metadata,
            destinationAddress
        );

        address forkableToken = forkableBridge.tokenInfoToWrappedToken(
            tokenInfoHash
        );

        // initialize the child contracts to set the parent contract
        ForkableBridge(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            0,
            depositTree
        );
        ForkableBridge(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            0,
            depositTree
        );

        // splitting fails, if sender does not have the funds
        vm.prank(address(0x234234));
        vm.expectRevert(bytes("ERC20: burn amount exceeds balance"));
        forkableBridge.splitTokenIntoChildTokens(
            forkableToken,
            originNetwork,
            amount
        );

        // Split the token
        forkableBridge.splitTokenIntoChildTokens(
            forkableToken,
            originNetwork,
            amount
        );

        // Assert token balances
        address forkableTokenChild1 = ForkableBridge(child1)
            .tokenInfoToWrappedToken(tokenInfoHash);
        address forkableTokenChild2 = ForkableBridge(child2)
            .tokenInfoToWrappedToken(tokenInfoHash);
        uint256 child1Balance = IERC20Upgradeable(forkableTokenChild1)
            .balanceOf(destinationAddress);
        uint256 child2Balance = IERC20Upgradeable(forkableTokenChild2)
            .balanceOf(destinationAddress);
        assertEq(child1Balance, amount);
        assertEq(child2Balance, amount);

        // Assert token was burned from the parent contract
        uint256 parentBalance = IERC20Upgradeable(forkableToken).balanceOf(
            destinationAddress
        );
        assertEq(parentBalance, 0);
    }

    function testMergeChildTokens() public {
        // Setup parameters
        uint32 originNetwork = 2;
        uint256 amount = 100 * (10 ** 18);
        bytes memory metadata = abi.encode("name", "symbol", uint8(18));
        address destinationAddress = address(this);
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, token)
        );

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );

        // Create forkable token
        vm.prank(forkableBridge.parentContract());
        forkableBridge.mintForkableToken(
            address(token),
            originNetwork,
            amount,
            metadata,
            destinationAddress
        );

        address forkableToken = forkableBridge.tokenInfoToWrappedToken(
            tokenInfoHash
        );
        for (uint i = 0; i < 32; i++) {
            depositTree[i] = forkableBridge.branch(i);
        }
        // initialize the child contracts to set the parent contract
        ForkableBridge(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount(),
            depositTree
        );
        ForkableBridge(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount(),
            depositTree
        );

        // Split the token
        forkableBridge.splitTokenIntoChildTokens(
            forkableToken,
            originNetwork,
            amount
        );

        // Only parent can merge
        vm.expectRevert(bytes("Children not created yet"));
        ForkableBridge(child1).mergeChildTokens(forkableToken, amount + 1);

        // Merge the token
        vm.expectRevert(bytes("ERC20: burn amount exceeds balance"));
        forkableBridge.mergeChildTokens(forkableToken, amount + 1);

        forkableBridge.mergeChildTokens(forkableToken, amount);

        // Assert token balances
        address forkableTokenChild1 = ForkableBridge(child1)
            .tokenInfoToWrappedToken(tokenInfoHash);
        address forkableTokenChild2 = ForkableBridge(child2)
            .tokenInfoToWrappedToken(tokenInfoHash);
        uint256 child1Balance = IERC20Upgradeable(forkableTokenChild1)
            .balanceOf(destinationAddress);
        uint256 child2Balance = IERC20Upgradeable(forkableTokenChild2)
            .balanceOf(destinationAddress);
        assertEq(child1Balance, 0);
        assertEq(child2Balance, 0);

        // Assert token was burned from the parent contract
        uint256 parentBalance = IERC20Upgradeable(forkableToken).balanceOf(
            destinationAddress
        );
        assertEq(parentBalance, amount);
    }

    function testNoDepostOrClaimingAfterForking() public {
        address secondBridgeImplementation = address(new ForkableBridge());
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );

        vm.prank(forkableBridge.forkmanager());
        forkableBridge.createChildren(secondBridgeImplementation);

        vm.expectRevert(bytes("No changes after forking"));
        forkableBridge.bridgeAsset(
            12,
            address(0x3),
            15,
            address(0x3),
            true,
            bytes("0x3453")
        );

        vm.expectRevert(bytes("No changes after forking"));
        forkableBridge.bridgeMessage(2, address(0x45), false, bytes("0x3453"));

        bytes32[32] memory smtProof;
        vm.expectRevert(bytes("No changes after forking"));
        forkableBridge.claimMessage(
            smtProof,
            2,
            bytes32("0x1233"),
            bytes32("0x1233"),
            3,
            address(0x1232),
            12,
            address(0x1231),
            123,
            bytes("0x")
        );

        vm.expectRevert(bytes("No changes after forking"));
        forkableBridge.claimAsset(
            smtProof,
            32,
            bytes32("0x1233"),
            bytes32("0x1233"),
            3,
            address(0x1232),
            12,
            address(0x1231),
            123,
            bytes("0x")
        );
    }

    function testIsClaimedOnParent() public {
        uint256 index = 1;

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );

        // initialize the child contracts to set the parent contract
        ForkableBridge(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount() + uint32(index),
            depositTree
        );
        ForkableBridge(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount() + uint32(index),
            depositTree
        );
        assertEq(forkableBridge.isClaimed(index), false);
        assertEq(ForkableBridge(child1).isClaimed(index), false);
        assertEq(ForkableBridge(child2).isClaimed(index), false);

        ForkableBridgeWrapper(child2).setClaimedBit(index);

        assertEq(forkableBridge.isClaimed(index), false);
        assertEq(ForkableBridge(child1).isClaimed(index), false);
        assertEq(ForkableBridge(child2).isClaimed(index), true);

        forkableBridge.setClaimedBit(index);

        assertEq(ForkableBridge(child1).isClaimed(index), true);
        assertEq(ForkableBridge(child2).isClaimed(index), true);
    }

    function testIsClaimedOnParentIsConsideringLastDepositUpdate() public {
        uint256 index = 1;

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );

        // initialize the child contracts to set the parent contract
        ForkableBridgeWrapper(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            uint32(index + 10),
            depositTree
        );
        ForkableBridgeWrapper(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            uint32(index + 10),
            depositTree
        );
        assertEq(forkableBridge.isClaimed(index), false);
        assertEq(ForkableBridge(child1).isClaimed(index), false);
        assertEq(ForkableBridge(child2).isClaimed(index), false);

        uint32 nonReachedIndexInParent = 3;
        forkableBridge.setClaimedBit(nonReachedIndexInParent);
        assertEq(
            ForkableBridge(child1).isClaimed(nonReachedIndexInParent),
            false
        );
        assertEq(
            ForkableBridge(child2).isClaimed(nonReachedIndexInParent),
            false
        );

        ForkableBridgeWrapper(child2).setClaimedBit(nonReachedIndexInParent);
        assertEq(
            ForkableBridge(child2).isClaimed(nonReachedIndexInParent),
            true
        );
    }

    function test_SetAndCheckClaimed() public {
        uint256 index = 1;

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );

        // initialize the child contracts to set the parent contract
        ForkableBridge(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount() + uint32(index),
            depositTree
        );
        ForkableBridge(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount() + uint32(index),
            depositTree
        );

        assertEq(forkableBridge.isClaimed(index), false);
        assertEq(ForkableBridge(child1).isClaimed(index), false);
        assertEq(ForkableBridge(child2).isClaimed(index), false);

        forkableBridge.setClaimedBit(index);

        bytes4 selector = bytes4(keccak256("AlreadyClaimed()"));
        vm.expectRevert(selector);
        forkableBridge.setAndCheckClaimed(index);
        vm.expectRevert(selector);
        ForkableBridgeWrapper(child1).setAndCheckClaimed(index);
        vm.expectRevert(selector);
        ForkableBridgeWrapper(child2).setAndCheckClaimed(index);
    }

    function testManageHardAssets() public {
        ERC20PresetMinterPauser erc20Token = new ERC20PresetMinterPauser(
            "Test",
            "TST"
        );
        uint256 amount = 100 * (10 ** 18);
        address to = address(this);
        erc20Token.mint(to, amount);
        erc20Token.approve(address(forkableBridge), amount);
        forkableBridge.bridgeAsset(
            1,
            to,
            amount,
            address(erc20Token),
            false,
            ""
        );
        vm.expectRevert("only after fork");
        vm.prank(hardAssetManger);
        forkableBridge.manageHardAssets(address(erc20Token), amount, to);

        address secondBridgeImplementation = address(
            new ForkableBridgeWrapper()
        );
        ForkableGlobalExitRoot exitRoot = new ForkableGlobalExitRoot();
        vm.mockCall(
            address(_globalExitRootManager),
            abi.encodeWithSelector(
                exitRoot.updateExitRoot.selector,
                bytes32("0")
            ),
            ""
        );
        vm.prank(forkableBridge.forkmanager());
        (address child1, address child2) = forkableBridge.createChildren(
            secondBridgeImplementation
        );

        // initialize the child contracts to set the parent contract
        ForkableBridge(child1).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount(),
            depositTree
        );
        ForkableBridge(child2).initialize(
            forkmanager,
            address(forkableBridge),
            networkID,
            _globalExitRootManager,
            polygonZkEVMaddress,
            gasTokenAddress,
            isDeployedOnL2,
            hardAssetManger,
            forkableBridge.lastUpdatedDepositCount(),
            depositTree
        );

        vm.expectRevert("Not authorized");
        forkableBridge.manageHardAssets(address(erc20Token), amount, to);

        vm.expectRevert("Invalid to address");
        vm.prank(hardAssetManger);
        forkableBridge.manageHardAssets(
            address(erc20Token),
            amount,
            address(0x23453465)
        );
        assertEq(erc20Token.balanceOf(address(forkableBridge)), amount);

        vm.prank(hardAssetManger);
        forkableBridge.manageHardAssets(address(erc20Token), amount, child2);

        assertEq(erc20Token.balanceOf(child2), amount);
        assertEq(erc20Token.balanceOf(address(forkableBridge)), 0);
    }
}
