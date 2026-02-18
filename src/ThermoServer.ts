import { RecordSession, Sensor } from "./generated/prisma/client";
import { prisma } from "./prisma";

export class SensorStatus {
    public available: boolean = false; // true if sensor is avaialbe on onewire bus
    public lastTempC?: number;         // last reading we got
    public isSim: boolean = false;
}

export class ThermoServer {
    private sensorStatuses: Map<string, SensorStatus> = new Map();
    private activeRecordSession?: RecordSession;

    public loadSimSensors(hardwareIds: string[]): void {
        for (const hardwareId of hardwareIds) {
            this.loadSensor(hardwareId, true);
        }
    }

    private loadSensor(hardwareId: string, isSim: boolean): void {
        if (hardwareId in this.sensorStatuses) {
            console.warn(`sensor '${hardwareId}' already loaded`);
            return;
        }

        const status = new SensorStatus();
        status.isSim = isSim;
        if (isSim) {
            status.available = true;
            status.lastTempC = 23.0;
        } else {
            // TODO test is sensor is available and get first temp reading
        }
        this.getOrCreateDbSensor(hardwareId);
        this.sensorStatuses.set(hardwareId, status);
    }

    private async getOrCreateDbSensor(hardwareId: string): Promise<Sensor> {
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
                hardwareId: hardwareId
            }
        });
        console.debug('created new sensor!');
        console.debug(newSensor);
        return newSensor;
    }
}