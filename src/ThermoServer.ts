import { RecordSession, Sensor } from "./generated/prisma/client";
import { prisma } from "./db/prisma";
import { SamplerService } from "./sampling/sampler.service";

export class SensorStatus {
    public available: boolean = false; // true if sensor is avaialbe on onewire bus
    public lastTempC?: number;         // last reading we got
    public isSimulated: boolean = false;
}

export class ThermoServer {
    private sensorStatusesByHwId: Map<string, SensorStatus> = new Map();
    public samplerService: SamplerService = new SamplerService(prisma);

    public loadSimSensors(hardwareIds: string[]): void {
        for (const hardwareId of hardwareIds) {
            this.loadSensor(hardwareId, true);
        }
    }

    private loadSensor(hardwareId: string, isSimulated: boolean): void {
        if (hardwareId in this.sensorStatusesByHwId) {
            console.warn(`sensor '${hardwareId}' already loaded`);
            return;
        }

        const status = new SensorStatus();
        status.isSimulated = isSimulated;
        if (isSimulated) {
            status.available = true;
            status.lastTempC = 23.0;
        } else {
            // TODO test if sensor is available and get first temp reading
        }
        this.getOrCreateDbSensor(hardwareId, isSimulated);
        this.sensorStatusesByHwId.set(hardwareId, status);
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
}