/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const common = require('../common/common');

async function main() {
    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const args = process.argv.slice(2);
    const deploymentName = args[0];
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);
    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);

    const mandatoryDeploymentOutput = [
        'polygonZkEVMAddress',
        'maticTokenAddress',
        'trustedSequencer',
    ];
    for (const parameterName of mandatoryDeploymentOutput) {
        if (deploymentOutput[parameterName] === undefined || deploymentOutput[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const {
        polygonZkEVMAddress,
        // polygonZkEVMBridgeAddress,
        maticTokenAddress,
        trustedSequencer,
    } = deploymentOutput;

    const forkonomicTokenAddress = maticTokenAddress;
    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    if (trustedSequencer === undefined || trustedSequencer.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error('Wrong deployer address');
    }
    console.log('polygonZkEVMAddress: ', polygonZkEVMAddress);

    const forkonomicToken = (await ethers.getContractAt(
        'contracts/ForkonomicToken.sol:ForkonomicToken',
        forkonomicTokenAddress,
    )).connect(deployer);

    const tx1 = await forkonomicToken.approve(polygonZkEVMAddress, ethers.constants.MaxUint256, { gasLimit: 100000 });
    await tx1.wait();
    console.log('Approved zkevm by the sequencer to spend forkonomic tokens');
    console.log('by the following tx: ', tx1.hash);

    /*
     * const tx2 = await forkonomicToken.approve(polygonZkEVMBridgeAddress, ethers.constants.MaxUint256, { gasLimit: 100000 });
     * await tx2.wait();
     * console.log('Bridge also approved zkevm by the sequencer to spend forkonomic tokens');
     * console.log('by the following tx: ', tx2.hash);
     */
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
