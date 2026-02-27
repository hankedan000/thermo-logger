import { createServer, STATUS_CODES } from "http";
import { hideBin } from 'yargs/helpers';
import { ThermoServer, TMP_EXPORTS_DIR } from "./server/ThermoServer"
import { WebSocketServer } from 'ws';
import * as Prisma from "./db/prisma";
import * as fs from "fs";
import cors from "cors";
import express from "express";
import path from "path";
import yargs from 'yargs';
import { PrismaClient } from "./generated/prisma/client";
import { StatusCodes } from "http-status-codes";

const DEFAULT_BACKEND_PORT = 3000;

let prisma: PrismaClient | undefined;

async function main() {
  const argv = yargs(hideBin(process.argv))
      .scriptName('movie-poster')
      .usage('$0 [options]')
      .option('port', {
          type: 'number',
          default: DEFAULT_BACKEND_PORT,
          description: 'Port # to use for express app'
      })
      .option('dbPath', {
          type: 'string',
          default: './thermo.db',
          description: 'Path to database file'
      })
      .option('config', {
          type: 'string',
          default: '',
          description: 'Path to optional config file'
      })
      .alias('h', 'help')
      .parseSync();

  prisma = Prisma.connect(`file:${argv.dbPath}`);
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const thermoServer = new ThermoServer(prisma);

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
  app.use(cors()); // permit cross-origin requests (ex. file:// loading from http://localhost)

  // Routes
  app.use(express.static(path.join(__dirname, "../web/dist")));

  app.get("/api/server_state", async (req, res) => {
    res.json({
      'activeSessionId': thermoServer.getActiveSessionId()
    });
  });

  app.get("/api/sensors", async (req, res) => {
    const sensors = await thermoServer.getUI_SensorInfos();
    res.json(sensors);
  });

  app.get("/api/sessions", async (req, res) => {
    const restResp = await thermoServer.getUI_RecordSessionInfos();
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/rename_sensor", async (req, res) => {
    const { sensorId, newName } = req.body;
    const restResp = await thermoServer.renameSensor(sensorId, newName);
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/start_session", async (req, res) => {
    const restResp = await thermoServer.startSession(
      req.body.sessionName,
      req.body.sampleRateMs,
      req.body.sensorIdsToRecord,
      req.body.notes);
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/stop_session", async (req, res) => {
    const restResp = await thermoServer.stopSession();
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/delete_session", async (req, res) => {
    const restResp = await thermoServer.deleteSession(req.body.sessionId);
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/export_session", async (req, res) => {
    const restResp = await thermoServer.exportSession(req.body.sessionId);
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.get("/api/download_session/:filename", async (req, res) => {
    const filename = req.params.filename;
    console.log(`download_session - filename='${filename}'`);

    // Resolve full path, and check to prevent path traversal
    const filePath = path.resolve(TMP_EXPORTS_DIR, filename);
    if ( ! filePath.startsWith(TMP_EXPORTS_DIR)) {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid filename");
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).end();
      }
    });
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
    if (prisma) {
      await prisma.$disconnect()
      prisma = undefined;
    }
  })
  .catch(async (e) => {
    console.error(e)
    if (prisma) {
      await prisma.$disconnect()
      prisma = undefined;
    }
    process.exit(1)
  })
