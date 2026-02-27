#!/usr/bin/env bash
# this script is intended to be packaged in the release tarball and then
# ran by installUpdateTar.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
UPDATE_ROOT=$(realpath $SCRIPT_DIR/..)
APP_DIR="/opt/thermo-logger"
DB_PATH="thermo.db"
DB_MIGRATIONS_PATH="prisma/migrations"
NODE_MODULES_PATH="node_modules"

source $SCRIPT_DIR/common.bash

logInfo "Stopping services ..."
sudo systemctl stop thermo-logger

cd $UPDATE_ROOT

# copy existing database artifacts and node_modules prior to updating
if [ -f "$APP_DIR/$DB_PATH" ]; then
    logInfo "Copying database ..."
    cp "$APP_DIR/$DB_PATH" "./$DB_PATH"
fi
if [ -d "$APP_DIR/$DB_MIGRATIONS_PATH" ]; then
    logInfo "Copying database migrations ..."
    cp -r "$APP_DIR/$DB_MIGRATIONS_PATH" "./$DB_MIGRATIONS_PATH"
fi
if [ -d "$APP_DIR/$NODE_MODULES_PATH" ]; then
    logInfo "Copying node_modules ..."
    cp -r "$APP_DIR/$NODE_MODULES_PATH" "./$NODE_MODULES_PATH"
    cp "$APP_DIR/package-lock.json" "./"
fi

logInfo "Installing node dependencies ..."
npm install --omit=dev

# migrate the database if one exists, else create a fresh one
if [ -f $DB_PATH ]; then
    oldVersion=$(node -p "require('$APP_DIR/package.json').version")
    newVersion=$(node -p "require('$UPDATE_ROOT/package.json').version")
    logInfo "Migrating existing database from v$oldVersion to v$newVersion ..."
    npx prisma migrate dev --name upgrade-v$oldVersion-to-v$newVersion
else
    logInfo "Creating initial basebase ..."
    npx prisma migrate dev --name init
fi

# TODO would be good to do a dry-run of the app to make sure it's okay

# install the update
logInfo "Installing app ..."
sudo mkdir -p $APP_DIR # if it didn't exist already
sudo rm -rf $APP_DIR/* # remove old install if it existed
sudo cp -r $UPDATE_ROOT/* $APP_DIR/
sudo rm -f $APP_DIR/scripts/selfInstall.bash # don't need this once we're done
sudo rm -f $APP_DIR/scripts/*.service # don't need service files in here

logInfo "Installing systemd units ..."
sudo cp $SCRIPT_DIR/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable thermo-logger

logInfo "Starting systemd units ..."
sudo systemctl start thermo-logger

logInfo "Upgrade complete!"
