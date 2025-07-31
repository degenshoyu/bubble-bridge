#!/bin/bash

SCRIPT_DIR="$(dirname "$0")"

PACKAGE_ID=$(cat "$SCRIPT_DIR/last_package_id.txt")
HTLC_ID="${1:-$(jq -r '.htlc_id' "$SCRIPT_DIR/last_htlc_object.json")}"

if [ -z "$PACKAGE_ID" ] || [ -z "$HTLC_ID" ]; then
  echo "❌ Missing required data. Provide HTLC_ID or ensure files exist:"
  echo "   - $SCRIPT_DIR/last_package_id.txt"
  echo "   - $SCRIPT_DIR/last_htlc_object.json"
  exit 1
fi

echo "📦 PACKAGE_ID : $PACKAGE_ID"
echo "🔗 HTLC_ID    : $HTLC_ID"

RESPONSE=$(sui client call \
  --package "$PACKAGE_ID" \
  --module htlc \
  --function refund \
  --args "$HTLC_ID" \
  --gas-budget 300000000)

if [ $? -ne 0 ]; then
  echo "❌ Refund transaction failed"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ HTLC refund successful"
