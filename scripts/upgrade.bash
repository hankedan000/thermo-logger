#!/usr/bin/env bash
# this script is intended to be package in the release tarball and then
# ran by update.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
APP_DIR=$(realpath $SCRIPT_DIR/../)
TMP_DIR="/tmp/thermo-logger-update"
REPO="hankedan000/thermo-logger"

echo "Checking for updates..."

LATEST=$(curl -s https://api.github.com/repos/$REPO/releases/latest \
    | grep tag_name \
    | cut -d '"' -f 4)

CURRENT=$(node -p "require('$APP_DIR/package.json').version")

if [ "$LATEST" != "v$CURRENT" ]; then
    echo "Updating to $LATEST ..."

    mkdir -p $TMP_DIR
    cd $TMP_DIR

    curl -L -o update.tar.gz \
    https://github.com/$REPO/releases/latest/download/thermo-logger-v$LATEST.tar.gz

    tar -xzf update.tar.gz
    rm -f update.tar.gz

    bash scripts/install.bash
else
    echo "Already up to date."
fi