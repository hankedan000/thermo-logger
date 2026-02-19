# thermo-logger
Raspberry Pi based temperature logger

# Quick Start (dev)
```bash
npm install
npx prisma generate # generates typescript code based on schema
npx prisma migrate dev --name init # creates the initial dev.db database
npx tsx src/server.ts --config config/sim_config.json # run server insimulation mode
```