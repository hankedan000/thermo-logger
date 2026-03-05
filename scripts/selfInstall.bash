#!/usr/bin/env bash
# this script is intended to be packaged in the release tarball and then
# ran by installUpdateTar.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
DB_PATH="thermo.db"
DB_MIGRATIONS_PATH="prisma/migrations"
NODE_MODULES_PATH="node_modules"

source $SCRIPT_DIR/common.bash

# put running app into an "UPDATING" state by sending the HANGUP signal.
# this makes sure the app is no longer modifying the database, allowing
# us to safely make a copy and upgrade it.
logInfo "Requesting running instance to disconnect from database ..."
sudo pkill -HUP thermo-logger
sleep 5 # give it some extra time to disconnect

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
    dryRunPort=4000
    node dist/main.js --port=$dryRunPort &
    dryRunPID=$!

    # poll localhost:$dryRunPort for up to 5s to verify the dry-run started
    started=0
    attempts=10
    while [ $attempts -gt 0 ]; do
        # if process died, stop polling
        if ! kill -0 "$dryRunPID" 2>/dev/null; then
            break
        fi
        # try an HTTP request; succeed fast if server is up
        if curl -sSf --max-time 1 http://localhost:$dryRunPort/ >/dev/null 2>&1; then
            started=1
            break
        fi
        sleep 0.5
        attempts=$((attempts-1))
    done

    if [ $started -eq 1 ] && kill -0 "$dryRunPID" 2>/dev/null; then
        logInfo "Dry run started! Go to http://localhost:$dryRunPort to test it out."
    else
        logError "Dry run failed to start!"
        exit 1
    fi

    # wait for user to accept/reject the dry runned app
    if read -t 120 -p "You have 2mins to accept the update. (y/n): " answer; then
        if [[ "$answer" != "y" ]]; then
            logInfo "Update rejected!"
            stopProcess $dryRunPID 5 # gracefully stop, but force kill after 5s
            exit 0 # don't continue with install
        fi
    else
        logInfo "Dry run timed out!"
        stopProcess $dryRunPID 5 # gracefully stop, but force kill after 5s
        exit 0 # don't continue with install
    fi

    # Update was accepted. Stop the dry run app first.
    stopProcess $dryRunPID 5 # gracefully stop, but force kill after 5s
fi

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

logInfo "Restarting systemd units ... (server will restart immenantly)"
sleep 2 # give server some time to send that log to the user before we restart it
sudo systemctl restart $APP_NAME

logInfo "Upgrade complete!"
