import { createServer } from "http";
import { prisma } from "./db/prisma";
import { hideBin } from 'yargs/helpers';
import { ThermoServer } from "./server/ThermoServer"
import { WebSocketServer } from 'ws';
import * as fs from "fs";
import yargs from 'yargs';
import express from "express";
import path from "path";

const DEFAULT_BACKEND_PORT = 3000;

async function main() {
  const argv = yargs(hideBin(process.argv))
      .scriptName('movie-poster')
      .usage('$0 [options]')
      .option('port', {
          type: 'number',
          default: DEFAULT_BACKEND_PORT,
          description: 'Port # to use for express app'
      })
      .option('config', {
          type: 'string',
          default: '',
          description: 'Path to optional config file'
      })
      .alias('h', 'help')
      .parseSync();

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const thermoServer = new ThermoServer();

  if (argv.config.length > 0) {
      const raw = fs.readFileSync(argv.config, "utf-8");
      const config = JSON.parse(raw);
      
    if ('simSensors' in config) {
      const simSensors = config['simSensors'] as string[];
      console.info(`loading simSensors: [${simSensors}] ...`);
      await thermoServer.loadSimSensors(simSensors);
    }
  }

  // Middleware
  app.use(express.json());

  // Routes
  app.use(express.static(path.join(__dirname, "../web/dist")));

  app.get("/api/sensors", async (req, res) => {
    const sensors = await thermoServer.getUI_SensorInfos();
    res.json(sensors);
  });

  // Handle web socket connections
  wss.on('connection', ws => {
    thermoServer.addNewClient(ws);
  });

  // Start web server
  server.listen(argv.port, () => {
    console.log(`Server running on port ${argv.port}`);
  });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
