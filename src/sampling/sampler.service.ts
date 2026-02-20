import { randomInt } from "node:crypto";
import { PrismaClient, Sensor } from "../generated/prisma/client";

const DEFAULT_SAMPLE_INTERVAL_MS: number = 5000;// 5s

export interface SamplerListener {
  onSensorSampled(sensor: Sensor, tempC: number): void;
  onCollectionComplete(): void;
}

export class SamplerService {
  private interval: NodeJS.Timeout | undefined;
  private allSensors: Sensor[] = [];
  private sensorsToRecord: Sensor[] = [];
  private activeSessionId: string | undefined;
  private listeners: SamplerListener[] = [];

  constructor(private prisma: PrismaClient) {
    this.restartSamplingInterval(DEFAULT_SAMPLE_INTERVAL_MS);
  }

  public addListener(newListener: SamplerListener): void {
    this.listeners.push(newListener);
  }

  public addDiscoveredSensor(newSensor: Sensor): void {
    this.allSensors.push(newSensor);
  }

  public isRecording(): boolean {
    return this.activeSessionId != null;
  }

  /**
   * Starts a new re cording session
   * @param sessionName the user-defined name for the recording session
   * @param sampleRateMs the sample rate in milliseconds
   * @param sensorIds list of sensorIds to record in this session
   * @returns the id of the RecordSession that was started, or null
   */
  public async startRecording(
    sessionName: string,
    sampleRateMs: number,
    sensorIdsToRecord: Set<string>)
  : Promise<string | null> {
    if (this.isRecording()) {
      console.warn(`recording session is activate. can't start another.`);
      return null;
    }

    // get all the Sensor objects from the database for each sensorId
    const tmpSensorsToRecord: Sensor[] = [];
    for (const sensorId of sensorIdsToRecord) {
      const sensor = await this.prisma.sensor.findUnique({
        where: {id: sensorId}
      });

      if ( ! sensor) {
        console.error(`failed to find sensorId '${sensorId}' in database`);
        return null;
      }
      tmpSensorsToRecord.push(sensor);
    }

    // create a new RecordSession in the database
    const recordSession = await this.prisma.recordSession.create({
      data: {
        name: sessionName,
        sampleRateMs: sampleRateMs
      }
    });

    // snapshot all the Sensor's currentName values in the SessionSensor table
    for (const sensor of tmpSensorsToRecord) {
      await this.prisma.sessionSensor.create({
        data: {
          sessionId: recordSession.id,
          sensorId: sensor.id,
          name: sensor.currentName
        }
      });
    }

    // accept the recording and start the sampling timer
    this.sensorsToRecord = tmpSensorsToRecord;
    this.activeSessionId = recordSession.id;
    this.restartSamplingInterval(sampleRateMs);
    return recordSession.id;
  }

  /**
   * Stops the active recording
   * @returns true if stopped a recording, false otherwise
   */
  public async stopRecording(): Promise<boolean> {
    if ( ! this.interval || ! this.activeSessionId) {
      console.warn(`no recording is active. ignoring stop()`);
      return false;
    }

    // mark the session ended
    await this.prisma.recordSession.update({
      where: {
        id: this.activeSessionId,
      },
      data: {
        endedAt: new Date()
      }
    });

    // reset back to an idle state where we just sample all sensors
    this.sensorsToRecord = [];
    this.activeSessionId = undefined;
    this.restartSamplingInterval(DEFAULT_SAMPLE_INTERVAL_MS);
    return true;
  }

  private restartSamplingInterval(newIntervalMs: number) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.interval = setInterval(() => {
      this.collect();
    }, newIntervalMs);
  }

  private async collect() {
    const sensorsToSample = this.isRecording() ? this.sensorsToRecord : this.allSensors;
    for (const sensor of sensorsToSample) {
      var tempC = await this.sampleSensor(sensor);

      if (this.activeSessionId) {
        // store sensor reading with the associated record session
        await this.prisma.reading.create({
          data: {
            tempC: tempC,
            sessionId: this.activeSessionId,
            sensorId: sensor.id,
          }
        });
      }

      // notify all listeners of each new sensor reading
      for (const listener of this.listeners) {
        try {
          listener.onSensorSampled(sensor, tempC);
        } catch (err: any) {
          // ignore error
        }
      }
    }

    // notify all listeners that the collection is complete
    for (const listener of this.listeners) {
      try {
        listener.onCollectionComplete();
      } catch (err: any) {
        // ignore error
      }
    }
  }

  private async sampleSensor(sensor: Sensor): Promise<number> {
      var tempC = NaN;
      if (sensor.isSimulated) {
        tempC = randomInt(20, 26);
      } else {
        // TODO do real onewire sensor reading
      }
      return tempC;
  }
}
