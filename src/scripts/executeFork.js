/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const common = require('../common/common');

async function main() {
    const args = process.argv.slice(2);
    const deploymentName = args[0];
    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);
    const deploymentOutput = require(`../../deployments/${deploymentName}/deploy_output.json`);

    const mandatoryDeploymentOutput = [
        'maticTokenAddress',
        'forkingManager',
    ];
    const {
        maticTokenAddress,
        forkingManager,
    } = deploymentOutput;

    common.verifyDeploymentParameters(mandatoryDeploymentOutput, deploymentOutput);

    const myGasPrice = 6000000000; // 4 gwei

    const forkonomicTokenAddress = maticTokenAddress;

    // Load provider
    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const pendingTxCount = await currentProvider.getTransactionCount(deployer.address, 'pending');
    const txCount = await currentProvider.getTransactionCount(deployer.address);
    console.log('pendingTxCount is ', pendingTxCount);
    console.log('txCount is ', txCount);
    if (pendingTxCount > txCount) {
        pendingTxFilter = web3.eth.filter('pending');
        pendingTx = pendingTxFilter.get_new_entries();
        console.log('pending: ', pendingTx);
        throw new Error('txes pending');
    }

    const forkingManagerContract = (await ethers.getContractAt(
        'contracts/ForkingManager.sol:ForkingManager',
        forkingManager,
    )).connect(deployer);
    console.log('ForkingManager address: ', forkingManagerContract.address);

    const reservedChainIdForFork1 = await forkingManagerContract.reservedChainIdForFork1();
    const reservedChainIdForFork2 = await forkingManagerContract.reservedChainIdForFork2();
    const isInitializeDone = (reservedChainIdForFork1.gt(0));
    if (isInitializeDone) {
        console.log('Initialization already done, forks will be ', reservedChainIdForFork1, reservedChainIdForFork2);
        const forkFromTs = await forkingManagerContract.executionTimeForProposal();
        const tsNow = parseInt(Date.now() / 1000, 10);
        if (forkFromTs.toNumber() > tsNow) {
            throw new Error(`Too early to fork, call again after${forkFromTs.toNumber()}`);
        }
    } else {
        const forkonomicTokenContract = (await ethers.getContractAt(
            'contracts/ForkonomicToken.sol:ForkonomicToken',
            forkonomicTokenAddress,
        )).connect(deployer);
        const payment = await forkingManagerContract.arbitrationFee();
        console.log('Payment: ', payment.toString());
        if (payment.gt(await forkonomicTokenContract.balanceOf(deployer.address))) {
            throw new Error('Not enough tokens');
        }

        const approved = await forkonomicTokenContract.allowance(forkingManagerContract.address, deployer.address);
        const params = { gasLimit: 100000, gasPrice: myGasPrice };
        if (approved.gte(payment)) {
            console.log('Payment already approved, skipping approval step');
        } else {
            console.log('Approving payment');
            await forkonomicTokenContract.connect(deployer).approve(forkingManagerContract.address, payment, params);
        }
        const disputeData = {
            isL1: true,
            disputeContract: ethers.constants.AddressZero,
            disputeContent: ethers.constants.HashZero,
        };
        const tx1 = await forkingManagerContract.connect(deployer).initiateFork(disputeData, { gasLimit: 10000000, gasPrice: myGasPrice });
        await tx1.wait();
        console.log('Fork initiated');
        const sleepTime = await forkingManagerContract.forkPreparationTime();
        console.log('Sleeping for ', sleepTime.toString(), 's before executing fork');
        console.log('Alternatively, you can run this again later or call it manually on this contract: https://sepolia.etherscan.com/address/', forkingManagerContract.address, '#writeContract');
        await new Promise((r) => setTimeout(r, sleepTime * 1000));
    }
    const tx2 = await forkingManagerContract.connect(deployer).executeFork({ gasLimit: 12000000, gasPrice: myGasPrice });
    console.log('Executed fork with tx: ', tx2.hash);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
