import { StatusCodes } from "http-status-codes";
import { prisma } from "../db/prisma";
import { Sensor } from "../generated/prisma/client";
import { SamplerService, SamplerListener } from "../sampling/sampler.service";
import { WebSocket } from "ws";
import { RecordSession } from "../generated/prisma/browser";

const MAX_CLIENT_CONNECTIONS = 10;
const MIN_SAMPLING_RATE_MS = 1000; // 1s

export class SensorStatus {
    public available: boolean = false; // true if sensor is avaialbe on onewire bus
    public lastTempC: number = NaN;    // last reading we got
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
    private samplerService: SamplerService = new SamplerService(prisma);
    private sensorStatusesByHwId: Map<string, SensorStatus> = new Map();
    private clients: ThermoClient[] = [];

    constructor() {
        this.samplerService.addListener(this);
    }

    public isRecording(): boolean {
        return this.samplerService.isRecording();
    }

    public getActiveSessionId(): number | undefined {
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
        // valid inputs
        newName = newName.trim();
        if ( ! newName || newName.length === 0) {
            return {status: StatusCodes.BAD_REQUEST, error: "newName cannot be empty"};
        } else if (isNaN(sensorId)) {
            return {status: StatusCodes.BAD_REQUEST, error: "sensorId cannot be NaN"};
        }
        
        try {
            // attempt to rename the sensor in the database
            const sensor = await prisma.sensor.update({
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
        const resp = new REST_Response<UI_SensorInfo[]>;
        resp.result = [];
        for (const hwId of this.sensorStatusesByHwId.keys()) {
            const status = this.sensorStatusesByHwId.get(hwId);
            const sensor = await prisma.sensor.findUnique({
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

    public async getSessions(): Promise<REST_Response<RecordSession[]>> {
        const resp = new REST_Response<RecordSession[]>;
        resp.result = [];
        try {
            resp.result = await prisma.recordSession.findMany({include: {sessionSensors: true}});
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
        if (this.samplerService.isRecording()) {
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
        const result = await this.samplerService.stopRecording();
        if (typeof result === 'string') {
            return {status: StatusCodes.BAD_REQUEST, error: result};
        }
        return {status: StatusCodes.OK, error: "", result: result};
    }

    public async deleteSession(sessionId: number): Promise<REST_Response<void>> {
        if (isNaN(sessionId)) {
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
            const sampleRes = await prisma.sample.deleteMany({where: {sessionId: sessionId}});
            const groupRes = await prisma.sampleGroup.deleteMany({where: {sessionId: sessionId}});
            const sensorRes = await prisma.sessionSensor.deleteMany({where: {sessionId: sessionId}});
            await prisma.recordSession.delete({where: {id: sessionId}});
            console.log(`session deleted! included removal of ${sampleRes.count} Samples(s), ${groupRes.count} SampleGroup(s), and ${sensorRes.count} SessionSensor(s)`);
            return {status: StatusCodes.OK, error: ""};
        } catch (e: any) {
            console.error('deleteSession - unexpected error: ', e);
            return {status: StatusCodes.INTERNAL_SERVER_ERROR, error: "Failed to delete session"};
        }
    }

    public onSensorSampled(sensor: Sensor, tempC: number): void {
        const status = this.sensorStatusesByHwId.get(sensor.hardwareId);
        if (status) {
            status.lastTempC = tempC;
        }
    }

    public async onCollectionComplete(): Promise<void> {
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
        if (hardwareId in this.sensorStatusesByHwId) {
            console.warn(`sensor '${hardwareId}' already loaded`);
            return;
        }

        const status = new SensorStatus();
        if (isSimulated) {
            status.available = true;
            status.lastTempC = 23.0;
        } else {
            // TODO test if sensor is available and get first temp reading
        }
        const newSensor = await this.getOrCreateDbSensor(hardwareId, isSimulated);
        this.sensorStatusesByHwId.set(hardwareId, status);
        this.samplerService.addDiscoveredSensor(newSensor);
    }

    private async getOrCreateDbSensor(hardwareId: string, isSimulated: boolean): Promise<Sensor> {
        // check if sensor already exists, if so return it
        const existingSensor = await prisma.sensor.findUnique({
            where: { hardwareId: hardwareId }
        });
        if (existingSensor) {
            console.debug(`sensor '${hardwareId}' already exists`);
            return existingSensor;
        }

        // create a new sensor
        const newSensor = await prisma.sensor.create({
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