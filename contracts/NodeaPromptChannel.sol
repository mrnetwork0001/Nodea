// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {PrivateMessaging} from "@coti-io/coti-contracts/contracts/messaging/PrivateMessaging.sol";

/**
 * @title NodeaPromptChannel
 * @notice The E2EE transport for Nodea inference requests.
 *
 * A prompt — the system instructions, the retrieved context, the user turn — is
 * the single most valuable artifact an AI agent owns. Sent to a GPU marketplace
 * over a transparent chain, it is simply published. Here, each prompt is
 * encrypted client-side and stored as a COTI `ctString` in three views: one under
 * the network key, one under the sender's AES key, and one under the *recipient
 * node's* AES key. Only the node hired for the job can decrypt the payload it
 * was sent.
 *
 * `NodeaCompute` binds each job to a message id and checks the (from, to) pair
 * on chain, so an escrow cannot be opened against a prompt that was never
 * actually delivered to the node being paid.
 */
contract NodeaPromptChannel is PrivateMessaging {
    string public constant CHANNEL = "nodea.prompt.v1";

    constructor(uint64 epochDurationSeconds) payable PrivateMessaging(epochDurationSeconds) {}
}
