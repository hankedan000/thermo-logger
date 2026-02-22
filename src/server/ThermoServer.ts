import { StatusCodes } from "http-status-codes";
import { prisma } from "../db/prisma";
import { Sensor } from "../generated/prisma/client";
import { SamplerService, SamplerListener } from "../sampling/sampler.service";
import { WebSocket } from "ws";
import { response } from "express";

const MAX_CLIENT_CONNECTIONS = 10;

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
    sensorId: string;
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
    public samplerService: SamplerService = new SamplerService(prisma);
    private sensorStatusesByHwId: Map<string, SensorStatus> = new Map();
    private clients: ThermoClient[] = [];

    constructor() {
        this.samplerService.addListener(this);
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

    public async renameSensor(sensorId: string, newName: string): Promise<REST_Response<string>> {
        // valid inputs
        newName = newName.trim();
        if ( ! newName || newName.length === 0) {
            return {status: StatusCodes.BAD_REQUEST, error: "newName cannot be empty"};
        } else if ( ! sensorId || sensorId.length === 0) {
            return {status: StatusCodes.BAD_REQUEST, error: "sensorId cannot be empty"};
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