import { createServer } from "http";
import { hideBin } from 'yargs/helpers';
import { ServerState, ThermoServer, TMP_EXPORTS_DIR } from "./server/ThermoServer"
import { WebSocketServer } from 'ws';
import * as fs from "fs";
import * as os from "os";
import cors from "cors";
import express from "express";
import path from "path";
import yargs from 'yargs';
import { StatusCodes } from "http-status-codes";
import checkDiskSpace from "check-disk-space";
import { Version } from "./utils/version";

const DEFAULT_BACKEND_PORT = 3000;
const { version } = require("../package.json");

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

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const thermoServer = new ThermoServer(`file:${argv.dbPath}`);
  const currVersion = Version.parse(version);

  process.title = 'thermo-logger';
  process.on('SIGINT', async () => {
    console.log(`on SIGINT (pid=${process.pid})`);
    if (thermoServer) {
      await thermoServer.shutdown();
      process.exit(0);
    }
  });

  process.on('SIGTERM', async () => {
    console.log(`on SIGTERM (pid=${process.pid})`);
    if (thermoServer) {
      await thermoServer.shutdown();
      process.exit(0);
    }
  });

  process.on('SIGHUP', async () => {
    console.log(`on SIGHUP (pid=${process.pid})`);
    if (thermoServer) {
      await thermoServer.setState(ServerState.UPDATING);
    }
  });

  if ( ! await thermoServer.setState(ServerState.OPERATING)) {
    console.error('Failed to transition server to OPERATING');
    process.exit(1);
  }

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

  app.get("/api/server_status", async (req, res) => {
    const disk = await checkDiskSpace('/');
    res.json({
      'version': version,
      'serverState': thermoServer.getServerState() as string,
      'activeSessionId': thermoServer.getActiveSessionId(),
      'totalRAM': os.totalmem(),
      'freeRAM': os.freemem(),
      'totalDisk': disk.size,
      'freeDisk': disk.free
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

  app.post("/api/start_server_update", async (req, res) => {
    console.log(`start_server_update - newVersion = '${req.body.newVersion}'`);
    let newVersion: Version | undefined = undefined;
    try {
      newVersion = Version.parse(req.body.newVersion);
    } catch (err: any) {
      res.status(StatusCodes.BAD_REQUEST).json(
        {error: 'Failed to parse requested newVersion.'});
      return;
    }

    // make sure the version is newer than our current
    if (newVersion && newVersion.compare(currVersion) <= 0) {
      res.status(StatusCodes.BAD_REQUEST).json(
        {error: `Requested version (${newVersion.toString()}) must be >= current version (${currVersion.toString()}).`});
      return;
    }

    const restResp = await thermoServer.startServerUpdate(newVersion);
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/accept_server_update", async (req, res) => {
    const restResp = await thermoServer.acceptServerUpdate();
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
  });

  app.post("/api/cancel_server_update", async (req, res) => {
    const restResp = await thermoServer.cancelServerUpdate();
    res.status(restResp.status).json({error: restResp.error, result: restResp.result});
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
