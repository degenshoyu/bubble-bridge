#!/bin/bash

cd "$(dirname "$0")/../htlc-on-sui" || exit 1

echo "🚧 Building the HTLC contract..."
sui move build
if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "🚀 Publishing to Sui Testnet (JSON mode)..."
PUBLISH_JSON=$(sui client publish --gas-budget 500000000 --json)

DEPLOYER=$(sui client active-address)

PACKAGE_ID=$(echo "$PUBLISH_JSON" | jq -r '.objectChanges[] | select(.type == "published") | .packageId')

MODULES=$(echo "$PUBLISH_JSON" | jq -r '.objectChanges[] | select(.type == "published") | .modules[]' | paste -sd "," -)

OBJECTS=$(echo "$PUBLISH_JSON" | jq -r '.objectChanges[] | select(.type == "created") | "\(.objectType) → \(.objectId)"')

PACKAGE_FILE="$(dirname "$0")/last_package_id.txt"
echo "$PACKAGE_ID" > "$PACKAGE_FILE"

echo "========================================"
echo "✅ HTLC Contract Deployed Successfully!"
echo "👤 Deployer Address : $DEPLOYER"
echo "📦 Package ID       : $PACKAGE_ID"
echo "📚 Modules Deployed : [$MODULES]"
echo "📦 Created Objects  :"
echo "$OBJECTS"
echo "📝 Saved to         : $PACKAGE_FILE"
echo "========================================"
