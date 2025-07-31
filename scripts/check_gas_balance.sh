#!/bin/bash

echo "🔍 Checking total SUI balance..."

total_sui=$(sui client gas --json 2>/dev/null | jq '[.[].suiBalance | tonumber] | add')

echo "✅ Total SUI balance: ${total_sui} SUI"
