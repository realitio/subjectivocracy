# Logical reasoning for the safety of the contracts


## Deposits and withdrawals + forking


### Deposits and withdrawals:
Deposits and withdrawals are well described [here:]
(https://docs.polygon.technology/zkEVM/architecture/protocol/zkevm-bridge/exit-tree/#transfer-from-l1-to-rollup-l2).

The criticial parts are:
- Exit-tree on L1 and L2: an append only tree containing one leaf per deposit/message (on L1) or withdrawal/message (on L2)
- Bitmap of claimed leaves from the tree on L1 and L2.
- GlobalExitRootManager: contract that stores both exit-tree root hashes and the globalExitRootMap: mapping of hash(exitRoot L1, exitRoot L2) => timestamp.

### Forking:

During the forking process all the essential contracts ( zkEVM, bridge, globalExitRootManager) are getting duplicated.
Forking happens atomically. Before the forking is done, all deposit and withdrawal operations are working as usual. After the forking no deposit or withdrawal operations
can be done anymore on the old contracts and everything needs to happens on the new contracts.
Before the fork is initiated, the L1 globalExitRoot is updated one last time, to ensure that all deposits from L1 are reflected. Then the exitRoot of
the L2 and the L1 are copied into the new globalExitRootManager contracts and the new globalExitRoot is calculated and inserted with the timestamp of the forking
into the globalExitRoot map.
During the forking process, the whole exit tree is copied 1-to-1 to the new bridges, creating equal conditions on the new bridges.
The bitmap of claimed leaves is not copied to the children, though every child checks also in the parent bridge (and even higher partents, if the leave count is high enough),
whether a claim has been processes.


### Why forking does not interfere with the deposit process.

#### Deposit L1 -> Forking -> Withdrawal L2
The fact that exitRoot of L1 is updated right before the fork is executed and the coping of the exitRoot from the globalExitRootManager to its children ensures
that the deposits are registered in the new globalExitRootManager contracts. After the fork, then normal process that carries the exitRoot from L1 to L2 via updating the globalExitRootManager on L2 
with the newest hahes takes place as usual. This happens by the L2-executor, who sets the newest hashes equal to the data of newest exitRoots and the timestamp to the timestamp of the forking. 
The newest hashes and the newest timestamp will be accepted in the next "sequenceBatches" call, as this information as the child zkEVM exactly check that the globalExitRootMap of the child globalExitRootManagers have this entry.
This updading of the exitRootHashes ensures that the withdrawal can be executed successfully. Since on L2 the withdrawal bitmap is not touched in the forking process, it will have the accurate state and works as usual.
(ensured by unit tests: 
1) testSetsCorrectGlobalExitRoot -> This ensure that the correct exit root is sent in the children contracts
2) ForkableBridge:testCreateChildren -> This test ensure that the exit root is updated exactly before creating the children
)

#### Deposit L2 -> Forking -> Withdrawal L1.

If the depoist on L2 did not get into the last batch that was verified and consolidiated, then it will not be considered. The L2 sequencer has to abondon all these transaction that are not verified and consolidated, 
since these transaction won't be valid on any child-fork, since the chainIds are not correct.
Hence, we assume that the deposit on L2 made it into the last verified and consolidated block. This means with the consolidation step, the exitRoothash of the L2 is updated on L1 and during the copying of the exitRootHashes into the child contracts, it was considered.
Since the child-forks also have the latest claimings bitmap, the withdrawal can only be claimed once per chain. On the old contracts, it can not be claimed, as the claiming is prevented by the "onlyBeforeForking" modifier.
(ensured by e2e test)


The same mechanics are true for sending messasges.







