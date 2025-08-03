# 🫧 Bubble Bridge

**Bubble Bridge** is a cross-chain swap protocol based on HTLC (Hashed Time-Locked Contract), enabling trustless token transfers between Ethereum (EVM) and Sui.

> Built for ETHGlobal Unite DeFi Hackathon 🏆

---

## 📦 Features

- 🔁 EVM ↔ Sui atomic swap via HTLC
- 🔐 Native ETH & ERC20 + any Sui token
- 🔗 1inch Limit Order integration
- 💻 Full TypeScript SDK for scripting
- 🧪 Sepolia + Sui testnet ready

---

## 🧪 Deployment & Usage Guide

This guide explains how to deploy and test Bubble Bridge contracts and scripts.

---

## 🔷 Sui HTLC Script Usage
# Deploy contract metadata
npx ts-node ts-sdk/tools/deploySuiContract.ts

# Lock SUI or any Sui token
npx ts-node ts-sdk/htlc/sui/lockHtlc.ts <recipient_wallet> <coinType> <amount>

# Example
npx ts-node ts-sdk/htlc/sui/lockHtlc.ts 0xabc...def 0x2::sui::SUI 100000000

# Claim or refund
npx ts-node ts-sdk/htlc/sui/claimHtlc.ts
npx ts-node ts-sdk/htlc/sui/refundHtlc.ts
