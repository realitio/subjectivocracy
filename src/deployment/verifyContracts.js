/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
require('dotenv').config();
const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');

const pathDeployOutputParameters = path.join(__dirname, './deploy_output.json');
const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');
const deployOutputParameters = require(pathDeployOutputParameters);
const deployParameters = require(pathDeployParameters);

async function getImplementationAddress(proxyAddress) {
    // The specific storage slot for the implementation address as per EIP-1967
    const slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    // Query the storage at the slot
    const implementationAddressHex = await hre.ethers.provider.getStorageAt(proxyAddress, slot);
    // Convert the storage result to a proper address format
    const implementationAddress = hre.ethers.utils.getAddress(hre.ethers.utils.hexStripZeros(implementationAddressHex));
    return implementationAddress;
}

async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    // verify maticToken
    try {
        // verify governance
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.maticTokenAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify verifier
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.verifierAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    /*
     * // verify timelock
     *const { minDelayTimelock } = deployParameters;
     *const { timelockAddress } = deployParameters;
     *try {
     *    await hre.run(
     *        'verify:verify',
     *        {
     *            address: deployOutputParameters.timelockContractAddress,
     *            constructorArguments: [
     *                minDelayTimelock,
     *                [timelockAddress],
     *                [timelockAddress],
     *                timelockAddress,
     *                deployOutputParameters.polygonZkEVMAddress,
     *            ],
     *        },
     *    );
     *} catch (error) {
     *    expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
     *}
     */

    // verify proxy admin
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.proxyAdminAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify create children implementation
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployParameters.createChildrenImplementationAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify bridge operations implementation
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.bridgeOperationImplementationAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify bridge implementation
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.bridgeImplementationAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify zkEVM address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify zkEVM implementation address
    try {
        const implemenation = await getImplementationAddress(deployOutputParameters.polygonZkEVMAddress);
        await hre.run(
            'verify:verify',
            {
                address: implemenation,
            },
        );
    } catch (error) {
        //        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify global exit root address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
            },
        );
    } catch (error) {
        //       expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify global exit implementation address
    try {
        const implemenation = await getImplementationAddress(deployOutputParameters.polygonZkEVMGlobalExitRootAddress);
        await hre.run(
            'verify:verify',
            {
                address: implemenation,
            },
        );
    } catch (error) {
        //      expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify bridge
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMBridgeAddress,
                constructorArguments: [
                    deployOutputParameters.bridgeImplementationAddress,
                    deployOutputParameters.proxyAdminAddress,
                    '0x',
                ],
            },
        );
    } catch (error) {
        //     expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify bridge implementation address
    try {
        const implemenation = await getImplementationAddress(deployOutputParameters.polygonZkEVMBridgeAddress);
        await hre.run(
            'verify:verify',
            {
                address: implemenation,
            },
        );
    } catch (error) {
    //    expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify forking manager
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.forkingManager,
            },
        );
    } catch (error) {
        //     expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify fork manager implementation address
    try {
        const implemenation = await getImplementationAddress(deployOutputParameters.forkingManager);
        await hre.run(
            'verify:verify',
            {
                address: implemenation,
            },
        );
    } catch (error) {
    //    expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
