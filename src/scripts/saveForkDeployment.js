/* eslint-disable import/no-dynamic-require, global-require */
/* eslint-disable no-await-in-loop, no-constant-condition, no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const fs = require('fs');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const common = require('../common/common');

const FILTER_RANGE = 1000;

async function main() {
    const args = process.argv.slice(2);
    const deploymentName = args[0];
    const whichFork = parseInt(args[1], 10);

    if (whichFork !== 1 && whichFork !== 2) {
        throw new Error('Usage: node saveForkDeployment.js <old_deployment> <1_or_2> [<fork_block_number]> [<new_name>]');
    }

    /*
     * Optionally we can specify the block number to avoid a slow log lookup
     * If you pass nothing or "0" we will try to fetch it automatically
     */
    let forkBlockNumber = args.length >= 3 ? parseInt(args[2], 10) : 0;

    // Optionally you can pass in the name of the new chain, otherwise we'll add _1 or _2 to the old chain
    const newDeploymentName = args.length >= 4 ? args[3] : `${deploymentName}_${whichFork}`;

    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);

    const oldDeploymentPath = path.resolve(__dirname, `../../deployments/${deploymentName}`);
    const newDeploymentPath = path.resolve(__dirname, `../../deployments/${newDeploymentName}`);

    if (fs.existsSync(newDeploymentPath)) {
        throw new Error(`New deployment directory already exists. Delete it to create it fresh. ${newDeploymentPath}`);
    }

    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const parentForkingManagerAddress = deploymentOutput.forkingManager;
    console.log('looking up children of', parentForkingManagerAddress);

    const parentForkingManager = (await ethers.getContractAt(
        'contracts/ForkingManager.sol:ForkingManager',
        parentForkingManagerAddress,
    )).connect(deployer);

    const parentZkEVMAddress = await parentForkingManager.zkEVM();
    const parentZkEVM = (await ethers.getContractAt(
        'contracts/ForkableZkEVM.sol:ForkableZkEVM',
        parentZkEVMAddress,
    )).connect(deployer);

    const children = await parentForkingManager.getChildren();
    const forkingManagerAddress = children[whichFork - 1];

    const forkingManager = (await ethers.getContractAt(
        'contracts/ForkingManager.sol:ForkingManager',
        forkingManagerAddress,
    )).connect(deployer);

    const polygonZkEVMAddress = await forkingManager.zkEVM();
    const zkevm = (await ethers.getContractAt(
        'contracts/ForkableZkEVM.sol:ForkableZkEVM',
        polygonZkEVMAddress,
    )).connect(deployer);

    deployParameters.chainID = (await zkevm.chainID()).toNumber();
    deploymentOutput.chainID = deployParameters.chainID; // TODO: This should probably only appear in one
    deployParameters.arbitrationFee = (await forkingManager.arbitrationFee()).toString();

    deploymentOutput.polygonZkEVMAddress = polygonZkEVMAddress;

    deploymentOutput.polygonZkEVMBridgeAddress = await forkingManager.bridge();
    deploymentOutput.polygonZkEVMGlobalExitRootAddress = await forkingManager.globalExitRoot();
    deploymentOutput.forkingManager = await forkingManagerAddress;
    deploymentOutput.maticTokenAddress = await forkingManager.forkonomicToken();

    const lastVerifiedBatch = await parentZkEVM.lastVerifiedBatch();
    deploymentOutput.genesisRoot = await parentZkEVM.batchNumToStateRoot(lastVerifiedBatch);

    let endBlock = await ethers.provider.getBlockNumber();
    const initializedFilter = forkingManager.filters.Initialized();
    if (forkBlockNumber === 0) {
        console.log('Searching back through logs for the fork block number. If this takes too long you may prefer to pass it manually.');
        while (true) {
            let startBlock = endBlock - FILTER_RANGE;
            if (startBlock < 0) {
                startBlock = 0;
            }
            // console.log('searching log range', startBlock, endBlock);
            const pastEvents = await forkingManager.queryFilter(initializedFilter, startBlock, endBlock);
            if (pastEvents.length > 0) {
                forkBlockNumber = pastEvents[0].blockNumber;
                console.log('Found fork block number at', forkBlockNumber);
                break;
            }
            if (startBlock === 0) {
                console.log('Fork block not found, you may be able to set it manually.');
                break;
            }
            endBlock = startBlock - 1;
        }
    }

    deploymentOutput.deploymentBlockNumber = forkBlockNumber;

    console.log('Saving new deployment at', newDeploymentPath);
    fs.cpSync(oldDeploymentPath, newDeploymentPath, { recursive: true });

    fs.writeFileSync(`${newDeploymentPath}/deploy_output.json`, JSON.stringify(deploymentOutput, null, 1));
    fs.writeFileSync(`${newDeploymentPath}/deploy_parameters.json`, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
