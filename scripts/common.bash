REPO="hankedan000/thermo-logger"
TMP_DIR="/tmp/thermo-logger"
DOWNLOADS_DIR="$TMP_DIR/downloads"
UPDATE_DIR="$TMP_DIR/update"

function logInfo() {
  echo "[INFO] $*" >&2
}

function logError() {
  echo "[ERROR] $*" >&2
}

function parseVersion() {
    local version="${1#v}"

    if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        major="${BASH_REMATCH[1]}"
        minor="${BASH_REMATCH[2]}"
        patch="${BASH_REMATCH[3]}"
    else
        return 1
    fi
}