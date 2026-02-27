#!/usr/bin/env bash

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# root directory of the git repo
REPO_ROOT=$(realpath $SCRIPT_DIR/../)

cd $REPO_ROOT

# clean previous builds
echo "cleaning previous build ..."
rm -rf dist/
rm -rf web/dist/

# build backend app
echo "building backend app ..."
npm run build

# build frontend app
echo "building frontend app ..."
cd $REPO_ROOT/web
npm run build

cd $REPO_ROOT
currVersion=$(node -p "require('$REPO_ROOT/package.json').version")
tarName="thermo-logger-v$currVersion.tar.gz"
echo "packaging '$tarName' ..."
tar -czf $tarName                    \
    package.json                     \
    dist/                            \
    web/dist/                        \
    scripts/thermo-logger.service    \
    scripts/checkForUpdate.bash      \
    scripts/common.bash              \
    scripts/downloadUpdateTar.bash   \
    scripts/installUpdateTar.bash    \
    scripts/selfInstall.bash         \
    prisma.config.ts                 \
    prisma/schema.prisma
