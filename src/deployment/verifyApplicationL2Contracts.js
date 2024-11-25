/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in, no-console */

// Broken and/or not fully tested

require('dotenv').config();
const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');

const pathDeployParameters = path.join(__dirname, './deploy_application_parameters.json');
const pathDeployL1OutputParameters = path.join(__dirname, './deploy_output_l1_applications.json');
const pathDeployL2OutputParameters = path.join(__dirname, './deploy_output_l2_applications.json');

const deployParameters = require(pathDeployParameters);
const deployL1OutputParameters = require(pathDeployL1OutputParameters);
const deployL2OutputParameters = require(pathDeployL2OutputParameters);

const common = require('./common');

async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    const l2BridgeAddress = common.genesisAddressForContractName('PolygonZkEVMBridge proxy');

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployL2OutputParameters.realityETH,
            },
        );
    } catch (error) {
        console.log(error);
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployL2OutputParameters.arbitrators[0],
            },
        );
    } catch (error) {
        console.log(error);
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    try {
        console.log('verify', deployL2OutputParameters.l2ChainInfo, 'using params', l2BridgeAddress, deployL1OutputParameters.l1GlobalChainInfoPublisher);
        await hre.run(
            'verify:verify',
            {
                address: deployL2OutputParameters.l2ChainInfo,
                constructorArguments: [
                    l2BridgeAddress,
                    deployL1OutputParameters.l1GlobalChainInfoPublisher,
                ],
            },
        );
    } catch (error) {
        console.log(error);
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployL2OutputParameters.l2ForkArbitrator,
                constructorArguments: [
                    deployL2OutputParameters.realityETH,
                    deployL2OutputParameters.l2ChainInfo,
                    deployL1OutputParameters.l1GlobalForkRequester,
                    deployParameters.forkArbitratorDisputeFee,
                ],
            },
        );
    } catch (error) {
        console.log(error);
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployL2OutputParameters.adjudicationFramework,
                constructorArguments: [
                    deployL2OutputParameters.realityETH,
                    deployParameters.adjudicationFrameworkDisputeFee,
                    deployL2OutputParameters.l2ForkArbitrator,
                    deployL2OutputParameters.arbitrators,
                    false,
                    deployParameters.l2ForkDelay,
                ],
            },
        );
    } catch (error) {
        console.log(error);
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
