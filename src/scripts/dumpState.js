/* eslint-disable import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const common = require('../common/common');

async function main() {
    const args = process.argv.slice(2);
    const deploymentName = args[0];

    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);

    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const forkingManagerAddress = (args.length > 1) ? args[1] : deploymentOutput.forkingManager;

    const forkingManager = (await ethers.getContractAt(
        'contracts/ForkingManager.sol:ForkingManager',
        forkingManagerAddress,
    )).connect(deployer);

    const polygonZkEVMAddress = await forkingManager.zkEVM();
    const zkevm = (await ethers.getContractAt(
        'contracts/ForkableZkEVM.sol:ForkableZkEVM',
        polygonZkEVMAddress,
    )).connect(deployer);

    const globalExitRootAddress = await forkingManager.globalExitRoot();
    const globalExitRoot = (await ethers.getContractAt(
        'contracts/ForkableGlobalExitRoot.sol:ForkableGlobalExitRoot',
        globalExitRootAddress,
    )).connect(deployer);

    console.log('ZKEVM', polygonZkEVMAddress);
    console.log('Global Exit Root', globalExitRootAddress);
    console.log('Owner', await zkevm.owner());
    console.log('Fork ID', (await zkevm.forkID()).toString());
    console.log('Verifier', (await zkevm.rollupVerifier()).toString());
    console.log('Aggregator', (await zkevm.trustedAggregator()).toString());
    console.log('Chain ID', (await zkevm.chainID()).toString());
    console.log('Fork Manager', forkingManagerAddress);
    console.log('Token', await forkingManager.forkonomicToken());
    console.log('Bridge', await forkingManager.bridge());
    console.log('Parent', await zkevm.parentContract());
    console.log('trustedSequencerURL', await zkevm.trustedSequencerURL());

    const lastPendingState = await zkevm.lastPendingState();
    console.log('Last pending state', lastPendingState);
    console.log('Last batch sequenced', await zkevm.lastBatchSequenced());
    console.log('Last batch verified', await zkevm.lastVerifiedBatch());
    console.log('Pending state transitions', await zkevm.pendingStateTransitions(lastPendingState));

    console.log('Exit root Bridge', await globalExitRoot.bridgeAddress());
    console.log('Exit root rollup', await globalExitRoot.rollupAddress());
    console.log('last rollup exit root', await globalExitRoot.lastRollupExitRoot());
    console.log('last mainnet exit root', await globalExitRoot.lastMainnetExitRoot());
    console.log('roots', await globalExitRoot.getLastGlobalExitRoot());
    console.log('Children', await forkingManager.getChildren());
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
