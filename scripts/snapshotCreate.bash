#!/usr/bin/env bash

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

pushd $SCRIPT_DIR/../ > /dev/null
mkdir -p snapshots
timestamp=$(date +"%Y%m%d-%H%M%S")
snapshotPath="snapshots/${timestamp}.tar.gz"
echo "creating ${snapshotPath} ..."
tar --exclude="snapshots" -czf ${snapshotPath} .
popd > /dev/null