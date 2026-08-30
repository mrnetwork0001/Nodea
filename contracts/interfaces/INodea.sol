// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@coti-io/coti-contracts/contracts/utils/mpc/MpcCore.sol";

/// @notice Garbled-text settlement surface of {NodeaCredits}.
interface INodeaCredits {
    function transferGT(address to, gtUint256 value) external;

    function transferFromGT(address from, address to, gtUint256 value) external;
}

/// @notice Issuance surface of {NodeaSLA}.
interface INodeaSLA {
    function issue(
        address to,
        uint256 jobId,
        address client,
        uint32 promisedUptimeBps,
        bytes32 attestationDigest,
        bool slaMet,
        ctString calldata manifest
    ) external returns (uint256 tokenId);
}

/// @notice The subset of COTI's {PrivateMessaging} that {NodeaCompute} needs to bind a job to a prompt.
interface IPromptChannel {
    function getMessageMetadata(
        uint256 messageId
    ) external view returns (address from, address to, uint64 timestamp, uint64 epoch);
}
