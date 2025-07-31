#!/bin/bash

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <RECIPIENT_ADDRESS> <COIN_TYPE> [AMOUNT] [TIMELOCK] [HASH_LOCK_HEX]"
  echo "Example: $0 0xabc... 0x2::sui::SUI 100000000"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "❌ jq not found. Please install jq to continue."
  exit 1
fi

RECIPIENT="$1"
COIN_TYPE="$2"
AMOUNT="${3:-100000000}"
TIMELOCK="${4:-$(($(date +%s) + 300))}"
HASH_LOCK_HEX="${5:-$(jq -r '.hash_lock' "$(dirname "$0")/last_hash.json")}"
SCRIPT_DIR="$(dirname "$0")"
PACKAGE_ID=$(cat "$SCRIPT_DIR/last_package_id.txt")

HASH_VEC=$(echo "$HASH_LOCK_HEX" | sed 's/../0x&,/g' | sed 's/,$//')

echo "📦 PACKAGE_ID: $PACKAGE_ID"
echo "🎯 RECIPIENT: $RECIPIENT"
echo "🔐 HASH_LOCK: $HASH_LOCK_HEX"
echo "🕒 TIMELOCK: $TIMELOCK"
echo "💰 AMOUNT: $AMOUNT"
echo "🪙 COIN_TYPE: $COIN_TYPE"

RESPONSE=$(sui client call \
  --package "$PACKAGE_ID" \
  --module swap \
  --function init_swap \
  --type-args "$COIN_TYPE" \
  --raw-args "$RECIPIENT" address \
              "$HASH_LOCK_HEX" "vector<u8>" \
              "$TIMELOCK" u64 \
              "$AMOUNT" u64 \
  --gas-budget 500000000 \
  --json 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to execute lock call"
  echo "$RESPONSE"
  exit 1
fi

HTLC_ID=$(echo "$RESPONSE" | jq -r --arg pkg "$PACKAGE_ID" '.objectChanges[]? | select(.type == "created" and (.objectType | startswith("\($pkg)::htlc::HTLC"))) | .objectId')

if [ -z "$HTLC_ID" ]; then
  echo "❌ HTLC object ID not found in response."
  echo "Raw response:"
  echo "$RESPONSE"
  exit 1
fi

OUT_FILE="$SCRIPT_DIR/last_htlc_object.json"
echo "{\"htlc_id\": \"$HTLC_ID\"}" > "$OUT_FILE"

echo "✅ HTLC object created: $HTLC_ID"
echo "📝 Saved to: $OUT_FILE"
