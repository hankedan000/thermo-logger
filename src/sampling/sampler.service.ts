import { randomInt } from "node:crypto";
import { PrismaClient, RecordSession, SampleGroup, Sensor } from "../generated/prisma/client";
import { sensors, temperatureSync } from "ds18b20";
import fs from "fs";

const DEFAULT_SAMPLE_INTERVAL_MS: number = 5000;// 5s

// use a very large negative number to indicate an error if we fail to sample for some reason.
// we want to avoid using NaN here because some databases don't support storing NaN values.
export const BAD_TEMPERATURE_READING = -1000.0;

type SensorSampleCallback = () => Promise<number>;

interface SensorSampler {
  getHardwareId(): string;
  isAvailable(): Promise<boolean>;
  sample(): Promise<number>;
}

class FileBasedSensorSampler implements SensorSampler {
  hardwareId: string;
  filePath: string;
  isCelcius: boolean;
  scaleFactor: number;

  constructor(hardwareId: string, filePath: string, isCelcius: boolean, scaleFactor: number) {
    this.hardwareId = hardwareId;
    this.filePath = filePath;
    this.isCelcius = isCelcius;
    this.scaleFactor = scaleFactor;
  }

  getHardwareId(): string {
    return this.hardwareId;
  }

  async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.filePath);
  }

  async sample(): Promise<number> {
    if ( ! await this.isAvailable()) {
      return BAD_TEMPERATURE_READING;
    } else {
      return fs.promises.readFile(this.filePath, "utf-8").then((data) => {
          const tempValue = parseInt(data);
          if (isNaN(tempValue)) {
            return BAD_TEMPERATURE_READING;
          }
          if (this.isCelcius) {
            return tempValue * this.scaleFactor;
          } else {
            return (tempValue * this.scaleFactor - 32) * 5/9;
          }
        })
        .catch((err) => {
          return BAD_TEMPERATURE_READING;
        });
    }
  }
}

class DS18B20_SensorSampler implements SensorSampler {
  hardwareId: string;

  constructor(hardwareId: string) {
    this.hardwareId = hardwareId;
  }

  getHardwareId(): string {
    return this.hardwareId;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.internalSample()) !== BAD_TEMPERATURE_READING;
  }

  async sample(): Promise<number> {
    return this.internalSample();
  }

  private async internalSample(): Promise<number> {
    let tempC = undefined;
    try {
      tempC = temperatureSync(this.hardwareId);
    } catch (e) {
      // leave tempC as undefined in error case
    }

    if (tempC == undefined || isNaN(tempC)) {
      return BAD_TEMPERATURE_READING;
    } else {
      return tempC;
    }
  }
}

class SimulatedSensorSampler implements SensorSampler {
  hardwareId: string;
  failureRate: number;

  constructor(hardwareId: string, failureRate: number) {
    this.hardwareId = hardwareId;
    this.failureRate = failureRate;
  }

  getHardwareId(): string {
    return this.hardwareId;
  }
  
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async sample(): Promise<number> {
    if (Math.random() < this.failureRate) {
      return BAD_TEMPERATURE_READING;
    } else {
      return randomInt(20, 26);
    }
  }
}

const RPI_CPU_TEMP_FILEPATH = "/sys/class/thermal/thermal_zone0/temp";
const BUILTIN_SAMPLERS: SensorSampler[] = [
  new FileBasedSensorSampler("builtin.rpi.cpu_temp", RPI_CPU_TEMP_FILEPATH, true, 0.001)
];

export interface SamplerListener {
  onSensorSearch(availableHwIds: string[]): void;
  onSensorSampled(sensor: Sensor, tempC: number): void;
  onCollectionComplete(): void;
}

interface RecordableSensor {
  sensor: Sensor;
  sampler: SensorSampler;
}

export class SamplerService {
  private interval: NodeJS.Timeout | undefined;
  private allSensors: RecordableSensor[] = [];
  private sensorsToRecord: RecordableSensor[] = [];
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
    // handle simulated sensors case first
    if (newSensor.isSimulated) {
      const FIALURE_RATE = 0.2;// 20% failure rate for simulated sensors
      this.allSensors.push({
        sensor: newSensor,
        sampler: new SimulatedSensorSampler(newSensor.hardwareId, FIALURE_RATE)
      });
      return;
    }

    // check if the sensor matches any of our built-in samplers
    for (const builtinSampler of BUILTIN_SAMPLERS) {
      if (builtinSampler.getHardwareId() === newSensor.hardwareId) {
        this.allSensors.push({
          sensor: newSensor,
          sampler: builtinSampler
        });
        return;
      }
    }

    // otherwise, assume it's a ds18b20 sensor
    this.allSensors.push({
      sensor: newSensor,
      sampler: new DS18B20_SensorSampler(newSensor.hardwareId)
    });
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
    const tmpSensorsToRecord: RecordableSensor[] = [];
    for (const sensorId of sensorIdsToRecord) {
      const sensor = await this.prisma.sensor.findUnique({
        where: {id: sensorId}
      });

      if ( ! sensor) {
        return `sensorId '${sensorId}' doens't exist in database`;
      }

      let recordable : undefined | RecordableSensor = undefined;
      for (const s of this.allSensors) {
        if (s.sensor.id === sensorId) {
          recordable = s;
          break;
        }
      }
      if ( ! recordable) {
        return `sensorId '${sensorId}' is not currently available to sample`;
      }
      tmpSensorsToRecord.push(recordable);
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
    for (const recordable of tmpSensorsToRecord) {
      await this.prisma.sessionSensor.create({
        data: {
          sessionId: recordSession.id,
          sensorId: recordable.sensor.id,
          name: recordable.sensor.currentName
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
      // not recording, so try scanning for new sensors ...
      const foundSensorHwIds = new Set<string>();
      
      // try scanning for new ds18b20 temperature sensors
      const ds18b20Promise = new Promise<string[]>((resolve) => {
        sensors((err: Error | null, ids: string[]) => {
          if (err) {
            console.error(`error scanning for ds18b20 sensors: ${err}`);
            ids = [];
          }

          resolve(ids);
        });
      });
      const ds18b20HwIds = await ds18b20Promise;
      ds18b20HwIds.forEach((id) => foundSensorHwIds.add(id));

      // try scanning for new builtin sensors (e.g. rpi cpu temp)
      for (const builtinSampler of BUILTIN_SAMPLERS) {
        if (await builtinSampler.isAvailable()) {
          foundSensorHwIds.add(builtinSampler.getHardwareId());
        }
      }
      
      // notify all listeners of the new list of found sensors
      for (const listener of this.listeners) {
        listener.onSensorSearch(Array.from(foundSensorHwIds));
      }
    }

    // iterate over all sensors and collect their tempartures
    for (const recordable of sensorsToSample) {
      var tempC = await recordable.sampler.sample();

      if (this.activeSessionId && sampleGroup) {
        // store sensor samples
        await this.prisma.sample.create({
          data: {
            tempC: tempC,
            sensorId: recordable.sensor.id,
            sessionId: this.activeSessionId,
            sampleGroupId: sampleGroup.id
          }
        });
      }

      // notify all listeners of each new sensor reading
      for (const listener of this.listeners) {
        try {
          listener.onSensorSampled(recordable.sensor, tempC);
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
}
