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

    if (args.length !== 2) {
        console.log('Usage: node src/scripts/bridgeTokensL1ToL2.js <sepolia_something> <num tokens>');
        return;
    }

    const deploymentName = args[0];
    const depositAmount = ethers.BigNumber.from(args[1]);
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);
    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);

    const gasPrice = 2000000000;

    const mandatoryDeploymentOutput = [
        'polygonZkEVMBridgeAddress',
        'bridgeImplementationAddress',
        'maticTokenAddress',
    ];
    for (const parameterName of mandatoryDeploymentOutput) {
        if (deploymentOutput[parameterName] === undefined || deploymentOutput[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const {
        polygonZkEVMBridgeAddress,
        maticTokenAddress,
    } = deploymentOutput;

    const forkonomicTokenAddress = maticTokenAddress;

    // Load provider
    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const bridge = await ethers.getContractAt(
        'contracts/ForkableBridge.sol:ForkableBridge',
        polygonZkEVMBridgeAddress,
    );

    const forkonomicToken = await ethers.getContractAt(
        'contracts/ForkonomicToken.sol:ForkonomicToken',
        forkonomicTokenAddress,
    );

    // const depositAmount = ethers.utils.parseEther('10');
    const balance = await forkonomicToken.connect(deployer).balanceOf(deployer.address);
    if (balance.lt(depositAmount)) {
        throw new Error('Not enough tokens');
    }

    const tx1 = await forkonomicToken.connect(deployer).approve(polygonZkEVMBridgeAddress, depositAmount, { gasLimit: 500000 });
    console.log('Approved bridge to spend forkonomic tokens');
    console.log('by the following tx: ', tx1.hash);

    // sleep for 15 secs to wait until tx is mined and nonce increase is reflected
    await new Promise((r) => setTimeout(r, 15000));

    const tx2 = await bridge.connect(deployer).bridgeAsset(
        1,
        deployer.address,
        depositAmount,
        forkonomicTokenAddress,
        true,
        '0x',
        { gasLimit: 5000000, gasPrice },
    );
    console.log('Deposited forkonomic tokens into bridge');
    console.log('by the following tx: ', tx2.hash);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
