APP_NAME="thermo-logger"
REPO="hankedan000/$APP_NAME"
TMP_DIR="/tmp/$APP_NAME"
DOWNLOADS_DIR="$TMP_DIR/downloads"
UPDATE_DIR="$TMP_DIR/update"
APP_INSTALL_ROOT="/opt/$APP_NAME"

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