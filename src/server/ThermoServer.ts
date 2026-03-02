import { StatusCodes } from "http-status-codes";
import { PrismaClient, Sensor } from "../generated/prisma/client";
import { SamplerService, SamplerListener } from "../sampling/sampler.service";
import { WebSocket } from "ws";
import { RecordSession, SessionSensor } from "../generated/prisma/browser";
import { exportSessionToCsv } from "../utils/csv";
import path from "path";
import * as Prisma from "../db/prisma";
import { existsSync } from "fs";
import { Version } from "../utils/version";

const UPDATE_TIMEOUT_SEC = 120; // 2mins
const MAX_CLIENT_CONNECTIONS = 10;
const MIN_SAMPLING_RATE_MS = 1000; // 1s
const TMP_DIR = '/tmp/thermo-logger'
export const TMP_EXPORTS_DIR = path.join(TMP_DIR, 'exports');

export class SensorStatus {
    public available: boolean = false; // true if sensor is avaialbe on onewire bus
    public lastTempC: number = NaN;    // last reading we got
    public isSimulated: boolean = false;
}

export enum ServerState {
    UNINITIALIZED = 'UNINITIALIZED', // default state (hasn't connected to database yet and isn't polling sensors)
    OPERATING = 'OPERATING',         // connected to database, is polling sensors, can record
    UPDATING = 'UPDATING'            // disconnected from database (ie. can't record)
}

class ThermoClient {
    ws: WebSocket;

    constructor (ws: WebSocket) {
        this.ws = ws;
    }
}

enum MsgType {
    SensorUpdate = 'SensorUpdate'
}

interface ServerMsg {
    readonly msgType: MsgType;
}

interface UI_SensorInfo {
    sensorId: number;
    hardwareId: string;
    lastTempC: number;
    currentName: string;
    available: boolean;
}

interface UI_RecordSessionInfo {
    id: number;
    name: string;
    startedAt: Date;
    endedAt: Date | null;
    sampleRateMs: number;
    notes: string;
    sessionSensors: SessionSensor[];
    downloadFile: string | null;
}

class SensorUpdateMsg implements ServerMsg {
    readonly  msgType: MsgType = MsgType.SensorUpdate;
    sensors: UI_SensorInfo[] = [];
}

export class REST_Response<RESULT_T> {
    status: StatusCodes = StatusCodes.OK;
    error: string = ''; // user-friendly status message
    result?: RESULT_T;
}

export class ThermoServer implements SamplerListener {
    private state: ServerState = ServerState.UNINITIALIZED
    private prismaUrl: string;
    private prisma: PrismaClient | undefined;
    private samplerService: SamplerService | undefined;
    private sensorStatusesByHwId: Map<string, SensorStatus> = new Map();
    private clients: ThermoClient[] = [];
    // timeout that puts server back to OPERATING if update is not accepted in time
    private updateTimeout: NodeJS.Timeout | undefined;

    constructor(prismaUrl: string) {
        this.prismaUrl = prismaUrl;
    }

    public async shutdown() {
        await this.setState(ServerState.UNINITIALIZED);
    }

    public async setState(newState: ServerState): Promise<boolean> {
        if (newState == this.state) {
            return true; // nothing to do
        }

        // perform logic necessary to exit a state
        switch (this.state) {
            case ServerState.UNINITIALIZED:
                // nothing to do
                break;
            case ServerState.OPERATING:
                if (this.samplerService) {
                    this.samplerService.shutdown();
                    this.samplerService = undefined;
                }
                if (this.prisma) {
                    await this.prisma.$disconnect();
                    this.prisma = undefined;
                }
                break;
            case ServerState.UPDATING:
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = undefined;
                }
                break;
        }

        // perform logic necessary to enter a state
        switch (newState) {
            case ServerState.UNINITIALIZED:
                // nothing to do
                break;
            case ServerState.OPERATING:
                try {
                    this.prisma = Prisma.connect(this.prismaUrl);
                    this.samplerService = new SamplerService(this.prisma);
                    this.samplerService.addListener(this);
                } catch (err: any) {
                    console.error(`Failed to transition to OPERATING! err: ${err}`);
                    if (this.prisma) {
                        this.prisma.$disconnect();
                        this.prisma = undefined;
                    }
                    if (this.samplerService) {
                        this.samplerService = undefined;
                    }
                    return false;
                }
                break;
            case ServerState.UPDATING:
                this.updateTimeout = setTimeout(() => {
                    console.log(`update timed out after ${UPDATE_TIMEOUT_SEC}s.`);
                    this.setState(ServerState.OPERATING);
                }, UPDATE_TIMEOUT_SEC * 1000);
                break;
        }

        // accept the new state
        this.state = newState;
        console.log(`transitioned to '${this.state}' (pid=${process.pid}).`);
        return true;
    }

    public getServerState(): ServerState {
        return this.state;
    }

    public isRecording(): boolean {
        if ( ! this.samplerService) {
            return false;
        }
        return this.samplerService.isRecording();
    }

    public getActiveSessionId(): number | undefined {
        if ( ! this.samplerService) {
            return undefined;
        }
        return this.samplerService.getActiveSessionId();
    }

    public addNewClient(ws: WebSocket): boolean {
        if (this.clients.length >= MAX_CLIENT_CONNECTIONS) {
            console.warn(`max client connections reached (${MAX_CLIENT_CONNECTIONS}). rejecting new client connection.`);
            ws.close();// reject the connection
            return false;
        }

        const newClient = new ThermoClient(ws);
        this.clients.push(newClient);
        ws.onclose = this.onClientSocketClosed.bind(this, newClient);
        console.log(`new client connection established (${this.clients.length} total)`);
        return true;
    }

    public async loadSimSensors(hardwareIds: string[]): Promise<void> {
        for (const hardwareId of hardwareIds) {
            await this.loadSensor(hardwareId, true);
        }
    }

    public async renameSensor(sensorId: number, newName: string): Promise<REST_Response<string>> {
        if ( ! this.prisma) {
            return {status: StatusCodes.CONFLICT, error: `Can't rename sensors while server is '${this.state}'`};
        }

        // valid inputs
        newName = newName.trim();
        if ( ! newName || newName.length === 0) {
            return {status: StatusCodes.BAD_REQUEST, error: "newName cannot be empty"};
        } else if (isNaN(sensorId)) {
            return {status: StatusCodes.BAD_REQUEST, error: "sensorId cannot be NaN"};
        }
        
        try {
            // attempt to rename the sensor in the database
            const sensor = await this.prisma.sensor.update({
                where: {id: sensorId},
                data: {currentName: newName}
            });

            // rename was successful
            return {status: StatusCodes.OK, error: 'Successfully renamed sensor', result: sensor.currentName};
        } catch (err: any) {
            // Prisma throws if record not found
            if (err.code === "P2025") {
                return {status: StatusCodes.NOT_FOUND, error: `sensorId '${sensorId}' doesn't exist in database`};
            }

            return {status: StatusCodes.INTERNAL_SERVER_ERROR, error: "Failed to rename sensor"};
        }
    }

    public async getUI_SensorInfos(): Promise<REST_Response<UI_SensorInfo[]>> {
        if ( ! this.prisma) {
            return {status: StatusCodes.CONFLICT, error: `Can't get sensor info while server is '${this.state}'`};
        }
        
        const resp = new REST_Response<UI_SensorInfo[]>;
        resp.result = [];
        for (const hwId of this.sensorStatusesByHwId.keys()) {
            const status = this.sensorStatusesByHwId.get(hwId);
            const sensor = await this.prisma.sensor.findUnique({
                where: {hardwareId: hwId}
            });
            if ( ! sensor || ! status) {
                continue;
            }

            resp.result.push({
                sensorId: sensor.id,
                hardwareId: hwId,
                lastTempC: status.lastTempC,
                available: status.available,
                currentName: sensor.currentName
            })
        }
        return resp;
    }

    public async getUI_RecordSessionInfos(): Promise<REST_Response<UI_RecordSessionInfo[]>> {
        if ( ! this.prisma) {
            return {status: StatusCodes.CONFLICT, error: `Can't get RecordSessions info while server is '${this.state}'`};
        }

        const resp = new REST_Response<UI_RecordSessionInfo[]>;
        resp.result = [];
        try {
            const sessions = await this.prisma.recordSession.findMany({include: {sessionSensors: true}});
            for (const session of sessions) {
                let downloadFile: string | null = null;
                if (session.exportPath && existsSync(session.exportPath)) {
                    // just get the filename with the extension
                    downloadFile = path.basename(session.exportPath);
                }

                resp.result.push({
                    id: session.id,
                    name: session.name,
                    startedAt: session.startedAt,
                    endedAt: session.endedAt,
                    sampleRateMs: session.sampleRateMs,
                    notes: session.notes,
                    sessionSensors: session.sessionSensors,
                    downloadFile: downloadFile
                })
            }
        } catch (err: any) {
            return {status: StatusCodes.INTERNAL_SERVER_ERROR, error: "Failed to query record sessions"};
        }
        return resp;
    }

    public async startSession(
        sessionName: string,
        sampleRateMs: number,
        sensorIdsToRecord: number[],
        notes: string)
    : Promise<REST_Response<RecordSession>> {
        if ( ! this.samplerService) {
            return {status: StatusCodes.CONFLICT, error: `Can't start RecordSessions while server is '${this.state}'`};
        } else if (this.samplerService.isRecording()) {
            return {status: StatusCodes.CONFLICT, error: "Can't start a new recording while one is running. Stop recording first."};
        } else if (sensorIdsToRecord.length == 0) {
            return {status: StatusCodes.BAD_REQUEST, error: "Must select sensors to record before starting a session."};
        } else if (sampleRateMs < MIN_SAMPLING_RATE_MS) {
            return {status: StatusCodes.BAD_REQUEST, error: `Sampling rate must be >= ${MIN_SAMPLING_RATE_MS / 1000.0}s`};
        }

        const result = await this.samplerService.startRecording(
            sessionName,
            sampleRateMs,
            new Set(sensorIdsToRecord),
            notes);
        if (typeof result === 'string') {
            return {status: StatusCodes.BAD_REQUEST, error: result};
        }
        return {status: StatusCodes.OK, error: "", result: result};
    }

    public async stopSession(): Promise<REST_Response<RecordSession>> {
        if ( ! this.samplerService) {
            return {status: StatusCodes.CONFLICT, error: `Can't stop RecordSessions while server is '${this.state}'`};
        }

        const result = await this.samplerService.stopRecording();
        if (typeof result === 'string') {
            return {status: StatusCodes.BAD_REQUEST, error: result};
        }
        return {status: StatusCodes.OK, error: "", result: result};
    }

    public async deleteSession(sessionId: number): Promise<REST_Response<void>> {
        if ( ! this.prisma || ! this.samplerService) {
            return {status: StatusCodes.CONFLICT, error: `Can't delete RecordSessions while server is '${this.state}'`};
        } else if (isNaN(sessionId)) {
            return {status: StatusCodes.BAD_REQUEST, error: "sessionId cannot be NaN"};
        }

        try {
            // if requested session to delete is the active one, then stop it first
            // before moving forward with database deletions.
            if (this.samplerService.getActiveSessionId() == sessionId) {
                console.warn('requested deletion of active record session. stopping the recording ...');
                await this.samplerService.stopRecording();
            }

            console.log(`deleting sessionId='${sessionId}' ...`);
            const sampleRes = await this.prisma.sample.deleteMany({where: {sessionId: sessionId}});
            const groupRes = await this.prisma.sampleGroup.deleteMany({where: {sessionId: sessionId}});
            const sensorRes = await this.prisma.sessionSensor.deleteMany({where: {sessionId: sessionId}});
            await this.prisma.recordSession.delete({where: {id: sessionId}});
            console.log(`session deleted! included removal of ${sampleRes.count} Samples(s), ${groupRes.count} SampleGroup(s), and ${sensorRes.count} SessionSensor(s)`);
            return {status: StatusCodes.OK, error: ""};
        } catch (e: any) {
            console.error('deleteSession - unexpected error: ', e);
            return {status: StatusCodes.INTERNAL_SERVER_ERROR, error: "Failed to delete session"};
        }
    }

    public async exportSession(sessionId: number): Promise<REST_Response<void>> {
        if ( ! this.prisma) {
            return {status: StatusCodes.CONFLICT, error: `Can't export RecordSessions while server is '${this.state}'`};
        } else if (isNaN(sessionId)) {
            return {status: StatusCodes.BAD_REQUEST, error: "sessionId cannot be NaN"};
        }

        try {
            console.log(`exporting sessionId '${sessionId}' ...`);
            const exportPath = await exportSessionToCsv(
                this.prisma,
                sessionId,
                TMP_EXPORTS_DIR);
            
            // update RecordSession to include latests export info
            await this.prisma.recordSession.update({
                where: { id: sessionId },
                data: {
                    lastExportedAt: new Date(),
                    exportPath: exportPath
                }
            });

            console.log(`export complete! exportPath = '${exportPath}'`);
        } catch (err: any) {
            console.error('exportSession - unexpected error: ', err);
            return {status: StatusCodes.INTERNAL_SERVER_ERROR, error: `Failed to export session! err: ${err}`};
        }
        return {status: StatusCodes.OK, error: ""};
    }

    public async startServerUpdate(newVersion: Version): Promise<REST_Response<void>> {
        // TODO
        return {status: StatusCodes.OK, error: ""};
    }
  
    public async onSensorSearch(availableHwIds: string[]) {
        for (const status of this.sensorStatusesByHwId.values()) {
            if ( ! status.isSimulated) {
                status.available = false;// will get rasserted in loop below if sensor is still available
            }
        }

        for (const hardwareId of availableHwIds) {
            const status = this.sensorStatusesByHwId.get(hardwareId);
            if ( ! status) {
                // load any newly discovered sensor into the server
                await this.loadSensor(hardwareId, false);
            } else {
                status.available = true;
            }
        }
    }

    public onSensorSampled(sensor: Sensor, tempC: number) {
        const status = this.sensorStatusesByHwId.get(sensor.hardwareId);
        if (status) {
            if (isNaN(tempC)) {
                status.available = false;
            } else {
                status.available = true;
                status.lastTempC = tempC;
            }
        }
    }

    public async onCollectionComplete() {
        const restResp = await this.getUI_SensorInfos();
        if (restResp.result) {
            const msg = new SensorUpdateMsg();
            msg.sensors = restResp.result;
            this.sendMsgToClients(msg);
        } else {
            console.error(`onCollectionComplete - getUI_SensorInfos() failed! error: '${restResp.error}'`);
        }
    }

    private async loadSensor(hardwareId: string, isSimulated: boolean): Promise<void> {
        if ( ! this.samplerService) {
            console.warn(`can't load senors while server is '${this.state}'`);
            return;
        } else if (hardwareId in this.sensorStatusesByHwId) {
            console.warn(`sensor '${hardwareId}' already loaded`);
            return;
        }

        const status = new SensorStatus();
        status.isSimulated = isSimulated;
        status.available = true;
        if (isSimulated) {
            status.lastTempC = 23.0;
        } else {
            // temperature will be read immenantly because discovery occurs
            // right before temperature collection.
        }
        const newSensor = await this.getOrCreateDbSensor(hardwareId, isSimulated);
        if (newSensor) {
            this.sensorStatusesByHwId.set(hardwareId, status);
            this.samplerService.addDiscoveredSensor(newSensor);
        }
    }

    private async getOrCreateDbSensor(hardwareId: string, isSimulated: boolean): Promise<Sensor | undefined> {
        if ( ! this.prisma) {
            console.warn(`can't create database sensors while server is '${this.state}'`);
            return undefined;
        }

        // check if sensor already exists, if so return it
        const existingSensor = await this.prisma.sensor.findUnique({
            where: { hardwareId: hardwareId }
        });
        if (existingSensor) {
            console.debug(`sensor '${hardwareId}' already exists`);
            return existingSensor;
        }

        // create a new sensor
        const newSensor = await this.prisma.sensor.create({
            data: {
                hardwareId: hardwareId,
                isSimulated: isSimulated,
                currentName: hardwareId
            }
        });
        console.debug('created new sensor!');
        console.debug(newSensor);
        return newSensor;
    }

    // callback for a client's WebSocket "close" event. if the client
    // exists in our list of known clients, then it will be removed.
    private onClientSocketClosed = (client: ThermoClient) => {
        const index = this.clients.indexOf(client);
        if (index > -1) {
            console.log(`client connection closed`);
            this.clients.splice(index, 1);
        }
    }

    private sendMsgToClients(msg: ServerMsg) {
        for (const client of this.clients) {
            this.sendMsgToClient(client, msg);
        }
    }

    private sendMsgToClient(client: ThermoClient, msg: ServerMsg) {
        client.ws.send(JSON.stringify(msg));
    }
}