import { prisma } from "../db/prisma";
import { Sensor } from "../generated/prisma/client";
import { SamplerService, SamplerListener } from "../sampling/sampler.service";
import { WebSocket } from "ws";

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

    public async getUI_SensorInfos(): Promise<UI_SensorInfo[]> {
        const infos: UI_SensorInfo[] = []
        for (const hwId of this.sensorStatusesByHwId.keys()) {
            const status = this.sensorStatusesByHwId.get(hwId);
            const sensor = await prisma.sensor.findUnique({
                where: {hardwareId: hwId}
            });
            if ( ! sensor || ! status) {
                continue;
            }

            infos.push({
                sensorId: sensor.id,
                hardwareId: hwId,
                lastTempC: status.lastTempC,
                available: status.available,
                currentName: sensor.currentName
            })
        }
        return infos;
    }

    public onSensorSampled(sensor: Sensor, tempC: number): void {
        const status = this.sensorStatusesByHwId.get(sensor.hardwareId);
        if (status) {
            status.lastTempC = tempC;
        }
    }

    public async onCollectionComplete(): Promise<void> {
        const msg = new SensorUpdateMsg();
        msg.sensors = await this.getUI_SensorInfos();
        this.sendMsgToClients(msg);
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