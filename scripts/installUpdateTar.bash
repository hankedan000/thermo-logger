#!/usr/bin/env bash
# this script is intended to be package in the release tarball and then
# ran by update.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

source $SCRIPT_DIR/common.bash

# validate input arg count
if [ $# -lt 1 ]; then
    logError "Missing required argument to update tar path"
    exit 1
fi

# validate the input filepath
updatePath=$1
if [ ! -f $updatePath ]; then
    logError "Update '$updatePath' doesn't exist!"
    exit 1
fi

rm -rf $UPDATE_DIR # clean any previous update artifacts
mkdir -p $UPDATE_DIR # make the dir if doesn't exist yet
cd $UPDATE_DIR

logInfo "Extracting '$updatePath' ..."
tar -xzf $updatePath

logInfo "Running selfInstall.bash ..."
bash scripts/selfInstall.bash
