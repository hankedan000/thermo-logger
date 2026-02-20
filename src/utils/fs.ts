import * as fs from "fs";
import * as JSON_Utils from "./json";
import * as path from 'path';

export function loadFromJson<T extends object>(
    filePath: string,
    ctor: new () => T
): T {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);

        // Create instance and copy fields
        const instance = new ctor();
        return JSON_Utils.hydrateFromJSONable(instance, parsed);
    } catch (err: any) {
        // return default object
        return new ctor();
    }
}

export async function saveToJson(
    filePath: string,
    data: any
): Promise<void> {
    const json = JSON.stringify(JSON_Utils.toJSONable(data), null, 2);
    await fs.promises.writeFile(filePath, json, "utf-8");
}

export function toAbs(relPath: string) {
    return path.resolve(process.cwd(), relPath);
}

export function mkdir(path: string) {
    if ( ! fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}