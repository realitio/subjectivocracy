/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const fs = require('fs');
const { ethers } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pathGenesisJson = path.join(__dirname, './../deployment/genesis.json');

async function loadOngoingOrDeploy(deployer, contractName, ongoingName, args, ongoing, pathOngoing, externallyDeployedAddress) {
    const contractFactory = await ethers.getContractFactory(contractName, {
        signer: deployer,
    });

    let existingAddress;
    if (externallyDeployedAddress) {
        existingAddress = externallyDeployedAddress;
    } else if (ongoing[ongoingName]) {
        existingAddress = ongoing[ongoingName];
    }

    let contractInstance;
    if (!existingAddress) {
        contractInstance = await contractFactory.deploy(...args);
        await contractInstance.deployed();
        console.log('#######################\n');
        console.log(ongoingName, 'deployed to:', contractInstance.address);

        // save an ongoing deployment
        ongoing[ongoingName] = contractInstance.address;
        fs.writeFileSync(pathOngoing, JSON.stringify(ongoing, null, 1));
    } else {
        contractInstance = contractFactory.attach(existingAddress);
        console.log('#######################\n');
        console.log(ongoingName, 'already deployed on: ', existingAddress);
    }

    return contractInstance;
}

function genesisAddressForContractName(contractName) {
    const genesisJSON = require(pathGenesisJson);
    const genesisEntries = genesisJSON.genesis;
    for (const [, genesisEntry] of Object.entries(genesisEntries)) {
        if (genesisEntry.contractName === contractName) {
            return genesisEntry.address;
        }
    }
    throw new Error(`Could not find genesis entry ${contractName}`);
}

module.exports = {
    loadOngoingOrDeploy, genesisAddressForContractName,
};
