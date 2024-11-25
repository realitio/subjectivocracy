require('dotenv').config();
require('@nomiclabs/hardhat-waffle');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('@nomicfoundation/hardhat-verify');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-dependency-compiler');
require('hardhat-preprocessor');

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

/*
 * You need to export an object to set up your config
 * Go to https://hardhat.org/config/ to learn more
 */

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    dependencyCompiler: {
        paths: [
            '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol',
            '@RealityETH/zkevm-contracts/contracts/mocks/ERC20PermitMock.sol',
            '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
            '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
            '@RealityETH/zkevm-contracts/contracts/deployment/PolygonZkEVMDeployer.sol',
            '@RealityETH/zkevm-contracts/contracts/PolygonZkEVMGlobalExitRootL2.sol',
            '@RealityETH/zkevm-contracts/contracts/PolygonZkEVMTimelock.sol',
            '@RealityETH/zkevm-contracts/contracts/mocks/VerifierRollupHelperMock.sol',
            '@RealityETH/zkevm-contracts/contracts/mocks/PolygonZkEVMGlobalExitRootMock.sol',
            '@RealityETH/zkevm-contracts/contracts/mocks/PolygonZkEVMMock.sol',
            '@RealityETH/zkevm-contracts/contracts/verifiers/FflonkVerifier.sol',
            '@RealityETH/zkevm-contracts/contracts/PolygonZkEVMBridgeWrapper.sol',
            '@reality.eth/contracts/development/contracts/RealityETH-4.0.sol',
            '@reality.eth/contracts/development/contracts/Arbitrator.sol',
            'test/testcontract/ForkableExitMock.sol',
            'test/testcontract/ForkableZkEVMMock.sol',
        ],
        keep: true,
    },
    paths: {
        sources: './contracts/',
        cache: './cache_hardhat',
        artifacts: './out',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.20',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 500,
                    },
                },
            },
            {
                version: '0.6.11',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.5.12',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.5.16',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
        ],
    },
    networks: {
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        ropsten: {
            url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        sepolia: {
            url: 'http://sepolia.backstop.technology', //`https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        localhost: {
            url: 'http://127.0.0.1:8545',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        hardhat: {
            initialDate: '0',
            allowUnlimitedContractSize: true,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        polygonZKEVMTestnet: {
            url: 'https://rpc.public.zkevm-test.net',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        polygonZKEVMMainnet: {
            url: 'https://zkevm-rpc.com',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        backstopTestnet0: {
            url: "https://rpc.testnet.backstop.technology",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        backstopTestnet1: {
            url: "https://testnet.rpc.backstop.technology",
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        outputFile: process.env.REPORT_GAS_FILE ? './gas_report.md' : null,
        noColors: !!process.env.REPORT_GAS_FILE,
    },
    zkEVMServices: {
        'backstopTestnet0': {
            bridgeAPIEndpoint: 'https://api.bridge.testnet.backstop.technology'
        },
        'backstopTestnet1': {
            bridgeAPIEndpoint: 'https://api.testnet.bridge.backstop.technology'
        },
    },
    etherscan: {
        apiKey: {
            polygonZKEVMTestnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            polygonZKEVMMainnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            goerli: `${process.env.ETHERSCAN_API_KEY}`,
            sepolia: `${process.env.ETHERSCAN_API_KEY}`,
            mainnet: `${process.env.ETHERSCAN_API_KEY}`,
            backstopTestnet1: 'any',
        },
        customChains: [
            {
                network: 'polygonZKEVMMainnet',
                chainId: 1101,
                urls: {
                    apiURL: 'https://api-zkevm.polygonscan.com/api',
                    browserURL: 'https://zkevm.polygonscan.com/',
                },
            },
            {
                network: 'polygonZKEVMTestnet',
                chainId: 1442,
                urls: {
                    apiURL: 'https://api-testnet-zkevm.polygonscan.com/api',
                    browserURL: 'https://testnet-zkevm.polygonscan.com/',
                },
            },
            {
                network: 'backstopTestnet1',
                chainId: 88558801,
                urls: {
                    apiURL: 'https://api.testnet.explorer.backstop.technology/api',
                    browserURL: 'https://testnet.explorer.backstop.technology/',
                },
            },
        ],
    },
};
