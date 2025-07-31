#!/bin/bash

SCRIPT_DIR="$(dirname "$0")"

PACKAGE_ID=$(cat "$SCRIPT_DIR/last_package_id.txt")

SECRET="${1:-$(jq -r '.secret' "$SCRIPT_DIR/last_hash.json")}"
HTLC_ID="${2:-$(jq -r '.htlc_id' "$SCRIPT_DIR/last_htlc_object.json")}"

if [ -z "$PACKAGE_ID" ] || [ -z "$SECRET" ] || [ -z "$HTLC_ID" ]; then
  echo "❌ Missing required data. Provide secret + htlc_id or ensure files exist:"
  echo "   - $SCRIPT_DIR/last_package_id.txt"
  echo "   - $SCRIPT_DIR/last_hash.json"
  echo "   - $SCRIPT_DIR/last_htlc_object.json"
  exit 1
fi

echo "📦 PACKAGE_ID : $PACKAGE_ID"
echo "🔐 SECRET     : $SECRET"
echo "🔗 HTLC_ID    : $HTLC_ID"

RESPONSE=$(sui client call \
  --package "$PACKAGE_ID" \
  --module htlc \
  --function unlock \
  --args "$SECRET" "$HTLC_ID" \
  --gas-budget 300000000)

if [ $? -ne 0 ]; then
  echo "❌ Claim transaction failed"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Successfully claimed HTLC"
