#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo "🛡️ CODITENT CONTAINER VULNERABILITY SCANNER (TRIVY)"
echo "========================================================"

if ! command -v trivy &> /dev/null; then
    echo "⚠️ Trivy scanner not found on host. Downloading official Trivy binary..."
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /tmp/bin
    TRIVY_BIN="/tmp/bin/trivy"
else
    TRIVY_BIN="trivy"
fi

IMAGES=(
    "coditent-api"
    "coditent-proxy"
)

for IMG in "${IMAGES[@]}"; do
    echo ""
    echo "--------------------------------------------------------"
    echo "🔍 Scanning Docker Image: ${IMG}"
    echo "--------------------------------------------------------"
    ${TRIVY_BIN} image --severity HIGH,CRITICAL "${IMG}" || true
done

echo ""
echo "========================================================"
echo "✅ Security vulnerability scan completed."
echo "========================================================"
