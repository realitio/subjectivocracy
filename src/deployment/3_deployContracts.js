/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const path = require('path');
const fs = require('fs');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { create2Deployment } = require('./helpers/deployment-helpers');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const pathOngoingDeploymentJson = path.join(__dirname, './deploy_ongoing.json');

const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);
const parentContract = ethers.constants.AddressZero;

async function main() {
    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(`There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`);
    }

    // Check if there's an ongoing deployment
    let ongoingDeployment = {};
    if (fs.existsSync(pathOngoingDeploymentJson)) {
        ongoingDeployment = require(pathOngoingDeploymentJson);
    }

    // Constant variables
    const networkIDMainnet = 0;
    const attemptsDeployProxy = 5;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        'realVerifier',
        'trustedSequencerURL',
        'networkName',
        'version',
        'forkPreparationTime',
        'trustedSequencer',
        'chainID',
        'admin',
        'trustedAggregator',
        'trustedAggregatorTimeout',
        'pendingStateTimeout',
        'forkID',
        'zkEVMOwner',
        'timelockAddress',
        'minDelayTimelock',
        'salt',
        'zkEVMDeployerAddress',
        'maticTokenAddress',
        'createChildrenImplementationAddress',
        'hardAssetManagerAddress',
        'arbitrationFee',
        'proxyAdminAddress',
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        realVerifier,
        trustedSequencerURL,
        networkName,
        version,
        forkPreparationTime,
        trustedSequencer,
        chainID,
        admin,
        trustedAggregator,
        trustedAggregatorTimeout,
        pendingStateTimeout,
        forkID,
        zkEVMOwner,
        /*
         * timelockAddress,
         * minDelayTimelock,
         */
        salt,
        zkEVMDeployerAddress,
        maticTokenAddress,
        createChildrenImplementationAddress,
        hardAssetManagerAddress,
        arbitrationFee,
        proxyAdminAddress,
    } = deployParameters;
    const gasTokenAddress = maticTokenAddress;

    // Load provider
    let currentProvider = ethers.provider;
    if (process.env.HARDHAT_NETWORK === 'localhost') {
        currentProvider = new ethers.providers.JsonRpcProvider('https://127.0.0.1:8454');
    } else {
        if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
            if (process.env.HARDHAT_NETWORK !== 'hardhat') {
                // currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
                currentProvider = new ethers.providers.JsonRpcProvider('http://sepolia.backstop.technology');
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
    }

    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
        console.log('Using pvtKey deployer with address: ', deployer.address);
    } else if (process.env.HARDHAT_NETWORK === 'localhost') {
        [deployer] = (await ethers.getSigners());
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log('Using MNEMONIC deployer with address: ', deployer.address);
    } else {
        [deployer] = (await ethers.getSigners());
    }
    console.log('using deployer: ', deployer.address);

    // Load zkEVM deployer
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory('@RealityETH/zkevm-contracts/contracts/deployment/PolygonZkEVMDeployer.sol:PolygonZkEVMDeployer', deployer);
    const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);

    // check deployer is the owner of the deployer
    if (await deployer.provider.getCode(zkEVMDeployerContract.address) === '0x') {
        throw new Error('zkEVM deployer contract is not deployed at {zkEVMDeployerContract.address}');
    }
    expect(deployer.address).to.be.equal(await zkEVMDeployerContract.owner());

    const ChainIdManagerFactory = await ethers.getContractFactory('ChainIdManager', {
        signer: deployer,
    });

    if (!ongoingDeployment.chainIdManager) {
        chainIdManagerContract = await ChainIdManagerFactory.deploy(chainID);
        console.log('#######################\n');
        console.log('chainIdManager deployed to:', chainIdManagerContract.address);

        // save an ongoing deployment
        ongoingDeployment.chainIdManager = chainIdManagerContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        // Expect the precalculate address matches the ongoing deployment
        chainIdManagerContract = ChainIdManagerFactory.attach(ongoingDeployment.chainIdManager);

        console.log('#######################\n');
        console.log('chainIdManager already deployed on: ', ongoingDeployment.chainIdManager);
    }

    const ForkingManagerFactory = await ethers.getContractFactory('ForkingManager', {
        signer: deployer,
        libraries: { CreateChildren: createChildrenImplementationAddress },
        unsafeAllowLinkedLibraries: true,
    });

    if (!ongoingDeployment.forkingManager) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                forkingManagerContract = await upgrades.deployProxy(ForkingManagerFactory, [], {
                    initializer: false,
                    constructorArgs: [],
                    unsafeAllowLinkedLibraries: true,
                });
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of polygonZkEVMGlobalExitRoot ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('polygonZkEVMGlobalExitRoot contract has not been deployed');
            }
        }

        console.log('#######################\n');
        console.log('forkingManager deployed to:', forkingManagerContract.address);

        // save an ongoing deployment
        ongoingDeployment.forkingManager = forkingManagerContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        // Expect the precalculate address matches the ongoing deployment
        forkingManagerContract = ForkingManagerFactory.attach(ongoingDeployment.forkingManager);

        console.log('#######################\n');
        console.log('forkingManager already deployed on: ', ongoingDeployment.forkingManager);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically (admin/impl)
        await upgrades.forceImport(ongoingDeployment.forkingManager, ForkingManagerFactory, 'transparent');
    }

    let verifierContract;
    if (!ongoingDeployment.verifierContract) {
        if (realVerifier === true) {
            const VerifierRollup = await ethers.getContractFactory('@RealityETH/zkevm-contracts/contracts/verifiers/FflonkVerifier.sol:FflonkVerifier', deployer);
            verifierContract = await VerifierRollup.deploy();
            await verifierContract.deployed();
        } else {
            const VerifierRollupHelperFactory = await ethers.getContractFactory('@RealityETH/zkevm-contracts/contracts/mocks/VerifierRollupHelperMock.sol:VerifierRollupHelperMock', deployer);
            verifierContract = await VerifierRollupHelperFactory.deploy();
            await verifierContract.deployed();
        }
        console.log('#######################\n');
        console.log('Verifier deployed to:', verifierContract.address);

        // save an ongoing deployment
        ongoingDeployment.verifierContract = verifierContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        console.log('Verifier already deployed on: ', ongoingDeployment.verifierContract);
        const VerifierRollupFactory = await ethers.getContractFactory('@RealityETH/zkevm-contracts/contracts/verifiers/FflonkVerifier.sol:FflonkVerifier', deployer);
        verifierContract = VerifierRollupFactory.attach(ongoingDeployment.verifierContract);
    }

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy implementation PolygonZkEVMBridge
    const overrideGasLimit = ethers.BigNumber.from(5500000);
    let bridgeOperationImplementationAddress;
    if (!ongoingDeployment.bridgeOperationImplementationAddress) {
        const bridgeOperationLib = await ethers.getContractFactory('BridgeAssetOperations', deployer);
        const bridgeOperationLibDeployTransaction = (bridgeOperationLib.getDeployTransaction()).data;
        [bridgeOperationImplementationAddress] = await create2Deployment(
            zkEVMDeployerContract,
            salt,
            bridgeOperationLibDeployTransaction,
            null,
            deployer,
            overrideGasLimit,
        );
        console.log('#######################\n');
        console.log('bridgeOperationImplementationAddress deployed to:', bridgeOperationImplementationAddress);
        ongoingDeployment.bridgeOperationImplementationAddress = bridgeOperationImplementationAddress;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        console.log('bridgeOperationImplementation already deployed on: ', ongoingDeployment.bridgeOperationImplementationAddress);
        bridgeOperationImplementationAddress = ongoingDeployment.bridgeOperationImplementationAddress;
    }

    const polygonZkEVMBridgeFactory = await ethers.getContractFactory('ForkableBridge', {
        libraries: {
            CreateChildren: createChildrenImplementationAddress,
            BridgeAssetOperations: bridgeOperationImplementationAddress,
        },
    }, deployer);

    const deployTransactionBridge = (polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    const dataCallNull = null;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const [bridgeImplementationAddress, isBridgeImplDeployed] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        dataCallNull,
        deployer,
        overrideGasLimit,
    );

    if (isBridgeImplDeployed) {
        console.log('#######################\n');
        console.log('bridge impl deployed to:', bridgeImplementationAddress);
    } else {
        console.log('#######################\n');
        console.log('bridge impl was already deployed to:', bridgeImplementationAddress);
    }

    /*
     * deploy proxy
     * Do not initialize directly the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory('@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy', deployer);
    const initializeEmptyDataProxy = '0x';
    const deployTransactionProxy = (transparentProxyFactory.getDeployTransaction(
        bridgeImplementationAddress,
        proxyAdminAddress,
        initializeEmptyDataProxy,
    )).data;

    // Nonce globalExitRoot: currentNonce + 1 (deploy bridge proxy) + 1(impl globalExitRoot) = +2
    const nonceProxyGlobalExitRoot = Number((await ethers.provider.getTransactionCount(deployer.address))) + 2;

    console.log('nonceProxyGlobalExitRoot', nonceProxyGlobalExitRoot);

    // nonceProxyZkevm :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl Zkevm)+ initialize global proxy = +3
    const nonceProxyZkevm = nonceProxyGlobalExitRoot + 3;
    console.log('nonceProxyZkevm', nonceProxyZkevm);

    let precalculateGLobalExitRootAddress;
    let precalculateZkevmAddress;

    // Check if the contract is already deployed
    if (ongoingDeployment.polygonZkEVMGlobalExitRoot && ongoingDeployment.polygonZkEVMContract) {
        precalculateGLobalExitRootAddress = ongoingDeployment.polygonZkEVMGlobalExitRoot;
        precalculateZkevmAddress = ongoingDeployment.polygonZkEVMContract;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.polygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.polygonZkEVMContract;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Contracts are not deployed, normal deployment
        precalculateGLobalExitRootAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyGlobalExitRoot });
        precalculateZkevmAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
    }

    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize(address,address,uint32,address,address,address,bool,address,uint32, bytes32[32])',
        [
            forkingManagerContract.address,
            parentContract,
            networkIDMainnet,
            precalculateGLobalExitRootAddress,
            precalculateZkevmAddress,
            maticTokenAddress,
            false,
            hardAssetManagerAddress,
            0,
            Array(32).fill(ethers.constants.HashZero),
        ],
    );
    const [proxyBridgeAddress, isBridgeProxyDeployed] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionProxy,
        dataCallProxy,
        deployer,
    );
    const polygonZkEVMBridgeContract = polygonZkEVMBridgeFactory.attach(proxyBridgeAddress);

    if (isBridgeProxyDeployed) {
        console.log('#######################\n');
        console.log('PolygonZkEVMBridge deployed to:', polygonZkEVMBridgeContract.address);
    } else {
        console.log('#######################\n');
        console.log('PolygonZkEVMBridge was already deployed to:', polygonZkEVMBridgeContract.address);

        // If it was already deployed, check that the initialized calldata matches the actual deployment
        expect(precalculateGLobalExitRootAddress).to.be.equal(await polygonZkEVMBridgeContract.globalExitRootManager());
        expect(precalculateZkevmAddress).to.be.equal(await polygonZkEVMBridgeContract.polygonZkEVMaddress());
        expect(forkingManagerContract.address).to.be.equal(await polygonZkEVMBridgeContract.forkingManager());
    }

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await polygonZkEVMBridgeContract.networkID());
    console.log('zkEVMaddress:', await polygonZkEVMBridgeContract.polygonZkEVMaddress());

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically (admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, polygonZkEVMBridgeFactory, 'transparent');

    /*
     *Deployment Global exit root manager
     */
    let polygonZkEVMGlobalExitRoot;
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('ForkableGlobalExitRoot', {
        libraries: {
            CreateChildren: createChildrenImplementationAddress,
        },
    }, deployer);
    if (!ongoingDeployment.polygonZkEVMGlobalExitRoot) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                    initializer: false,
                    libraries: {
                        CreateChildren: createChildrenImplementationAddress,
                    },
                    proxyAdmin: proxyAdminAddress,
                    unsafeAllowLinkedLibraries: true,
                });
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of polygonZkEVMGlobalExitRoot ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('polygonZkEVMGlobalExitRoot contract has not been deployed');
            }
        }
        console.log('Actual nonce for globalExitRoot deployment', polygonZkEVMGlobalExitRoot.deployTransaction.nonce);

        try {
            const iForkableExitRoot = await ethers.getContractAt('IForkableGlobalExitRoot', polygonZkEVMGlobalExitRoot.address);
            await iForkableExitRoot.initialize(
                forkingManagerContract.address,
                parentContract,
                precalculateZkevmAddress,
                proxyBridgeAddress,
                ethers.constants.HashZero,
                ethers.constants.HashZero,
                { gasLimit: 300000 }, // required as native gas limit estimation would return a too low result
            );
        } catch (error) {
            console.error('polygonZkEVMGlobalExitRoot initialization error', error.message);
        }

        expect(precalculateGLobalExitRootAddress).to.be.equal(polygonZkEVMGlobalExitRoot.address);

        console.log('#######################\n');
        console.log('polygonZkEVMGlobalExitRoot deployed to:', polygonZkEVMGlobalExitRoot.address);

        // save an ongoing deployment
        ongoingDeployment.polygonZkEVMGlobalExitRoot = polygonZkEVMGlobalExitRoot.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        // sanity check
        expect(precalculateGLobalExitRootAddress).to.be.equal(polygonZkEVMGlobalExitRoot.address);
        // Expect the precalculate address matches the ongoing deployment
        polygonZkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRootFactory.attach(ongoingDeployment.polygonZkEVMGlobalExitRoot);

        console.log('#######################\n');
        console.log('polygonZkEVMGlobalExitRoot already deployed on: ', ongoingDeployment.polygonZkEVMGlobalExitRoot);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically (admin/impl)
        await upgrades.forceImport(ongoingDeployment.polygonZkEVMGlobalExitRoot, PolygonZkEVMGlobalExitRootFactory, 'transparent');

        // Check against current deployment
        expect(polygonZkEVMBridgeContract.address).to.be.equal(await polygonZkEVMBridgeContract.bridgeAddress());
        expect(precalculateZkevmAddress).to.be.equal(await polygonZkEVMBridgeContract.rollupAddress());
    }

    // deploy PolygonZkEVMM
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Polygon ZK-EVM #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('PolygonZkEVMGlobalExitRootAddress:', polygonZkEVMGlobalExitRoot.address);
    console.log('maticTokenAddress:', maticTokenAddress);
    console.log('verifierAddress:', verifierContract.address);
    console.log('polygonZkEVMBridgeContract:', polygonZkEVMBridgeContract.address);

    console.log('admin:', admin);
    console.log('chainID:', chainID);
    console.log('trustedSequencer:', trustedSequencer);
    console.log('pendingStateTimeout:', pendingStateTimeout);
    console.log('trustedAggregator:', trustedAggregator);
    console.log('trustedAggregatorTimeout:', trustedAggregatorTimeout);

    console.log('genesisRoot:', genesisRootHex);
    console.log('trustedSequencerURL:', trustedSequencerURL);
    console.log('networkName:', networkName);
    console.log('forkID:', forkID);

    const PolygonZkEVMFactory = await ethers.getContractFactory(
        'ForkableZkEVM',
        {
            signer: deployer,
            libraries: { CreateChildren: createChildrenImplementationAddress },
        },
    );

    let polygonZkEVMContract;
    let deploymentBlockNumber;
    if (!ongoingDeployment.polygonZkEVMContract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMContract = await upgrades.deployProxy(
                    PolygonZkEVMFactory,
                    [],
                    {
                        initializer: false,
                        libraries: {
                            CreateChildren: createChildrenImplementationAddress,
                        },
                        proxyAdmin: proxyAdminAddress,
                        unsafeAllowLinkedLibraries: true,
                    },
                );
                console.log('polygonZkEVMContract nonce', polygonZkEVMContract.deployTransaction.nonce);
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of polygonZkEVMContract ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('PolygonZkEVM contract has not been deployed');
            }
        }

        try {
            const iForkableZkEVM = await ethers.getContractAt('IForkableZkEVM', polygonZkEVMContract.address);
            const initializeTx = await iForkableZkEVM.initialize(
                forkingManagerContract.address,
                parentContract,
                [
                    admin,
                    trustedSequencer,
                    pendingStateTimeout,
                    trustedAggregator,
                    trustedAggregatorTimeout,
                    chainID,
                    forkID,
                    0,
                ],
                genesisRootHex,
                trustedSequencerURL,
                networkName,
                version,
                polygonZkEVMGlobalExitRoot.address,
                gasTokenAddress,
                verifierContract.address,
                polygonZkEVMBridgeContract.address,
                { gasLimit: 600000 }, // required as native gas limit estimation would return a too low result
            );
            console.log('initializeTx', initializeTx.hash);
        } catch (error) {
            console.error('polygonZkEVMContract initialize threw some error', error.message);
        }

        expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);

        console.log('#######################\n');
        console.log('polygonZkEVMContract deployed to:', polygonZkEVMContract.address);

        // save an ongoing deployment
        ongoingDeployment.polygonZkEVMContract = polygonZkEVMContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Transfer ownership of polygonZkEVMContract
        if (zkEVMOwner !== deployer.address) {
            await (await polygonZkEVMContract.transferOwnership(zkEVMOwner)).wait();
        }

        deploymentBlockNumber = (await polygonZkEVMContract.deployTransaction.wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateZkevmAddress).to.be.equal(ongoingDeployment.polygonZkEVMContract);
        polygonZkEVMContract = PolygonZkEVMFactory.attach(ongoingDeployment.polygonZkEVMContract);

        console.log('#######################\n');
        console.log('polygonZkEVMContract already deployed on: ', ongoingDeployment.polygonZkEVMContract);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(ongoingDeployment.polygonZkEVMContract, PolygonZkEVMFactory, 'transparent');

        const zkEVMOwnerContract = await polygonZkEVMContract.owner();
        if (zkEVMOwnerContract === deployer.address) {
            // Transfer ownership of polygonZkEVMContract
            if (zkEVMOwner !== deployer.address) {
                await (await polygonZkEVMContract.transferOwnership(zkEVMOwner)).wait();
            }
        } else {
            expect(zkEVMOwner).to.be.equal(zkEVMOwnerContract);
        }
        deploymentBlockNumber = 0;
    }
    try {
        const iForkingManager = await ethers.getContractAt('IForkingManager', forkingManagerContract.address);
        await iForkingManager.initialize(
            polygonZkEVMContract.address,
            polygonZkEVMBridgeContract.address,
            gasTokenAddress,
            parentContract,
            polygonZkEVMGlobalExitRoot.address,
            arbitrationFee,
            chainIdManagerContract.address,
            forkPreparationTime,
        );
    } catch (e) {
        console.error(`ForkingManager likely already initialized. Following error was received ${e}`);
    }

    const forkonomicTokenContract = await hre.ethers.getContractAt(
        'ForkonomicToken',
        gasTokenAddress,
    );

    const minter = deployer.address;
    try {
        if (await forkonomicTokenContract.forkmanager() === ethers.constants.AddressZero) {
            const iForkonomicTokenContract = await ethers.getContractAt('IForkonomicToken', forkonomicTokenContract.address);
            await iForkonomicTokenContract.initialize(
                forkingManagerContract.address,
                parentContract,
                minter,
                'Forkonomic Token',
                'ZBS',
            );
        }
    } catch (e) {
        console.error('error deploying forkonomic token', e);
    }
    console.log('\n#######################');
    console.log('#####    Checks  PolygonZkEVM  #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMContract.globalExitRootManager());
    console.log('maticTokenAddress:', await polygonZkEVMContract.matic());
    console.log('verifierAddress:', await polygonZkEVMContract.rollupVerifier());
    console.log('polygonZkEVMBridgeContract:', await polygonZkEVMContract.bridgeAddress());

    console.log('admin:', await polygonZkEVMContract.admin());
    console.log('chainID:', await polygonZkEVMContract.chainID());
    console.log('trustedSequencer:', await polygonZkEVMContract.trustedSequencer());
    console.log('pendingStateTimeout:', await polygonZkEVMContract.pendingStateTimeout());
    console.log('trustedAggregator:', await polygonZkEVMContract.trustedAggregator());
    console.log('trustedAggregatorTimeout:', await polygonZkEVMContract.trustedAggregatorTimeout());

    console.log('genesiRoot:', await polygonZkEVMContract.batchNumToStateRoot(0));
    console.log('trustedSequencerURL:', await polygonZkEVMContract.trustedSequencerURL());
    console.log('networkName:', await polygonZkEVMContract.networkName());
    console.log('owner:', await polygonZkEVMContract.owner());
    console.log('forkID:', await polygonZkEVMContract.forkID());

    /*
     * Todo: set admin addresses correct from the start. Right now, they are differing, due to the split of the deployment script
     * and the deletion of .openzepplin/network.json file mentioned in the readme.
     * expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);
     * expect(await upgrades.erc1967.getAdminAddress(precalculateZkevmAddress)).to.be.equal(proxyAdminAddress);
     * expect(await upgrades.erc1967.getAdminAddress(precalculateGLobalExitRootAddress)).to.be.equal(proxyAdminAddress);
     * expect(await upgrades.erc1967.getAdminAddress(gasTokenAddress)).to.be.equal(proxyAdminAddress);
     * expect(await upgrades.erc1967.getAdminAddress(forkingManagerContract.address)).to.be.equal(proxyAdminAddress);
     */

    /*
     * const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
     * const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress);
     * const proxyAdminOwner = await proxyAdminInstance.owner();
     */

    /*
     *const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
     *
     *let timelockContract;
     *if (proxyAdminOwner !== deployer.address) {
     *    // Check if there's a timelock deployed there that match the current deployment
     *    timelockContract = timelockContractFactory.attach(proxyAdminOwner);
     *    expect(precalculateZkevmAddress).to.be.equal(await timelockContract.polygonZkEVM());
     *
     *    console.log('#######################\n');
     *    console.log(
     *        'Polygon timelockContract already deployed to:',
     *        timelockContract.address,
     *    );
     *} else {
     *    // deploy timelock
     *    console.log('\n#######################');
     *    console.log('##### Deployment TimelockContract  #####');
     *    console.log('#######################');
     *    console.log('minDelayTimelock:', minDelayTimelock);
     *    console.log('timelockAddress:', timelockAddress);
     *    console.log('zkEVMAddress:', polygonZkEVMContract.address);
     *    timelockContract = await timelockContractFactory.deploy(
     *        minDelayTimelock,
     *        [timelockAddress],
     *        [timelockAddress],
     *        timelockAddress,
     *        polygonZkEVMContract.address,
     *    );
     *    await timelockContract.deployed();
     *    console.log('#######################\n');
     *    console.log(
     *        'Polygon timelockContract deployed to:',
     *        timelockContract.address,
     *    );
     *
     *    // Transfer ownership of the proxyAdmin to timelock
     *    await upgrades.admin.transferProxyAdminOwnership(timelockContract.address);
     *}
     *
     *console.log('\n#######################');
     *console.log('#####  Checks TimelockContract  #####');
     *console.log('#######################');
     *console.log('minDelayTimelock:', await timelockContract.getMinDelay());
     *console.log('polygonZkEVM:', await timelockContract.polygonZkEVM());
     */

    const outputJson = {
        polygonZkEVMAddress: polygonZkEVMContract.address,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot.address,
        forkingManager: forkingManagerContract.address,
        maticTokenAddress,
        createChildrenImplementationAddress,
        bridgeImplementationAddress,
        verifierAddress: verifierContract.address,
        zkEVMDeployerContract: zkEVMDeployerContract.address,
        deployerAddress: deployer.address,
        // timelockContractAddress: timelockContract.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        trustedSequencer,
        trustedSequencerURL,
        chainID,
        networkName,
        admin,
        trustedAggregator,
        proxyAdminAddress,
        forkID,
        salt,
        version,
        minter,
        bridgeOperationImplementationAddress,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
