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

function stopProcess() {
  local pid="$1"
  local timeout="${2:-10}"   # default 10 seconds

  if ! kill -0 "$pid" 2>/dev/null; then
    logError "Process $pid is not running"
    return 0
  fi

  logInfo "Sending SIGTERM to $pid..."
  kill "$pid"

  # Wait up to timeout seconds
  for ((i=0; i<timeout; i++)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      logInfo "Process exited gracefully"
      wait "$pid" 2>/dev/null
      return 0
    fi
    sleep 1
  done

  logInfo "Timeout reached. Sending SIGKILL..."
  kill -9 "$pid"

  wait "$pid" 2>/dev/null
  logInfo "Process force killed"
}