#!/usr/bin/env bash
# this script is intended to be packaged in the release tarball and then
# ran by update.bash to install the new release on the target.

# get directory where this script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
UPDATE_ROOT=$(realpath $SCRIPT_DIR/..)
APP_DIR="/opt/thermo-logger"

echo "Stopping services ..."
sudo systemctl stop thermo-logger

cd $UPDATE_ROOT
echo "Installing node dependencies ..."
npm install --omit=dev

# migrate the database if one exists, else create a fresh one
if [ -f $APP_DIR/thermo.db ]; then
    oldVersion=$(node -p "require('$APP_DIR/package.json').version")
    newVersion=$(node -p "require('$UPDATE_ROOT/package.json').version")
    echo "Migrating existing database from v$oldVersion to v$newVersion ..."
    cp $APP_DIR/thermo.db ./
    npx prisma migrate dev --name upgrade-v$oldVersion-to-v$newVersion
else
    echo "Creating initial basebase ..."
    npx prisma migrate dev --name init
fi

# TODO would be good to do a dry-run of the app to make sure it's okay

# install the update
echo "Installing node app ..."
sudo mkdir -p $APP_DIR # if it didn't exist already
sudo rm -rf $APP_DIR/* # remove old install if it existed
sudo cp -r $UPDATE_ROOT/* $APP_DIR/
sudo rm -f $APP_DIR/scripts/install.bash # don't need this once we're done
sudo rm -f $APP_DIR/scripts/*.service # don't need service files in here

echo "Installing systemd units ..."
sudo cp $SCRIPT_DIR/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable thermo-logger
sudo systemctl start thermo-logger

echo "Upgrade complete!"