#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

source $SCRIPT_DIR/common.bash

thisAppDir=$(realpath $SCRIPT_DIR/../)
logInfo "Checking current version of app at '$thisAppDir' ..."
currentVer=$(node -p "require('$thisAppDir/package.json').version")
parseVersion $currentVer
if [ $? -eq 1 ]; then
    logError "Failed to parse current version! (currentVer='$currentVer')"
    exit 1
fi
currMajor=$major
currMinor=$minor
currPatch=$patch
logInfo "currentVer=v${currMajor}.${currMinor}.${currPatch}"

logInfo "Checking latest version on github ..."
latestVer=$(curl -s https://api.github.com/repos/$REPO/releases/latest \
    | grep tag_name \
    | cut -d '"' -f 4)
parseVersion $latestVer
if [ $? -eq 1 ]; then
    logError "Failed to parse latest version! (latestVer='$latestVer')"
    exit 1
fi
nextMajor=$major
nextMinor=$minor
nextPatch=$patch
logInfo "latestVer=v${nextMajor}.${nextMinor}.${nextPatch}"

if [ $nextMajor -gt $currMajor ] || [ $nextMinor -gt $currMinor ] || [ $nextPatch -gt $currPatch ]; then
    logInfo "There's a new version! $latestVer"
    echo "${nextMajor}.${nextMinor}.${nextPatch}" # print latest version to stdout
    exit 2
elif [ $nextMajor -eq $currMajor ] && [ $nextMinor -eq $currMinor ] && [ $nextPatch -eq $currPatch ]; then
    logInfo "Already up to date."
    exit 0
else
    exit 1 # general error
fi