#!/usr/bin/env bash

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# root directory of the git repo
REPO_ROOT=$(realpath $SCRIPT_DIR/../../)

source $REPO_ROOT/scripts/common.bash

cd $REPO_ROOT

# clean previous builds
logInfo "cleaning previous build ..."
rm -rf dist/
rm -rf web/dist/

# build backend app
logInfo "building backend app ..."
npm run build

# build frontend app
logInfo "building frontend app ..."
cd $REPO_ROOT/web
npm run build

# configure the app systemd unit
logInfo "configuring systemd unit ..."
cp $REPO_ROOT/scripts/templates/app.service.in $REPO_ROOT/scripts/$APP_NAME.service
sed -i "s|@APP_INSTALL_ROOT@|$APP_INSTALL_ROOT|g" $REPO_ROOT/scripts/$APP_NAME.service

cd $REPO_ROOT
currVersion=$(node -p "require('$REPO_ROOT/package.json').version")
tarName="$APP_NAME-v$currVersion.tar.gz"
echo "packaging '$tarName' ..."
tar -czf $tarName                    \
    package.json                     \
    dist/                            \
    web/dist/                        \
    scripts/*.service                \
    scripts/*.bash                   \
    prisma.config.ts                 \
    prisma/schema.prisma
