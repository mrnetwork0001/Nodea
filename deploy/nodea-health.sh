#!/usr/bin/env sh
#
# Operator gas alarm. The daemon's most likely production failure is the dullest one: the operator
# runs out of COTI mid-sweep, `submitProof` stops landing, and every node quietly accrues SLA
# breaches that are permanent and public. Nothing in the app watches for this.
#
# Needs no private key - it reads a public balance over JSON-RPC. Keep it that way.
#
#   sudo cp deploy/nodea-health.sh /usr/local/bin/nodea-health
#   sudo chmod +x /usr/local/bin/nodea-health
#   sudo crontab -e
#     0 * * * * NODEA_OPERATOR_ADDRESS=0x... /usr/local/bin/nodea-health
#
# Silent when healthy, so cron only mails you when it matters. Exits 1 below the threshold.

set -eu

RPC_URL="${NODEA_RPC_URL:-https://mainnet.coti.io/rpc}"
ADDRESS="${NODEA_OPERATOR_ADDRESS:-}"
# ~0.005 COTI per settlement, so 0.25 is roughly 50 jobs of warning - enough time to notice a
# cron mail and act before any node takes a breach.
MIN_COTI="${NODEA_MIN_COTI:-0.25}"

if [ -z "$ADDRESS" ]; then
  echo "nodea-health: set NODEA_OPERATOR_ADDRESS to the operator's public address" >&2
  exit 2
fi

WEI_HEX=$(
  curl -fsS --max-time 20 "$RPC_URL" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"]}" \
  | sed -n 's/.*"result":"\(0x[0-9a-fA-F]*\)".*/\1/p'
)

if [ -z "$WEI_HEX" ]; then
  echo "nodea-health: no balance in the RPC reply from $RPC_URL" >&2
  exit 2
fi

# awk only. The obvious tools are not safe to assume: `dc` ships in the bc package rather than
# coreutils and a minimal Ubuntu has neither, while shell arithmetic is 64-bit and would overflow
# above ~9.2 COTI. awk is Essential on every Debian derivative and its doubles carry ~15 significant
# digits, so a balance is exact to far beyond the milli-COTI this threshold cares about.
COTI=$(printf '%s' "${WEI_HEX#0x}" | awk '{
  s = tolower($0); v = 0
  for (i = 1; i <= length(s); i++) {
    d = index("0123456789abcdef", substr(s, i, 1)) - 1
    if (d < 0) exit 1
    v = v * 16 + d
  }
  printf "%.4f", v / 1e18
}') || COTI=""

if [ -z "$COTI" ]; then
  echo "nodea-health: could not parse the balance $WEI_HEX" >&2
  exit 2
fi

if awk -v a="$COTI" -v b="$MIN_COTI" 'BEGIN { exit !(a < b) }'; then
  echo "nodea-health: operator $ADDRESS is at $COTI COTI, below $MIN_COTI."
  echo "Top it up. Once it hits zero, settlements stop and every node starts taking SLA breaches."
  exit 1
fi

exit 0
