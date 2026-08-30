// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INodeaCredits, INodeaSLA, IPromptChannel} from "./interfaces/INodea.sol";
import "@coti-io/coti-contracts/contracts/utils/mpc/MpcCore.sol";

/**
 * @title NodeaCompute
 * @notice Confidential escrow and SLA arbiter for the Nodea DeAI compute fleet.
 *
 * ## What this contract is for
 *
 * An autonomous agent that rents GPU inference on a transparent chain leaks its
 * entire operating profile: how much it pays per thousand tokens, how many
 * tokens it burns, which model it favours, and how much runway it has left.
 * Competitors read that off a block explorer and front-run it. Providers, in
 * turn, cannot publish a rate card without inviting every rival to undercut it
 * by one wei.
 *
 * Nodea moves the *numbers* into COTI garbled circuits and leaves only the
 * *facts* on chain. A node's price per 1k tokens, an agent's budget, the token
 * count, the measured latency and uptime, the payout and the refund are all
 * `gtUint256` values — computed by the MPC network, never materialised in
 * plaintext in storage or in an event.
 *
 * ## The privacy boundary, stated honestly
 *
 * Exactly two bits are deliberately declassified, both via `MpcCore.decrypt`:
 *
 *  1. **Affordability** at {openJob} — whether the encrypted cost fits inside the
 *     encrypted budget. This is not a real disclosure: the transaction either
 *     succeeds or reverts, and success already tells an observer the same thing.
 *  2. **SLA outcome** at {submitProof} — whether the node kept the uptime and
 *     latency it publicly promised. Reputation has to be legible to be worth
 *     anything; the workload that produced it stays encrypted in the certificate.
 *
 * Everything else — every amount, every measurement — stays sealed.
 *
 * ## Flow
 *
 * ```
 *   node    registerNode(model, gpu, region, promises, enc(price/1k))
 *   agent   promptChannel.sendMessage(node, enc(prompt))        -> messageId
 *   agent   credits.approve(nodeaCompute, enc(maxBudget))
 *   agent   openJob(nodeId, enc(kTokens), enc(maxBudget), messageId, deadline)
 *             |- cost   = price x kTokens                       (garbled circuit)
 *             |- require cost <= budget                         (1 declassified bit)
 *             `- escrow cost from agent -> this contract        (encrypted transfer)
 *   node    submitProof(jobId, enc(tokens), enc(uptime), enc(latency), digest, enc(manifest))
 *             |- slaMet = uptime >= promised && latency <= promised  (garbled circuit)
 *             |- payout = slaMet ? cost : cost * (1 - slashBps)      (mux, never revealed)
 *             |- refund = cost - payout                              (never revealed)
 *             `- mint confidential SLA certificate to the node
 * ```
 */
contract NodeaCompute is ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum JobState {
        None,
        Escrowed,
        Settled,
        Refunded
    }

    struct Node {
        address operator;
        bool active;
        /// @dev Public so agents can filter a fleet; none of it reveals price or load.
        string modelId;
        string gpuClass;
        string region;
        /// @dev Public commitments the node is held to inside the garbled circuit.
        uint32 promisedUptimeBps;
        uint32 promisedLatencyMs;
        uint64 registeredAt;
        uint64 jobsSettled;
        uint64 jobsBreached;
    }

    struct Job {
        uint256 nodeId;
        address client;
        address operator;
        JobState state;
        uint64 openedAt;
        uint64 deadline;
        uint64 settledAt;
        /// @dev Id of the E2EE prompt in {NodeaPromptChannel} this job pays for.
        uint256 promptMessageId;
        bytes32 attestationDigest;
        bool slaMet;
        uint256 certificateId;
    }

    /// @dev A pair of ciphertexts for one encrypted quantity: the network-key copy the
    ///      contract can re-onboard, and a copy re-encrypted under one participant's AES key.
    struct SealedValue {
        ctUint256 network;
        ctUint256 forClient;
        ctUint256 forOperator;
    }

    // ---------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------

    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Share of the escrow withheld from a node that misses its SLA, returned to the agent.
    uint16 public constant SLA_SLASH_BPS = 4_000;
    uint32 public constant MAX_UPTIME_BPS = 10_000;
    uint64 public constant MIN_JOB_DURATION = 60;
    uint64 public constant MAX_JOB_DURATION = 7 days;

    INodeaCredits public immutable credits;
    INodeaSLA public immutable slaCertificates;
    IPromptChannel public immutable promptChannel;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    uint256 public nodeCount;
    uint256 public jobCount;

    mapping(uint256 => Node) private _nodes;
    /// @dev Encrypted price per 1,000 generated tokens. `forClient` is unused for nodes.
    mapping(uint256 => SealedValue) private _nodePrice;
    mapping(address => uint256[]) private _nodesByOperator;

    mapping(uint256 => Job) private _jobs;
    /// @dev Workload the agent ordered and paid for, in thousands of tokens.
    mapping(uint256 => SealedValue) private _jobWorkload;
    /// @dev Workload the node claims it actually produced, in thousands of tokens.
    mapping(uint256 => SealedValue) private _jobDelivered;
    mapping(uint256 => SealedValue) private _jobCost;
    mapping(uint256 => SealedValue) private _jobPayout;
    mapping(uint256 => SealedValue) private _jobRefund;
    mapping(address => uint256[]) private _jobsByClient;
    mapping(uint256 => uint256[]) private _jobsByNode;
    mapping(uint256 => bool) private _promptMessageUsed;

    // ---------------------------------------------------------------------
    // Events — note that no event carries a plaintext amount.
    // ---------------------------------------------------------------------

    event NodeRegistered(
        uint256 indexed nodeId,
        address indexed operator,
        string modelId,
        string gpuClass,
        string region,
        uint32 promisedUptimeBps,
        uint32 promisedLatencyMs
    );
    event NodePriceUpdated(uint256 indexed nodeId, address indexed operator);
    event NodeActiveSet(uint256 indexed nodeId, bool active);
    event JobOpened(
        uint256 indexed jobId,
        uint256 indexed nodeId,
        address indexed client,
        uint256 promptMessageId,
        uint64 deadline
    );
    event JobSettled(
        uint256 indexed jobId,
        uint256 indexed nodeId,
        address indexed operator,
        bool slaMet,
        uint256 certificateId
    );
    event JobRefunded(uint256 indexed jobId, uint256 indexed nodeId, address indexed client);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidMetadata();
    error InvalidPromise();
    error InvalidDeadline();
    error UnknownNode(uint256 nodeId);
    error NodeInactive(uint256 nodeId);
    error NotNodeOperator(uint256 nodeId, address caller);
    error UnknownJob(uint256 jobId);
    error JobNotEscrowed(uint256 jobId);
    error JobExpired(uint256 jobId);
    error JobNotExpired(uint256 jobId);
    error NotJobClient(uint256 jobId, address caller);
    error NotJobOperator(uint256 jobId, address caller);
    error PromptNotAddressedToNode(uint256 messageId);
    error PromptAlreadyUsed(uint256 messageId);
    error BudgetExceeded();
    error UnauthorizedViewer();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor(address credits_, address slaCertificates_, address promptChannel_) {
        credits = INodeaCredits(credits_);
        slaCertificates = INodeaSLA(slaCertificates_);
        promptChannel = IPromptChannel(promptChannel_);
    }

    // ---------------------------------------------------------------------
    // Node registry
    // ---------------------------------------------------------------------

    /**
     * @notice List a GPU node with a confidential rate card.
     * @param encPricePerKToken Input text for the price, in NDC base units, per 1,000 generated
     *                          tokens. Sealed on arrival; the operator keeps a readable copy and
     *                          nobody else ever sees the number.
     */
    function registerNode(
        string calldata modelId,
        string calldata gpuClass,
        string calldata region,
        uint32 promisedUptimeBps,
        uint32 promisedLatencyMs,
        itUint256 calldata encPricePerKToken
    ) external returns (uint256 nodeId) {
        if (bytes(modelId).length == 0 || bytes(gpuClass).length == 0 || bytes(region).length == 0) {
            revert InvalidMetadata();
        }
        if (promisedUptimeBps == 0 || promisedUptimeBps > MAX_UPTIME_BPS || promisedLatencyMs == 0) {
            revert InvalidPromise();
        }

        nodeId = ++nodeCount;

        _nodes[nodeId] = Node({
            operator: msg.sender,
            active: true,
            modelId: modelId,
            gpuClass: gpuClass,
            region: region,
            promisedUptimeBps: promisedUptimeBps,
            promisedLatencyMs: promisedLatencyMs,
            registeredAt: uint64(block.timestamp),
            jobsSettled: 0,
            jobsBreached: 0
        });
        _nodesByOperator[msg.sender].push(nodeId);

        _sealNodePrice(nodeId, MpcCore.validateCiphertext(encPricePerKToken));

        emit NodeRegistered(
            nodeId,
            msg.sender,
            modelId,
            gpuClass,
            region,
            promisedUptimeBps,
            promisedLatencyMs
        );
    }

    /// @notice Reprice a node. The new rate is sealed exactly like the original one.
    function updateNodePrice(uint256 nodeId, itUint256 calldata encPricePerKToken) external {
        Node storage node = _requireNode(nodeId);
        if (node.operator != msg.sender) revert NotNodeOperator(nodeId, msg.sender);

        _sealNodePrice(nodeId, MpcCore.validateCiphertext(encPricePerKToken));

        emit NodePriceUpdated(nodeId, msg.sender);
    }

    function setNodeActive(uint256 nodeId, bool active) external {
        Node storage node = _requireNode(nodeId);
        if (node.operator != msg.sender) revert NotNodeOperator(nodeId, msg.sender);

        node.active = active;

        emit NodeActiveSet(nodeId, active);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------

    /**
     * @notice Hire a node for one inference job and escrow the (encrypted) fee.
     *
     * @param nodeId          The node to hire.
     * @param encKTokens      Input text for the workload size, in thousands of tokens.
     * @param encMaxBudget    Input text for the most the agent will pay for this job.
     * @param promptMessageId Id of the E2EE prompt already sent to the node through
     *                        {NodeaPromptChannel}. Checked on chain to be from this caller and
     *                        addressed to this node — an escrow cannot be attached to a prompt
     *                        the node was never given.
     * @param deadline        When the agent may reclaim the escrow if no proof arrives.
     *
     * @dev The caller must first grant this contract an encrypted allowance on {NodeaCredits}
     *      that covers the cost. The cost itself is computed inside the garbled circuit, so the
     *      allowance is the only figure the agent has to size by hand.
     */
    function openJob(
        uint256 nodeId,
        itUint256 calldata encKTokens,
        itUint256 calldata encMaxBudget,
        uint256 promptMessageId,
        uint64 deadline
    ) external nonReentrant returns (uint256 jobId) {
        Node storage node = _requireNode(nodeId);
        if (!node.active) revert NodeInactive(nodeId);
        if (
            deadline < block.timestamp + MIN_JOB_DURATION ||
            deadline > block.timestamp + MAX_JOB_DURATION
        ) {
            revert InvalidDeadline();
        }

        _bindPrompt(promptMessageId, node.operator);

        gtUint256 gtKTokens = MpcCore.validateCiphertext(encKTokens);
        gtUint256 gtCost = MpcCore.checkedMul(MpcCore.onBoard(_nodePrice[nodeId].network), gtKTokens);

        // The single declassified bit: does the sealed cost fit the sealed budget? A revert
        // would tell an observer the same thing, so decrypting it discloses nothing new.
        if (!MpcCore.decrypt(MpcCore.le(gtCost, MpcCore.validateCiphertext(encMaxBudget)))) {
            revert BudgetExceeded();
        }

        jobId = ++jobCount;

        _jobs[jobId] = Job({
            nodeId: nodeId,
            client: msg.sender,
            operator: node.operator,
            state: JobState.Escrowed,
            openedAt: uint64(block.timestamp),
            deadline: deadline,
            settledAt: 0,
            promptMessageId: promptMessageId,
            attestationDigest: bytes32(0),
            slaMet: false,
            certificateId: 0
        });
        _jobsByClient[msg.sender].push(jobId);
        _jobsByNode[nodeId].push(jobId);

        _jobWorkload[jobId] = _seal(gtKTokens, msg.sender, node.operator);
        _jobCost[jobId] = _seal(gtCost, msg.sender, node.operator);

        // Encrypted pull payment: the escrow amount never appears in the clear.
        credits.transferFromGT(msg.sender, address(this), gtCost);

        emit JobOpened(jobId, nodeId, msg.sender, promptMessageId, deadline);
    }

    /**
     * @notice Deliver proof of execution, have the SLA judged in MPC, and settle.
     *
     * @param encTokensGenerated Input text for the workload actually produced, in thousands of
     *                           tokens. Compared against what the agent ordered *inside* the
     *                           circuit, so a node cannot bill for 100k tokens and return 2k.
     * @param encUptimeBps       Input text for the node's measured uptime over the job window.
     * @param encLatencyMs       Input text for the measured first-token latency.
     * @param attestationDigest  keccak256 of the node's off-chain execution attestation.
     * @param encManifest        Input text for the JSON SLA manifest that becomes the encrypted
     *                           token URI of the certificate.
     *
     * @dev The three conditions are compared against the node's *public* promises entirely inside
     *      the garbled circuit, and only the single resulting yes/no is declassified — a
     *      reputation nobody can read is not a reputation. Payout and refund are then selected
     *      with `mux` and moved as encrypted transfers, so a breach is visible but its price is
     *      not.
     */
    function submitProof(
        uint256 jobId,
        itUint256 calldata encTokensGenerated,
        itUint256 calldata encUptimeBps,
        itUint256 calldata encLatencyMs,
        bytes32 attestationDigest,
        itString calldata encManifest
    ) external nonReentrant returns (bool slaMet) {
        Job storage job = _requireJob(jobId);
        if (job.state != JobState.Escrowed) revert JobNotEscrowed(jobId);
        if (job.operator != msg.sender) revert NotJobOperator(jobId, msg.sender);
        if (block.timestamp > job.deadline) revert JobExpired(jobId);

        gtBool gtMet = _judge(jobId, encTokensGenerated, encUptimeBps, encLatencyMs);

        // The one declassified bit: did the node keep the promise it published?
        slaMet = MpcCore.decrypt(gtMet);

        job.state = JobState.Settled;
        job.settledAt = uint64(block.timestamp);
        job.attestationDigest = attestationDigest;
        job.slaMet = slaMet;

        if (slaMet) {
            _nodes[job.nodeId].jobsSettled += 1;
        } else {
            _nodes[job.nodeId].jobsBreached += 1;
        }

        _settle(jobId, gtMet);
        job.certificateId = _issueCertificate(jobId, attestationDigest, slaMet, encManifest);

        emit JobSettled(jobId, job.nodeId, job.operator, slaMet, job.certificateId);
    }

    /**
     * @dev Run the SLA comparison inside the garbled circuit. Three sealed conditions, all
     *      measured against commitments the node published in the clear at registration:
     *      uptime at or above promise, latency at or below promise, and delivered volume at
     *      least what the agent paid for. Returns the combined bit still encrypted, so the
     *      caller can both declassify it for reputation and feed it to `mux` for the payout.
     */
    function _judge(
        uint256 jobId,
        itUint256 calldata encTokensGenerated,
        itUint256 calldata encUptimeBps,
        itUint256 calldata encLatencyMs
    ) private returns (gtBool) {
        Job storage job = _jobs[jobId];
        Node storage node = _nodes[job.nodeId];

        gtUint256 gtDelivered = MpcCore.validateCiphertext(encTokensGenerated);
        _jobDelivered[jobId] = _seal(gtDelivered, job.client, job.operator);

        return
            MpcCore.and(
                MpcCore.and(
                    MpcCore.ge(
                        MpcCore.validateCiphertext(encUptimeBps),
                        MpcCore.setPublic256(uint256(node.promisedUptimeBps))
                    ),
                    MpcCore.le(
                        MpcCore.validateCiphertext(encLatencyMs),
                        MpcCore.setPublic256(uint256(node.promisedLatencyMs))
                    )
                ),
                MpcCore.ge(gtDelivered, MpcCore.onBoard(_jobWorkload[jobId].network))
            );
    }

    /**
     * @dev Split the escrow according to the sealed verdict and move both legs.
     *      Both transfers always execute, so a breach and a clean run leave the same on-chain
     *      footprint; only the sealed amounts differ.
     */
    function _settle(uint256 jobId, gtBool gtMet) private {
        Job storage job = _jobs[jobId];

        gtUint256 gtCost = MpcCore.onBoard(_jobCost[jobId].network);

        // `MpcCore.mux(bit, a, b)` selects **b** when the bit is true — the COTI precompile's
        // polarity, and the reverse of what the argument order suggests. So a met SLA takes the
        // third argument (the full cost) and a breach takes the second (cost less the slash).
        // Swapping these would pay breaching nodes in full and slash honest ones.
        gtUint256 gtPayout = MpcCore.mux(
            gtMet,
            MpcCore.div(
                MpcCore.mul(gtCost, uint256(BPS_DENOMINATOR - SLA_SLASH_BPS)),
                uint256(BPS_DENOMINATOR)
            ),
            gtCost
        );
        gtUint256 gtRefund = MpcCore.sub(gtCost, gtPayout);

        _jobPayout[jobId] = _seal(gtPayout, job.client, job.operator);
        _jobRefund[jobId] = _seal(gtRefund, job.client, job.operator);

        credits.transferGT(job.operator, gtPayout);
        credits.transferGT(job.client, gtRefund);
    }

    /// @dev Validate the node's manifest and hand it to the certificate contract still in circuit.
    function _issueCertificate(
        uint256 jobId,
        bytes32 attestationDigest,
        bool slaMet,
        itString calldata encManifest
    ) private returns (uint256) {
        Job storage job = _jobs[jobId];

        return
            slaCertificates.issue(
                job.operator,
                jobId,
                job.client,
                _nodes[job.nodeId].promisedUptimeBps,
                attestationDigest,
                slaMet,
                MpcCore.validateCiphertext(encManifest)
            );
    }

    /**
     * @notice Reclaim the escrow after the deadline passes with no proof of execution.
     * @dev The refund is the sealed cost moved straight back, so the amount reclaimed stays as
     *      private as the amount escrowed.
     */
    function reclaimExpiredJob(uint256 jobId) external nonReentrant {
        Job storage job = _requireJob(jobId);
        if (job.state != JobState.Escrowed) revert JobNotEscrowed(jobId);
        if (job.client != msg.sender) revert NotJobClient(jobId, msg.sender);
        if (block.timestamp <= job.deadline) revert JobNotExpired(jobId);

        job.state = JobState.Refunded;
        job.settledAt = uint64(block.timestamp);

        gtUint256 gtCost = MpcCore.onBoard(_jobCost[jobId].network);
        _jobRefund[jobId] = _seal(gtCost, job.client, job.operator);

        _nodes[job.nodeId].jobsBreached += 1;

        credits.transferGT(job.client, gtCost);

        emit JobRefunded(jobId, job.nodeId, job.client);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getNode(uint256 nodeId) external view returns (Node memory) {
        return _nodes[_requireNodeId(nodeId)];
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[_requireJobId(jobId)];
    }

    function nodesOf(address operator) external view returns (uint256[] memory) {
        return _nodesByOperator[operator];
    }

    function jobsOfClient(address client) external view returns (uint256[] memory) {
        return _jobsByClient[client];
    }

    function jobsOfNode(uint256 nodeId) external view returns (uint256[] memory) {
        return _jobsByNode[nodeId];
    }

    /// @notice The node's rate card, readable only by the operator that set it.
    function nodePriceForOperator(uint256 nodeId) external view returns (ctUint256 memory) {
        Node storage node = _requireNode(nodeId);
        if (node.operator != msg.sender) revert UnauthorizedViewer();

        return _nodePrice[nodeId].forOperator;
    }

    /// @notice The escrowed fee, re-encrypted for whichever counterparty is asking.
    function jobCostFor(uint256 jobId) external view returns (ctUint256 memory) {
        return _viewerCopy(_jobCost[_requireJobId(jobId)], _jobs[jobId]);
    }

    /// @notice The workload the agent ordered, readable only by the two counterparties.
    function jobWorkloadFor(uint256 jobId) external view returns (ctUint256 memory) {
        return _viewerCopy(_jobWorkload[_requireJobId(jobId)], _jobs[jobId]);
    }

    /// @notice The workload the node reported delivering, readable only by the two counterparties.
    function jobDeliveredFor(uint256 jobId) external view returns (ctUint256 memory) {
        return _viewerCopy(_jobDelivered[_requireJobId(jobId)], _jobs[jobId]);
    }

    /// @notice The amount released to the node, readable only by the two counterparties.
    function jobPayoutFor(uint256 jobId) external view returns (ctUint256 memory) {
        return _viewerCopy(_jobPayout[_requireJobId(jobId)], _jobs[jobId]);
    }

    /// @notice The amount returned to the agent, readable only by the two counterparties.
    function jobRefundFor(uint256 jobId) external view returns (ctUint256 memory) {
        return _viewerCopy(_jobRefund[_requireJobId(jobId)], _jobs[jobId]);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _sealNodePrice(uint256 nodeId, gtUint256 gtPrice) private {
        SealedValue storage sealed_ = _nodePrice[nodeId];
        sealed_.network = MpcCore.offBoard(gtPrice);
        sealed_.forOperator = MpcCore.offBoardToUser(gtPrice, msg.sender);
    }

    /// @dev Produce the three views of one sealed quantity in a single MPC pass.
    function _seal(
        gtUint256 value,
        address client,
        address operator
    ) private returns (SealedValue memory) {
        return
            SealedValue({
                network: MpcCore.offBoard(value),
                forClient: MpcCore.offBoardToUser(value, client),
                forOperator: MpcCore.offBoardToUser(value, operator)
            });
    }

    /// @dev Verify the prompt exists, came from this agent, and was addressed to this node.
    function _bindPrompt(uint256 promptMessageId, address operator) private {
        if (_promptMessageUsed[promptMessageId]) revert PromptAlreadyUsed(promptMessageId);

        (address from, address to, , ) = promptChannel.getMessageMetadata(promptMessageId);
        if (from != msg.sender || to != operator) revert PromptNotAddressedToNode(promptMessageId);

        _promptMessageUsed[promptMessageId] = true;
    }

    function _viewerCopy(
        SealedValue storage sealed_,
        Job storage job
    ) private view returns (ctUint256 memory) {
        if (msg.sender == job.client) return sealed_.forClient;
        if (msg.sender == job.operator) return sealed_.forOperator;

        revert UnauthorizedViewer();
    }

    function _requireNode(uint256 nodeId) private view returns (Node storage node) {
        node = _nodes[nodeId];
        if (node.operator == address(0)) revert UnknownNode(nodeId);
    }

    function _requireNodeId(uint256 nodeId) private view returns (uint256) {
        if (_nodes[nodeId].operator == address(0)) revert UnknownNode(nodeId);
        return nodeId;
    }

    function _requireJob(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.state == JobState.None) revert UnknownJob(jobId);
    }

    function _requireJobId(uint256 jobId) private view returns (uint256) {
        if (_jobs[jobId].state == JobState.None) revert UnknownJob(jobId);
        return jobId;
    }
}
