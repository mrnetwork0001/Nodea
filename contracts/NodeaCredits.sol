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
 * ## NDC is a demo credit, not a value-bearing asset
 *
 * {claimFaucet} lets any address mint a fixed allotment once, for the price of
 * gas. That is deliberate — it lets anyone evaluate Nodea without the team
 * having to distribute tokens by hand — but it means NDC is not scarce, and a
 * node operator's NDC earnings are not a claim on anything outside this system.
 * Treat NDC as a metering unit for compute, not as money.
 *
 * The admin can call {setFaucetEnabled} to close it, at which point supply is
 * controlled solely by `MINTER_ROLE` and NDC becomes a normal issued credit.
 * `publicAmountsEnabled` may likewise be switched off to force encrypted-only
 * flows once an operator no longer wants clear amounts to touch the chain.
 */
contract NodeaCredits is PrivateERC20 {
    /// @dev 1 NDC == 1e6 base units, matching the granularity of per-1k-token inference pricing.
    uint8 private constant DECIMALS = 6;

    event FaucetDrip(address indexed to, uint256 amount);
    event FaucetEnabledSet(bool enabled);

    /// @notice Per-address allotment, in base units (500 NDC).
    uint256 public constant FAUCET_AMOUNT = 500 * 10 ** uint256(DECIMALS);

    /// @notice Whether the open allotment is still claimable. Admin-controlled.
    bool public faucetEnabled = true;

    mapping(address => bool) public faucetClaimed;

    error FaucetAlreadyClaimed(address account);
    error FaucetClosed();

    constructor(address admin) PrivateERC20("Nodea Compute Credits", "NDC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(MINTER_ROLE, address(this));
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice One-shot open allotment so a fresh agent can hire compute immediately.
     * @dev The minted amount is public and identical for everyone, so claiming it
     *      leaks nothing about the caller. Every *subsequent* movement of these
     *      credits is encrypted.
     *
     *      Open to anyone by design — see the contract-level note on why NDC is a
     *      metering unit rather than money.
     */
    function claimFaucet() external nonReentrant {
        if (!faucetEnabled) revert FaucetClosed();
        if (faucetClaimed[_msgSender()]) revert FaucetAlreadyClaimed(_msgSender());
        faucetClaimed[_msgSender()] = true;

        _mint(_msgSender(), MpcCore.setPublic256(FAUCET_AMOUNT));

        emit FaucetDrip(_msgSender(), FAUCET_AMOUNT);
    }

    /**
     * @notice Open or close the public allotment.
     * @dev Closing it leaves supply under `MINTER_ROLE` alone. Existing balances are
     *      untouched; only new claims are refused.
     */
    function setFaucetEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        faucetEnabled = enabled;
        emit FaucetEnabledSet(enabled);
    }
}
