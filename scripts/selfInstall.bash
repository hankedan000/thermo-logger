#!/usr/bin/env bash
# this script is intended to be packaged in the release tarball and then
# ran by installUpdateTar.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
DB_PATH="thermo.db"
DB_MIGRATIONS_PATH="prisma/migrations"
NODE_MODULES_PATH="node_modules"

source $SCRIPT_DIR/common.bash

# TODO request app to stop recording and disconnect from database

thisUpdateRoot=$(realpath $SCRIPT_DIR/..)
cd $thisUpdateRoot

# copy existing database artifacts and node_modules prior to updating
if [ -f "$APP_INSTALL_ROOT/$DB_PATH" ]; then
    logInfo "Copying database ..."
    cp "$APP_INSTALL_ROOT/$DB_PATH" "./$DB_PATH"
fi
if [ -d "$APP_INSTALL_ROOT/$DB_MIGRATIONS_PATH" ]; then
    logInfo "Copying database migrations ..."
    cp -r "$APP_INSTALL_ROOT/$DB_MIGRATIONS_PATH" "./$DB_MIGRATIONS_PATH"
fi
if [ -d "$APP_INSTALL_ROOT/$NODE_MODULES_PATH" ]; then
    logInfo "Copying node_modules ..."
    cp -r "$APP_INSTALL_ROOT/$NODE_MODULES_PATH" "./$NODE_MODULES_PATH"
    cp "$APP_INSTALL_ROOT/package-lock.json" "./"
fi

logInfo "Installing node dependencies ..."
npm install --omit=dev

# migrate the database if one exists, else create a fresh one
doDryRun=0
if [ -f $DB_PATH ]; then
    oldVersion=$(node -p "require('$APP_INSTALL_ROOT/package.json').version")
    newVersion=$(node -p "require('$thisUpdateRoot/package.json').version")
    logInfo "Migrating existing database from v$oldVersion to v$newVersion ..."
    npx prisma migrate dev --name upgrade-v$oldVersion-to-v$newVersion
    doDryRun=1
else
    logInfo "Creating initial basebase ..."
    npx prisma migrate dev --name init
fi

if [ $doDryRun -eq 1 ]; then
    # run app on a different port to test that the update went okay
    node dist/main.js --port=3000 &
    pid=$!

    if kill -0 "$pid" 2>/dev/null; then
        logInfo "App dry run started! Go to http://localhost:3000 to test it out."
    else
        logError "App dry run seems to have failed to start"
        exit 1
    fi

    # wait for user to accept/reject the dry runned app
    read -p "Accept dry run? (y/n): " answer
    if [[ "$answer" != "y" ]]; then
        logInfo "Dry run rejected!"
        stopProcess $pid 5 # gracefully stop the app, but force kill after 5s
        exit 0 # don't continue with install
    fi

    stopProcess $pid 5 # gracefully stop the app, but force kill after 5s
fi

sudo systemctl stop $APP_NAME

# install the update
logInfo "Installing app ..."
sudo mv $SCRIPT_DIR/*.service /etc/systemd/system/
sudo mkdir -p $APP_INSTALL_ROOT # if it didn't exist already
sudo rm -rf $APP_INSTALL_ROOT/* # remove old install if it existed
sudo mv $thisUpdateRoot/* $APP_INSTALL_ROOT/
sudo rm -f $APP_INSTALL_ROOT/scripts/selfInstall.bash # don't need this once we're done

logInfo "Installing systemd units ..."
sudo systemctl daemon-reload
sudo systemctl enable $APP_NAME

logInfo "Starting systemd units ..."
sudo systemctl start $APP_NAME

logInfo "Upgrade complete!"
