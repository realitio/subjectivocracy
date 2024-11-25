/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function verifyDeploymentParameters(mandatoryDeploymentParameters, deployParameters) {
    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
}

async function loadProvider(deployParameters, env) {
    if (!deployParameters) {
        deployParameters = {};
    }
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (env.HARDHAT_NETWORK === 'sepolia') {
            // currentProvider = new ethers.providers.JsonRpcProvider(`https://${env.HARDHAT_NETWORK}.infura.io/v3/${env.INFURA_PROJECT_ID}`);
            currentProvider = new ethers.providers.JsonRpcProvider('https://sepolia.backstop.technology');
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(`Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`);
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas).div(1000),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas).div(1000),
                    };
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }
    return currentProvider;
}

async function loadDeployer(currentProvider, deployParameters = {}, idx = '0') {
    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        if (idx > 0) {
            throw new Error('Multiple signers only supported with mnemonic');
        }
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
        console.log('Using pvtKey deployer with address: ', deployer.address);
    } else if (process.env.PK) {
        deployer = new ethers.Wallet(process.env.PK, currentProvider);
        console.log('Using PK deployer with address: ', deployer.address);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, `m/44'/60'/0'/0/${idx}`).connect(currentProvider);
        console.log('Using MNEMONIC deployer with address: ', deployer.address);
    } else {
        if (idx > 0) {
            throw new Error('Multiple signers only supported with mnemonic');
        }
        console.log('Using getSigners');
        [deployer] = (await ethers.getSigners());
    }
    return deployer;
}

async function getNonceWithoutInFlightTxs(provider, address) {
    return (await provider.getTransactionCount(address, 'latest')) + 1;
}

module.exports = {
    loadProvider, loadDeployer, verifyDeploymentParameters, getNonceWithoutInFlightTxs,
};
