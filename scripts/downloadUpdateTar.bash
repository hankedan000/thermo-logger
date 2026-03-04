#!/usr/bin/env bash

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

source $SCRIPT_DIR/common.bash

# validate input arg count
if [ $# -lt 1 ]; then
    logError "Missing required version arg"
    exit 1
fi

# validate the input version
ver=$1
parseVersion $ver
if [ $? -eq 1 ]; then
    logError "Failed to parse version! (ver='$ver')"
    exit 1
fi

mkdir -p $DOWNLOADS_DIR # make the dir if doesn't exist yet
cd $DOWNLOADS_DIR
rm -f update.tar.gz # cleanup any existing downloads

url="https://github.com/$REPO/releases/download/v$major.$minor.$patch/$APP_NAME-v$major.$minor.$patch.tar.gz"
logInfo "Downloading update '$url' ..."
curl -L -o update.tar.gz $url
