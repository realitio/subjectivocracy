// Script to send tokens on whichever chain is set as HARDHAT_NETWORK

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const common = require('../common/common');

async function main() {
    const args = process.argv.slice(2);
    const deploymentName = args[0];
    const recipient = args[1];
    const amount = ethers.BigNumber.from(args[2]);

    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);

    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    // const bal = await currentProvider.getBalance(deployer.address);
    let gasPrice = await currentProvider.getGasPrice();
    if (gasPrice === 0) {
        console.log('gas price returned zero, using hard-coded 2 gwei');
        gasPrice = 2000000000;
    }
    const nonce = await currentProvider.getTransactionCount(deployer.address, 'latest');
    const gasLimit = 21000;

    const txdata = {
        to: recipient,
        value: amount,
        nonce,
        gasLimit: ethers.utils.hexlify(gasLimit),
        gasPrice,
    };

    const response = await deployer.sendTransaction(txdata);
    console.log('sent tx', response.hash);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
