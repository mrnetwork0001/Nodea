---
name: nodea-coti
description: Architecture, guidelines, COTI privacy primitives, Garbled Circuits, and Messaging SDK rules for Nodea built for the COTI Vibe Code Challenge.
---

# 🔐 Nodea — COTI Web4 Vibe Code Challenge Skill & Execution Guide

Use this skill whenever working on, reviewing, or developing **Nodea** — the Autonomous Encrypted DeAI Compute & Private Agentic Infrastructure on COTI Network.

## 📌 Project Overview & Target
- **Target Event:** COTI Web4 Vibe Code Challenge: Agent Edition
- **Prize Target:** 1st Place (100,000 COTI + Liquidity Kickstart + Ecosystem Incubation)
- **Primary Track:** Agent Infrastructure / Agentic App
- **COTI Stack Integration:** Garbled Circuits + `coti-private-messaging` + `coti-private-erc20` + `coti-private-nft` + `coti-account-setup`
- **Core Tech Stack:** TypeScript + `@coti-io/coti-sdk-typescript` + Next.js 14 + Solidity

## 🏗️ Technical Architecture Rules

### 1. E2EE Prompt Transmission (`coti-private-messaging`)
- Encrypt prompt payloads on-chain using COTI Private Messaging SDK so only authorized compute nodes can decrypt them.

### 2. Confidential Token Micro-Settlement (`coti-private-erc20`)
- Implement encrypted token balances for compute task escrow and auto-release.

### 3. Private NFT SLA Certificates (`coti-private-nft`)
- Issue confidential ERC-721 receipts verifying compute SLA compliance.

## 🚨 Submission Checklist
- Public GitHub repo under OSI-approved license (Apache 2.0 / MIT).
- Deployed smart contracts on COTI.
- Public X post tagging `@COTINetwork` with live app link & demo video.
