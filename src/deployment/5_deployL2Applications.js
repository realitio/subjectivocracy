/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const fs = require('fs');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pathGenesisJson = path.join(__dirname, './genesis.json');
const pathOutputJsonL1System = path.join(__dirname, './deploy_output.json');
const pathOutputJsonL1Applications = path.join(__dirname, './deploy_output_l1_applications.json');
const pathOutputJsonL2Applications = path.join(__dirname, './deploy_output_l2_applications.json');

const pathOngoingDeploymentJson = path.join(__dirname, './deploy_ongoing_l2_applications.json');

const deployParameters = require('./deploy_application_parameters.json');

const delay = ms => new Promise(res => setTimeout(res, ms));

const common = require('./common.js');

async function main() {
    
    // Check that we already have the L1 settings we need
    if (!fs.existsSync(pathOutputJsonL1Applications)) {
        throw new Error('No l1 application addresses found. Deploy l1 applications first.');
    }
    if (!fs.existsSync(pathOutputJsonL1System)) {
        throw new Error('No system addresses found. Deploy the system first.');
    }

    const l1ApplicationAddresses = require(pathOutputJsonL1Applications);
    const l1SystemAddresses = require(pathOutputJsonL1System);

    const l2BridgeAddress = common.genesisAddressForContractName("PolygonZkEVMBridge proxy");

    const {
        l1GlobalChainInfoPublisher,
        l1GlobalForkRequester
    } = l1ApplicationAddresses;

    if (!l1GlobalForkRequester) {
        throw new Error("Missing l1GlobalForkRequester address");
    }
    if (!l1GlobalChainInfoPublisher) {
        throw new Error("Missing l1GlobalChainInfoPublisher address");
    }

    const forkonomicTokenAddress = l1SystemAddresses.maticTokenAddress;

    // Check if there's an ongoing deployment
    let ongoingDeployment = {};
    if (fs.existsSync(pathOngoingDeploymentJson)) {
        ongoingDeployment = require(pathOngoingDeploymentJson);
    }

    common.verifyDeploymentParameters([
        'adjudicationFrameworkDisputeFee',
        'arbitratorDisputeFee',
        'forkArbitratorDisputeFee'
    ], deployParameters);

    let {
        adjudicationFrameworkDisputeFee,
        forkArbitratorDisputeFee,
        arbitratorDisputeFee,
        arbitratorOwner,
        realityETHAddress, // This is optional, it will be deployed if not supplied
        initialArbitratorAddresses // This can be an empty array
    } = deployParameters;

    // Load provider
    let currentProvider = await common.loadProvider(deployParameters, process.env);
    let deployer = await common.loadDeployer(currentProvider, deployParameters);

    //const feeData = await currentProvider.getFeeData();
    //console.log('feeData', feeData);
    //const block = await currentProvider.getBlock('latest');
    //console.log('latest block', block);

    let deployerBalance = await currentProvider.getBalance(deployer.address);
    console.log('using deployer: ', deployer.address, 'balance is ', deployerBalance.toString());

    const realityETHContract = await common.loadOngoingOrDeploy(deployer, 'RealityETH_v3_0', 'realityETH', [], ongoingDeployment, pathOngoingDeploymentJson, realityETHAddress);
    if (initialArbitratorAddresses.length == 0) {

        const arbitratorContract = await common.loadOngoingOrDeploy(deployer, 'Arbitrator', 'initialArbitrator', [], ongoingDeployment, pathOngoingDeploymentJson);

        const initialFee = await arbitratorContract.getDisputeFee(ethers.constants.HashZero); 
        if (initialFee.eq(0)) {
            await arbitratorContract.setRealitio(realityETHContract.address);
            await arbitratorContract.setDisputeFee(arbitratorDisputeFee);
        }

        initialArbitratorAddresses = [arbitratorContract.address];

    } else {
        console.log('Using arbitrators from config: ', initialArbitratorAddresses);
    }

    const l2ChainInfoContract = await common.loadOngoingOrDeploy(deployer, 'L2ChainInfo', 'l2ChainInfo', [l2BridgeAddress, l1GlobalChainInfoPublisher], ongoingDeployment, pathOngoingDeploymentJson);
    const l2ForkArbitratorContract = await common.loadOngoingOrDeploy(deployer, 'L2ForkArbitrator', 'l2ForkArbitrator',[realityETHContract.address, l2ChainInfoContract.address, l1GlobalForkRequester, forkArbitratorDisputeFee], ongoingDeployment, pathOngoingDeploymentJson);
    const adjudicationFrameworkContract = await common.loadOngoingOrDeploy(deployer, 'AdjudicationFramework', 'adjudicationFramework', [ realityETHContract.address, adjudicationFrameworkDisputeFee, l2ForkArbitratorContract.address, initialArbitratorAddresses ], ongoingDeployment, pathOngoingDeploymentJson)

    const outputJson = {
        realityETH: realityETHContract.address,
        arbitrators: initialArbitratorAddresses,
        l2ChainInfo: l2ChainInfoContract.address,
        l2ForkArbitrator: l2ForkArbitratorContract.address,
        adjudicationFramework: adjudicationFrameworkContract.address
    };
    fs.writeFileSync(pathOutputJsonL2Applications, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
