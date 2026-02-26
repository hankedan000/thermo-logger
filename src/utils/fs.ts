import * as fs from "fs";
import * as JSON_Utils from "./json";
import * as path from 'path';

export const MAX_FILENAME_LENGTH = 255;

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

export function mkdir(path: string, recursive: boolean = false) {
    if ( ! fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive });
    }
}

export function sanitizeStringForFilepath(str: string, maxLength: number = MAX_FILENAME_LENGTH) {
    maxLength = Math.min(maxLength, MAX_FILENAME_LENGTH);
    return str
        .normalize("NFKD")                     // normalize unicode
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove illegal chars
        .replace(/\.+$/g, "")                  // no trailing dots
        .replace(/^\.+/g, "")                  // no leading dots
        .replace(/\s+/g, "_")                  // spaces → underscores
        .trim()
        .slice(0, maxLength);                  // limit length
}