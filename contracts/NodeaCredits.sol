// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {PrivateERC20} from "@coti-io/coti-contracts/contracts/token/PrivateERC20/PrivateERC20.sol";
import "@coti-io/coti-contracts/contracts/utils/mpc/MpcCore.sol";

/**
 * @title NodeaCredits (NDC)
 * @notice Confidential settlement asset for the Nodea DeAI compute fleet.
 *
 * Every balance, allowance and transfer amount lives on chain as a garbled
 * ciphertext (COTI `gtUint256`). A block explorer sees that *a* settlement
 * happened between an agent and a GPU node — never how much it cost, and never
 * how much working capital the agent has left.
 *
 * This is what removes the two classic leaks of paying for inference on a
 * transparent chain:
 *  - **Budget disclosure.** A public balance tells competitors exactly how much
 *    inference an agent can still afford, which is a direct read on its strategy.
 *  - **Price discovery against you.** Public per-task amounts let anyone
 *    reconstruct a node's rate card and undercut or front-run it.
 *
 * `MINTER_ROLE` is granted to the Nodea faucet/treasury at deploy time so agents
 * can bootstrap on testnet; `publicAmountsEnabled` may be switched off by the
 * admin to force encrypted-only flows once an operator no longer wants clear
 * amounts to touch the chain at all.
 */
contract NodeaCredits is PrivateERC20 {
    /// @dev 1 NDC == 1e6 base units, matching the granularity of per-1k-token inference pricing.
    uint8 private constant DECIMALS = 6;

    event FaucetDrip(address indexed to, uint256 amount);

    /// @notice Per-address testnet faucet allotment, in base units (500 NDC).
    uint256 public constant FAUCET_AMOUNT = 500 * 10 ** uint256(DECIMALS);

    mapping(address => bool) public faucetClaimed;

    error FaucetAlreadyClaimed(address account);

    constructor(address admin) PrivateERC20("Nodea Compute Credits", "NDC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(MINTER_ROLE, address(this));
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice One-shot testnet faucet so a fresh agent can hire compute immediately.
     * @dev The minted amount is public and identical for everyone, so it leaks
     *      nothing about the caller. Every *subsequent* movement of these credits
     *      is encrypted.
     */
    function claimFaucet() external nonReentrant {
        if (faucetClaimed[_msgSender()]) revert FaucetAlreadyClaimed(_msgSender());
        faucetClaimed[_msgSender()] = true;

        _mint(_msgSender(), MpcCore.setPublic256(FAUCET_AMOUNT));

        emit FaucetDrip(_msgSender(), FAUCET_AMOUNT);
    }
}
