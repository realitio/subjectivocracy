/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const common = require('../common/common');

async function main() {
    const args = process.argv.slice(2);
    const deploymentName = args[0];

    const deployParameters = require(`../../deployments/${deploymentName}/deploy_parameters.json`);
    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const pendingTxCount = await currentProvider.getTransactionCount(deployer.address, 'pending');
    const txCount = await currentProvider.getTransactionCount(deployer.address);

    if (pendingTxCount === txCount) {
        console.log('Nothing to clear');
        return;
    }

    console.log('Cancelling tx with nonce', txCount);

    // let gasPrice = await currentProvider.getGasPrice();

    const tx = await deployer.sendTransaction({
        to: deployer.address,
        value: 0,
        nonce: txCount,
        // gasPrice: gasPrice,
        gasLimit: 21000,
    });

    console.log('sending tx', tx);
    await tx.wait();
    console.log('setnd tx', tx.hash);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
