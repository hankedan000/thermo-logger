import { PrismaClient, RecordSession, Sample } from "../generated/prisma/client";
import { once } from "events";
import fs from "fs";
import path from "path";
import * as FS_Utils from "./fs";

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatTimestamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

// build file name "<startTime>_<endTime>_<sessionName><extension>"
function makeExportFilename(session: RecordSession, extension: string): string {
    let fileName = formatTimestamp(session.startedAt);
    if (session.endedAt) {
        fileName += `_${formatTimestamp(session.endedAt)}`;
    }
    if (session.name.length > 0) {
        fileName
    }
    const sessionNameForFile = FS_Utils.sanitizeStringForFilepath(
        session.name,
        FS_Utils.MAX_FILENAME_LENGTH - fileName.length - 1 - extension.length // maxLength (-1 for '_' seperator)
    );
    if (sessionNameForFile.length > 0) {
        fileName += `_${sessionNameForFile}`;
    }
    fileName += extension;

    return fileName;
}

export async function exportSessionToCsv(
        prisma: PrismaClient,
        sessionId: number,
        useFahrenheit: boolean,
        outputDir: string): Promise<string> {

    const session = await prisma.recordSession.findUnique({where: {id: sessionId}});
    if ( ! session) {
        throw `sessionId '${sessionId}' doesn't exists in database`;
    }

    const fileName = makeExportFilename(session, '.csv');
    const filePath = path.join(outputDir, fileName);
    FS_Utils.mkdir(outputDir, true);// recursive=true
    const outStream = fs.createWriteStream(filePath, {
        encoding: "utf8"
    });
    
    // Write header row
    const sessionSensors = await prisma.sessionSensor.findMany({where: {sessionId: sessionId}});
    outStream.write("timestamp");
    for (const sensor of sessionSensors) {
        outStream.write(`,${escapeCsv(sensor.name)} temp (${useFahrenheit ? "F" : "C"})`);
    }
    outStream.write("\n");

    const locateSampleBySensorId = (samples: Sample[], sensorId: number): Sample | undefined => {
        for (const sample of samples) {
            if (sample.sensorId == sensorId) {
                return sample;
            }
        }
        return undefined;
    };
    
    // Export the CSV by batch reading SampleGroups from the database and
    // streaming the lines to disk. This should prevent loading large amounts
    // of data into RAM.
    const BATCH_SIZE = 100;
    let cursor: { id: number } | undefined = undefined;
    while (true) {
        const groups: any[] = await prisma.sampleGroup.findMany({
            where: { sessionId },
            include: { samples: true },
            orderBy: { id: "asc" }, // id's are autoincrement so this give us a chronological sort
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
                    row += `,${useFahrenheit ? (sample.tempC * 9/5 + 32) : sample.tempC}`;
                } else {
                    row += `,NaN`;
                }
            }
            row += "\n";

            if ( ! outStream.write(row)) {
                // Backpressure handling
                await once(outStream, "drain");
            }
        }

        cursor = { id: groups[groups.length - 1].id };
    }

    outStream.end();
    await once(outStream, "finish");

    return filePath;
}