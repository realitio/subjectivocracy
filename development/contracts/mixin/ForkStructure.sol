pragma solidity ^0.8.17;

import "../interfaces/IForkableStructure.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ForkStructure is IForkableStructure, Initializable {
    // The forkmanager is the only one who can clone the instances and create children
    address public forkmanager;

    // The parent contract is the one that was forked during this contract initiation
    address public parentContract;

    // The children are the two instances that are created during the fork
    // Actually an array would address[] public children = new address[](2) be the natural fit, 
    // but this would make the initialization more complex due to proxy construction.
    mapping(uint256 => address) public children;

    function initialize(address _forkmanager, address _parentContract) public virtual onlyInitializing {
        forkmanager = _forkmanager;
        parentContract = _parentContract;
    }

    modifier onlyParent() {
        require(msg.sender == parentContract);
        _;
    }

    modifier onlyForkManger() {
        require(msg.sender == forkmanager);
        _;
    }

    function getChild(uint256 index) external view returns (address) {
        return children[index];
    }

    function getChildren() external view returns (address, address) {
        return (children[0], children[1]);
    }
}
