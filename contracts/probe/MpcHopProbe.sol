// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@coti-io/coti-contracts/contracts/utils/mpc/MpcCore.sol";

/**
 * @title MpcHopProbe
 * @notice Diagnostic pair. Answers one question: do COTI's MPC values survive a contract hop?
 *
 * `NodeaCompute.submitProof` depends on two such hops, and when it reverted with no revert data
 * there was no way to tell which — or whether either — was at fault:
 *
 *   1. A `gtUint256` garbled handle computed in one contract, passed to another and used there.
 *      This is what `credits.transferGT(operator, gtPayout)` does.
 *   2. A `ctString` sealed under the network key by one contract, re-onboarded by another.
 *      This is what `slaCertificates.issue(...)` does with the SLA manifest.
 *
 * Both are cheap to test in isolation and expensive to guess at, so this probe exists to replace
 * the guess with an answer. It is not part of the protocol and is excluded from deployment.
 */
contract MpcHopReceiver {
    uint256 public lastUint;
    string public lastString;
    bool public gtHopWorked;
    bool public gtStringHopWorked;
    bool public ctHopWorked;

    /// @notice Accept a garbled handle produced by another contract and decrypt it here.
    function acceptGt(gtUint256 value) external {
        lastUint = MpcCore.decrypt(value);
        gtHopWorked = true;
    }

    /// @notice Accept a garbled string handle produced by another contract and decrypt it here.
    function acceptGtString(gtString memory value) external {
        lastString = MpcCore.decrypt(value);
        gtStringHopWorked = true;
    }

    /// @notice Accept a network-key ciphertext produced by another contract and re-onboard it.
    function acceptCt(ctString calldata sealedText) external {
        ctString memory copy = _toMemory(sealedText);
        lastString = MpcCore.decrypt(MpcCore.onBoard(copy));
        ctHopWorked = true;
    }

    function _toMemory(ctString calldata ct) private pure returns (ctString memory out) {
        uint256 len = ct.value.length;
        out.value = new ctUint64[](len);
        for (uint256 i = 0; i < len; i++) {
            out.value[i] = ct.value[i];
        }
    }
}

contract MpcHopSender {
    MpcHopReceiver public immutable receiver;

    constructor(address receiver_) {
        receiver = MpcHopReceiver(receiver_);
    }

    /// @notice Hop 1: build a garbled value here, hand the handle to another contract.
    function sendGt(uint256 value) external {
        receiver.acceptGt(MpcCore.setPublic256(value));
    }

    /// @notice Hop 3: build a garbled string here, hand the handles across without offboarding.
    function sendGtString(string calldata text) external {
        receiver.acceptGtString(MpcCore.setPublicString(text));
    }

    /// @notice Hop 2: seal a string under the network key here, hand the ciphertext across.
    function sendCt(string calldata text) external {
        receiver.acceptCt(MpcCore.offBoard(MpcCore.setPublicString(text)));
    }

    /// @notice Control: the same two operations entirely within one contract.
    function localRoundTrip(uint256 value, string calldata text)
        external
        returns (uint256 decodedUint, string memory decodedString)
    {
        decodedUint = MpcCore.decrypt(MpcCore.setPublic256(value));
        decodedString = MpcCore.decrypt(MpcCore.onBoard(MpcCore.offBoard(MpcCore.setPublicString(text))));
    }
}
