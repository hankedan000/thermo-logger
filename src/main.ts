import { prisma } from "./prisma";
import { hideBin } from 'yargs/helpers';
import * as fs from "fs";
import yargs from 'yargs';
// import express from "express";

const DEFAULT_BACKEND_PORT = 3000;

async function main() {
  const argv = yargs(hideBin(process.argv))
      .scriptName('movie-poster')
      .usage('$0 [options]')
      .option('port', {
          type: 'number',
          default: DEFAULT_BACKEND_PORT,
          description: 'Port # to use for express app'
      })
      .option('config', {
          type: 'string',
          default: '',
          description: 'Path to optional config file'
      })
      .alias('h', 'help')
      .parseSync();
  
  const initialSensorList: string[] = [];
  if (argv.config.length > 0) {
      const raw = fs.readFileSync(argv.config, "utf-8");
      const config = JSON.parse(raw);
      
    if ('simSensors' in config) {
      const simSensors = config['simSensors'] as string[];
      console.info(`seeding initialSensorList with simSensors: [${simSensors}]`);
      for (const simSensor of simSensors) {
        initialSensorList.push(simSensor);
      }
    }
  }

  for (const sensorId of initialSensorList) {
    const existingSensor = await prisma.sensor.findUnique({
      where: { hardwareId: sensorId }
    });

    if ( ! existingSensor) {
      const newSensor = await prisma.sensor.create({
        data: {
          hardwareId: sensorId
        }
      });
      console.debug('created new sensor!');
      console.debug(newSensor);
    } else {
      console.debug(`sensor '${sensorId}' already exists`);
    }
  }

  // const app = express();

  // app.use(express.json());

  // app.use("/api/sensors", sensorRoutes);
  // app.use("/api/data", dataRoutes);
  // app.use("/api/config", configRoutes);

  // const sampler = new SamplerService(prisma);
  // sampler.start();

  // const PORT = 3000;
  // app.listen(PORT, () => {
  //   console.log(`Server running on port ${PORT}`);
  // });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
