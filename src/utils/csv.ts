import { PrismaClient, Sample } from "../generated/prisma/client";
import { once } from "events";
import fs from "fs";

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportSessionToCsv(
        prisma: PrismaClient,
        sessionId: number,
        outputPath: string) {
    const BATCH_SIZE = 100;

    const writeStream = fs.createWriteStream(outputPath, {
        encoding: "utf8",
    });

    const session = await prisma.recordSession.findUnique({where: {id: sessionId}});
    const sessionSensors = await prisma.sessionSensor.findMany({where: {sessionId: sessionId}});

    // Write header row
    writeStream.write("timestamp");
    for (const sensor of sessionSensors) {
        writeStream.write(`,${escapeCsv(sensor.name)} temp (C)`);
    }
    writeStream.write("\n");

    let cursor: { id: number } | undefined = undefined;

    const locateSampleBySensorId = (samples: Sample[], sensorId: number): Sample | undefined => {
        for (const sample of samples) {
            if (sample.sensorId == sensorId) {
                return sample;
            }
        }
        return undefined;
    };

    while (true) {
        const groups: any[] = await prisma.sampleGroup.findMany({
            where: { sessionId },
            include: {
                samples: true
            },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor && { skip: 1, cursor }),
        });

        if (groups.length === 0) {
            break;
        }

        for (const group of groups) {
            let row = `${group.timestamp.toISOString()}`;
            // append all sensor readings to the row
            for (const sensor of sessionSensors) {
                const sample = locateSampleBySensorId(group.samples, sensor.sensorId);
                if (sample) {
                    row += `,${sample.tempC}`;
                } else {
                    row += `,NaN`;
                }
            }
            row += "\n";

            if ( ! writeStream.write(row)) {
                // Backpressure handling
                await once(writeStream, "drain");
            }
        }

        cursor = { id: groups[groups.length - 1].id };
    }

    writeStream.end();

    await once(writeStream, "finish");
}