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
# Install Sui CLI
https://github.com/MystenLabs/sui/releases

# Compile Sui Contract
`sui move build`

# Deploy contract metadata
`npx ts-node ts-sdk/tools/deploySuiContract.ts`

# Lock SUI or any Sui token
`npx ts-node ts-sdk/htlc/sui/lockHtlc.ts <recipient_wallet> <coinType> <amount>`

# Example
`npx ts-node ts-sdk/htlc/sui/lockHtlc.ts 0xabc...def 0x2::sui::SUI 100000000`

# Claim or refund
`npx ts-node ts-sdk/htlc/sui/claimHtlc.ts`
`npx ts-node ts-sdk/htlc/sui/refundHtlc.ts`

💡 `coinType` can be any token, like `0x123456::usdc::USDC`

## 🔶EVM HTLC Script Usage
# Compile contracts
`npx hardhat compile`

# Deploy EVM HTLC
`npx hardhat run tools/deployEvmContract.ts --network sepolia`

# Deploy 1inch-enhanced HTLC
`npx hardhat run tools/deployOneinchContract.ts --network sepolia`

# Lock ETH or token
`npx ts-node ts-sdk/htlc/evm/lockHtlc.ts <recipient> <tokenAddress|ETH> <amount>`

# Claim or refund
`npx ts-node ts-sdk/htlc/evm/claimHtlc.ts`
`npx ts-node ts-sdk/htlc/evm/refundHtlc.ts`

# Lock using 1inch-based HTLC
`npx ts-node ts-sdk/htlc/1inch/lockHtlc.ts <recipient> ETH|<token> <amount>`

## 🔁 Cross-chain Swap Scenarios
# ✅ Sui ➡️ EVM
```
# Lock on Sui
npx ts-node ts-sdk/htlc/sui/lockHtlc.ts <evm_user> 0x2::sui::SUI 50000000

# Lock on EVM
npx ts-node ts-sdk/htlc/evm/respondLockHtlc.ts <sui_user> ETH 0.01

# Claim on both sides
npx ts-node ts-sdk/htlc/evm/claimHtlc.ts
npx ts-node ts-sdk/htlc/sui/claimHtlc.ts
```
# ✅ EVM ➡️ Sui
```
# Lock on EVM
npx ts-node ts-sdk/htlc/evm/lockHtlc.ts <sui_user> ETH 0.01

# Lock on Sui
npx ts-node ts-sdk/htlc/sui/respondLockHtlc.ts <evm_user> 0x2::sui::SUI 50000000

# Claim on both sides
npx ts-node ts-sdk/htlc/sui/claimHtlc.ts
npx ts-node ts-sdk/htlc/evm/claimHtlc.ts
```

## Notes
# .env structure for testing, including a set of private keys for Sui wallets and EVM wallets for deploying, locking, and claiming.
```
LOCKER_PRIVKEY=
CLAIMER_PRIVKEY=
DEPLOYER_PRIVKEY=

EVM_DEPLOYER_PRIVKEY=
EVM_LOCKER_PRIVKEY=
EVM_CLAIMER_PRIVKEY=

SUI_RPC_URL=
EVM_SEPOLIA_RPC_URL=
```

## 🧑‍💻 Author
Developed by @degenshoyu during ETHGlobal Unite DeFi Hackathon
Part of the ctScreener ecosystem
