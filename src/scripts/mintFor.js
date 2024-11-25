/* eslint-disable import/no-dynamic-require, global-require */
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
    const recipient = args[1];
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);
    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);

    const mandatoryDeploymentOutput = [
        'maticTokenAddress',
        'trustedSequencer',
        'deployerAddress',
    ];
    for (const parameterName of mandatoryDeploymentOutput) {
        if (deploymentOutput[parameterName] === undefined || deploymentOutput[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const {
        maticTokenAddress,
    } = deploymentOutput;

    const forkonomicTokenAddress = maticTokenAddress;
    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const forkonomicToken = (await ethers.getContractAt(
        'contracts/ForkonomicToken.sol:ForkonomicToken',
        forkonomicTokenAddress,
    )).connect(deployer);

    const tx0 = await forkonomicToken.connect(deployer).mint(recipient, ethers.utils.parseEther('100000'), { gasLimit: 500000 });
    await tx0.wait();
    console.log('Mint forkonomic tokens for ', recipient);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
