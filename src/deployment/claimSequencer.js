/* eslint-disable no-await-in-loop, no-console, no-inner-declarations, no-undef, import/no-unresolved */

/*
 * Script to run claim for the chain info update
 * Based on https://github.com/0xPolygonHermez/code-examples/blob/main/zkevm-nft-bridge-example/scripts/claimMockNFT.js#L34
 * Same thing should work for any other claim on L2 except you have to substitute the address of the claimer contract
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { ethers } = require('hardhat');
const hre = require('hardhat');

const networkName = hre.network.name;
const { bridgeAPIEndpoint } = hre.config.zkEVMServices[networkName];

const merkleProofString = '/merkle-proof';
const getClaimsFromAcc = '/bridges/';

const baseURL = bridgeAPIEndpoint;
if (!baseURL) {
    throw new Error('Missing baseURL');
}
console.log('using baseURL', baseURL);

const axios = require('axios').create({
    baseURL,
});

const deployParameters = require('./deploy_parameters.json');
const common = require('../common/common');
const commonDeployment = require('./common');

async function main() {
    const l2BridgeAddress = commonDeployment.genesisAddressForContractName('PolygonZkEVMBridge proxy');
    const claimFor = deployParameters.trustedSequencer;

    const currentProvider = await common.loadProvider(deployParameters, process.env);
    const deployer = await common.loadDeployer(currentProvider, deployParameters);

    const l2BridgeFactory = await ethers.getContractFactory('@RealityETH/zkevm-contracts/contracts/inheritedMainContracts/PolygonZkEVMBridge.sol:PolygonZkEVMBridge', deployer);
    const l2BridgeContract = l2BridgeFactory.attach(l2BridgeAddress);

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function filterClaimable(_depositsArray, _verbose) {
        const claimable = [];
        for (let i = 0; i < _depositsArray.length; i++) {
            const currentDeposit = _depositsArray[i];
            if (!currentDeposit.ready_for_claim) {
                if (_verbose) {
                    console.log('Not ready yet:', currentDeposit.tx_hash);
                }
            } else if (currentDeposit.claim_tx_hash !== '') {
                if (_verbose) {
                    console.log('already claimed: ', currentDeposit.claim_tx_hash);
                }
            } else {
                claimable.push(currentDeposit);
            }
        }

        return claimable;
    }

    let depositsArray;
    let found = false;
    console.log('Trying claim for contract', claimFor, 'against bridge', l2BridgeAddress, '...');
    while (!found) {
        const depositAxions = await axios.get(getClaimsFromAcc + claimFor, { params: { limit: 100, offset: 0 } });
        depositsArray = filterClaimable(depositAxions.data.deposits, true);
        // depositsArray = depositAxions.data.deposits;

        if (depositsArray.length === 0) {
            console.log(depositsArray);
            const secs = 5;
            console.log(`No deposits ready to claim yet, retrying in ${secs} seconds...`);
            await sleep(secs * 1000);
        } else {
            found = true;
        }
    }

    for (let i = 0; i < depositsArray.length; i++) {
        const currentDeposit = depositsArray[i];
        if (currentDeposit.ready_for_claim) {
            const proofAxios = await axios.get(merkleProofString, {
                params: { deposit_cnt: currentDeposit.deposit_cnt, net_id: currentDeposit.orig_net },
            });

            const { proof } = proofAxios.data;
            const claimTx = await l2BridgeContract.claimMessage(
                proof.merkle_proof,
                currentDeposit.deposit_cnt,
                proof.main_exit_root,
                proof.rollup_exit_root,
                currentDeposit.orig_net,
                currentDeposit.orig_addr,
                currentDeposit.dest_net,
                currentDeposit.dest_addr,
                currentDeposit.amount,
                currentDeposit.metadata,
                { gasLimit: 100000 },
            );
            console.log('Claim message successfully sent: ', claimTx.hash);
            await claimTx.wait();
            console.log('Claim message successfully mined ', claimTx.hash);
        } else {
            console.log('Not ready yet!');
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
