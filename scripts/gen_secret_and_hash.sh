#!/bin/bash

SECRET=$(openssl rand -hex 16)

HASH_LOCK="0x$(echo -n "$SECRET" | openssl dgst -sha256 -binary | xxd -p -c 256)"

echo "✅ Secret: $SECRET"
echo "🔒 Hash Lock (hex): $HASH_LOCK"

HASH_FILE="$(dirname "$0")/last_hash.json"
echo "{\"secret\": \"$SECRET\", \"hash_lock\": \"$HASH_LOCK\"}" > "$HASH_FILE"
echo "📝 Saved to: $HASH_FILE"
