#!/usr/bin/env bash

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

function showUsage() {
    echo "snapshotRestore.bash <SNAPSHOT_PATH>"
}

if [ $# -lt 1 ]; then
    echo "missing required args!"
    showUsage
    exit 1
fi

snapshotPath=$1

if [ ! -f ${snapshotPath} ]; then
    echo "snapshotPath '${snapshotPath}' doesn't exist!"
    showUsage
    exit 1
fi

# we need the path to be absolute when we go to extract it
snapshotPath=$(realpath $snapshotPath)
echo "snapshotPath='${snapshotPath}'"

# test if the tar file is okay
echo "checking snapshot integrity ..."
tar -tzf $snapshotPath &> /dev/null
testStat=$?
if [ $testStat -eq 0 ]; then
    echo "snapshot okay!"
else
    echo "snapshot failed integrity test! refusing to restore it."
    exit 2
fi

pushd $SCRIPT_DIR/../ > /dev/null
echo "clearing old installation ..."
find . -path "./snapshots" -prune -o -exec rm -rf {} \;
echo "extracting snapshot ..."
tar -xzf $snapshotPath
popd > /dev/null