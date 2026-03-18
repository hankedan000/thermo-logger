import { randomInt } from "node:crypto";
import { PrismaClient, RecordSession, SampleGroup, Sensor } from "../generated/prisma/client";
import { sensors, temperatureSync } from "ds18b20";

const DEFAULT_SAMPLE_INTERVAL_MS: number = 5000;// 5s

// use a very large negative number to indicate an error if we fail to sample for some reason.
// we want to avoid using NaN here because some databases don't support storing NaN values.
export const BAD_TEMPERATURE_READING = -1000.0;

export interface SamplerListener {
  onSensorSearch(availableHwIds: string[]): void;
  onSensorSampled(sensor: Sensor, tempC: number): void;
  onCollectionComplete(): void;
}

export class SamplerService {
  private interval: NodeJS.Timeout | undefined;
  private allSensors: Sensor[] = [];
  private sensorsToRecord: Sensor[] = [];
  private activeSessionId: number | undefined;
  private listeners: SamplerListener[] = [];

  constructor(private prisma: PrismaClient) {
    this.restartSamplingInterval(DEFAULT_SAMPLE_INTERVAL_MS);
  }

  public shutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.allSensors = [];
    this.sensorsToRecord = [];
    this.activeSessionId = undefined;
    this.listeners = [];
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

  public getActiveSessionId(): number | undefined {
    if ( ! this.activeSessionId) {
      return undefined;
    }
    return this.activeSessionId;
  }

  /**
   * Starts a new re cording session
   * @param sessionName the user-defined name for the recording session
   * @param sampleRateMs the sample rate in milliseconds
   * @param sensorIds list of sensorIds to record in this session
   * @param notes user-provided notes to attach to the record session
   * @returns the id of the RecordSession that was started, or null
   */
  public async startRecording(
    sessionName: string,
    sampleRateMs: number,
    sensorIdsToRecord: Set<number>,
    notes: string)
  : Promise<RecordSession | string> {
    if (this.isRecording()) {
      return `can't start recording session because one is already active`;
    }

    // get all the Sensor objects from the database for each sensorId
    const tmpSensorsToRecord: Sensor[] = [];
    for (const sensorId of sensorIdsToRecord) {
      const sensor = await this.prisma.sensor.findUnique({
        where: {id: sensorId}
      });

      if ( ! sensor) {
        return `sensorId '${sensorId}' doens't exist in database`;
      }
      tmpSensorsToRecord.push(sensor);
    }

    // create a new RecordSession in the database
    const recordSession = await this.prisma.recordSession.create({
      data: {
        name: sessionName,
        sampleRateMs: sampleRateMs,
        notes: notes
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
    console.log(`started record session '${sessionName}'`);
    this.sensorsToRecord = tmpSensorsToRecord;
    this.activeSessionId = recordSession.id;
    this.restartSamplingInterval(sampleRateMs);
    return recordSession;
  }

  /**
   * Stops the active recording
   * @returns true if stopped a recording, false otherwise
   */
  public async stopRecording(): Promise<RecordSession | string> {
    if ( ! this.interval || ! this.activeSessionId) {
      return `No recording is active`;
    }

    // mark the session ended
    const session = await this.prisma.recordSession.update({
      where: {
        id: this.activeSessionId,
      },
      data: {
        endedAt: new Date()
      }
    });

    // reset back to an idle state where we just sample all sensors
    console.log(`stopped record session '${session.name}'`);
    this.sensorsToRecord = [];
    this.activeSessionId = undefined;
    this.restartSamplingInterval(DEFAULT_SAMPLE_INTERVAL_MS);
    return session;
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

    let sampleGroup: SampleGroup | undefined = undefined;
    if (this.activeSessionId) {
      // create a new SampleGroup if we have an active recording session going
      sampleGroup = await this.prisma.sampleGroup.create({
        data: {
          sessionId: this.activeSessionId
        }
      });
    } else {
      // not recording, so scan for ds18b20 temperature sensors
      sensors((err: Error | null, ids: string[]) => {
        for (const listener of this.listeners) {
          listener.onSensorSearch(ids ? ids : []);
        }
      });
    }

    // iterate over all sensors and collect their tempartures
    for (const sensor of sensorsToSample) {
      var tempC = await this.sampleSensor(sensor);

      if (this.activeSessionId && sampleGroup) {
        // store sensor samples
        await this.prisma.sample.create({
          data: {
            tempC: tempC,
            sensorId: sensor.id,
            sessionId: this.activeSessionId,
            sampleGroupId: sampleGroup.id
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
      var tempC = BAD_TEMPERATURE_READING;
      if (sensor.isSimulated) {
        if (Math.random() > 0.1) {
          // 10% chance to get an invalid reading
          tempC = randomInt(20, 26);
        }
      } else {
        try {
          tempC = temperatureSync(sensor.hardwareId);
        } catch (e) {
          // leave tempC as BAD_TEMPERATURE_READING in error case
        }
      }
      return tempC;
  }
}
