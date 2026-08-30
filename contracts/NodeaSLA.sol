// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {PrivateERC721} from "@coti-io/coti-contracts/contracts/token/PrivateERC721/PrivateERC721.sol";
import {PrivateERC721URIStorage} from "@coti-io/coti-contracts/contracts/token/PrivateERC721/extensions/PrivateERC721URIStorage.sol";
import "@coti-io/coti-contracts/contracts/utils/mpc/MpcCore.sol";

/**
 * @title NodeaSLA
 * @notice Confidential ERC-721 execution receipts for settled Nodea compute jobs.
 *
 * When a job settles, the compute escrow mints one certificate to the GPU node
 * operator. The token's URI is a JSON manifest — model, tokens generated,
 * measured latency, uptime, attestation digest — held on chain as a COTI
 * `ctString`, i.e. re-encrypted under the *owner's* AES key. The node operator
 * can decrypt and present it as a portable, verifiable track record; nobody else
 * can read what workload produced it.
 *
 * This is the piece that makes private compute *marketable*: a provider needs to
 * prove reliability to win the next contract, but proving it on a transparent
 * chain would publish its customers' inference patterns. Here the proof exists
 * on chain and the workload does not.
 *
 * Certificates are non-transferable (soulbound) — a reputation record that could
 * be sold to another operator would not be a reputation record.
 */
contract NodeaSLA is PrivateERC721URIStorage {
    struct Certificate {
        uint256 jobId;
        address nodeOperator;
        address client;
        uint64 issuedAt;
        /// @dev Public commitment the node signed up to; the *measured* result stays encrypted in the URI.
        uint32 promisedUptimeBps;
        /// @dev keccak256 of the node's off-chain execution attestation.
        bytes32 attestationDigest;
        /// @dev Whether the encrypted SLA comparison passed inside the garbled circuit.
        bool slaMet;
    }

    address public owner;
    /// @notice Contracts allowed to issue certificates (the Nodea compute escrow).
    mapping(address => bool) public isIssuer;

    uint256 private _nextTokenId;
    mapping(uint256 => Certificate) public certificates;
    mapping(uint256 => uint256) public certificateOfJob;
    mapping(address => uint256[]) private _certificatesByOperator;

    event IssuerSet(address indexed issuer, bool allowed);
    event CertificateIssued(
        uint256 indexed tokenId,
        uint256 indexed jobId,
        address indexed nodeOperator,
        bool slaMet
    );

    error NotOwner();
    error NotIssuer(address caller);
    error CertificateAlreadyIssued(uint256 jobId);
    error Soulbound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) PrivateERC721("Nodea SLA Certificate", "NODEA-SLA") {
        owner = owner_;
    }

    function setIssuer(address issuer, bool allowed) external onlyOwner {
        isIssuer[issuer] = allowed;
        emit IssuerSet(issuer, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /**
     * @notice Mint a confidential SLA certificate for a settled job.
     * @param to               The GPU node operator receiving the receipt.
     * @param manifest         Network-key ciphertext of the JSON manifest, produced by the
     *                         escrow's garbled circuit. It is re-onboarded here and re-encrypted
     *                         under `to`'s AES key, so only the operator can read it back.
     * @dev Takes a `ctString` rather than an `itString` on purpose: the manifest is not raw user
     *      input, it is the *output* of the escrow's MPC settlement. Forwarding an `itString`
     *      between contracts would fail input-text validation anyway, since the IT signature is
     *      bound to the original (signer, contract, selector) triple.
     */
    function issue(
        address to,
        uint256 jobId,
        address client,
        uint32 promisedUptimeBps,
        bytes32 attestationDigest,
        bool slaMet,
        ctString calldata manifest
    ) external returns (uint256 tokenId) {
        if (!isIssuer[msg.sender]) revert NotIssuer(msg.sender);
        if (certificateOfJob[jobId] != 0) revert CertificateAlreadyIssued(jobId);

        // Token ids start at 1 so `certificateOfJob == 0` reliably means "none yet".
        tokenId = ++_nextTokenId;

        _mint(to, tokenId);
        _setTokenURI(to, tokenId, _toMemory(manifest));

        certificates[tokenId] = Certificate({
            jobId: jobId,
            nodeOperator: to,
            client: client,
            issuedAt: uint64(block.timestamp),
            promisedUptimeBps: promisedUptimeBps,
            attestationDigest: attestationDigest,
            slaMet: slaMet
        });
        certificateOfJob[jobId] = tokenId;
        _certificatesByOperator[to].push(tokenId);

        emit CertificateIssued(tokenId, jobId, to, slaMet);
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function certificatesOf(address operator) external view returns (uint256[] memory) {
        return _certificatesByOperator[operator];
    }

    /// @dev Reputation is bound to the operator that earned it.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address previousOwner = _ownerOf(tokenId);
        if (previousOwner != address(0) && to != address(0)) revert Soulbound();

        return super._update(to, tokenId, auth);
    }

    function _toMemory(ctString calldata ct) private pure returns (ctString memory out) {
        uint256 len = ct.value.length;
        out.value = new ctUint64[](len);
        for (uint256 i = 0; i < len; i++) {
            out.value[i] = ct.value[i];
        }
    }
}
