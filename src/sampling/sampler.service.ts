import { randomInt } from "node:crypto";
import { PrismaClient, Sensor } from "../generated/prisma/client";

export class SamplerService {
  private interval: NodeJS.Timeout | undefined;
  private sensorList: Sensor[] = [];
  private activeSessionId: string | undefined;

  constructor(private prisma: PrismaClient) {}

  public isRecording(): boolean {
    return this.interval != null;
  }

  /**
   * Starts a new re cording session
   * @param sessionName the user-defined name for the recording session
   * @param sampleRateMs the sample rate in milliseconds
   * @param sensorIds list of sensorIds to record in this session
   * @returns the id of the RecordSession that was started, or null
   */
  public async start(
    sessionName: string,
    sampleRateMs: number,
    sensorIds: string[])
  : Promise<string | null> {
    if (this.isRecording()) {
      console.warn(`recording session is activate. can't start another.`);
      return null;
    }

    // get all the Sensor objects from the database for each sensorId
    const sensorList: Sensor[] = [];
    for (const sensorId of sensorIds) {
      const sensor = await this.prisma.sensor.findUnique({
        where: {id: sensorId}
      });

      if ( ! sensor) {
        console.error(`failed to find sensorId '${sensorId}' in database`);
        return null;
      }
      sensorList.push(sensor);
    }

    // create a new RecordSession in the database
    const recordSession = await this.prisma.recordSession.create({
      data: {
        name: sessionName,
        sampleRateMs: sampleRateMs
      }
    });

    // snapshot all the Sensor's currentName values in the SessionSensor table
    for (const sensor of sensorList) {
      await this.prisma.sessionSensor.create({
        data: {
          sessionId: recordSession.id,
          sensorId: sensor.id,
          name: sensor.currentName
        }
      });
    }

    // accept the recording and start the sampling timer
    this.sensorList = sensorList;
    this.activeSessionId = recordSession.id;
    this.interval = setInterval(() => {
      this.sample();
    }, sampleRateMs);
    return recordSession.id;
  }

  /**
   * Stops the active recording
   * @returns true if stopped a recording, false otherwise
   */
  public async stop(): Promise<boolean> {
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

    // clear internal items to get ready for a new start()
    clearInterval(this.interval);
    this.interval = undefined;
    this.sensorList = [];
    this.activeSessionId = undefined;
    return true;
  }

  private async sample() {
    if ( ! this.activeSessionId) {
      console.warn(`can't sample without an activeSessionId`);
      return;
    }

    for (const sensor of this.sensorList) {
      var tempC = NaN;
      if (sensor.isSimulated) {
        tempC = randomInt(20, 26);
      } else {
        // TODO do real onewire sensor reading
      }

      await this.prisma.reading.create({
        data: {
          tempC: tempC,
          sessionId: this.activeSessionId,
          sensorId: sensor.id,
        }
      });
    }
  }
}
