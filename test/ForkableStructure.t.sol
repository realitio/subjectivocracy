pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {ForkableStructureWrapper} from "./testcontract/ForkableStructureWrapper.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Util} from "./utils/Util.sol";

contract ForkStructureTest is Test {
    bytes32 internal constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    ForkableStructureWrapper public forkStructure;

    address public forkableStructureImplementation;

    address public forkmanager = address(0x123);
    address public parentContract = address(0x456);

    function setUp() public {
        forkStructure = new ForkableStructureWrapper();
        forkStructure.initialize(forkmanager, parentContract);
    }

    function testInitialize() public {
        assertEq(forkStructure.forkmanager(), forkmanager);
        assertEq(forkStructure.parentContract(), parentContract);
    }

    function testGetChildren() public {
        address child1 = address(0x789);
        address child2 = address(0xabc);
        // assume the contract has a setChild function
        forkStructure.setChild(0, child1);
        forkStructure.setChild(1, child2);
        (address returnedChild1, address returnedChild2) = forkStructure
            .getChildren();
        assertEq(returnedChild1, child1);
        assertEq(returnedChild2, child2);
    }

    function testCreateChildren() public {
        forkableStructureImplementation = address(
            new ForkableStructureWrapper()
        );
        forkStructure = ForkableStructureWrapper(
            address(new ERC1967Proxy(forkableStructureImplementation, ""))
        );
        forkStructure.initialize(forkmanager, parentContract);
        address secondForkableStructureImplementation = address(
            new ForkableStructureWrapper()
        );

        (address child1, address child2) = forkStructure.createChildren(
            secondForkableStructureImplementation
        );

        // child1 and child2 addresses should not be zero address
        assertTrue(child1 != address(0));
        assertTrue(child2 != address(0));

        // the implementation address of children should match the expected ones
        assertEq(
            Util.bytesToAddress(vm.load(address(child1), _IMPLEMENTATION_SLOT)),
            forkableStructureImplementation
        );
        assertEq(
            Util.bytesToAddress(vm.load(address(child2), _IMPLEMENTATION_SLOT)),
            secondForkableStructureImplementation
        );
    }
}
