# thermo-logger
Raspberry Pi based temperature logger

# Quick Start (simulated dev environment)
```bash
# do these commands once
npm install
npm run build # generates backend database from scheme
npm run db:init # creates the initial dev.db database
npm run web:build # generates react web UI

# start the backend server app (watches for changes)
npm run dev_sim

# ... in another shell
cd web
npm run dev # starts the vite web UI
```