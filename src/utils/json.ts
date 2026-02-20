export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export function toJSONable(value: unknown): JSONValue {
    // Primitives
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
        ) {
        return value;
    }

    // Arrays
    if (Array.isArray(value)) {
        return value.map(v => toJSONable(v));
    }

    // Set → Array
    if (value instanceof Set) {
        return Array.from(value, v => toJSONable(v));
    }

    // Map → Object
    if (value instanceof Map) {
        const obj: { [key: string]: JSONValue } = {};
        for (const [k, v] of value.entries()) {
            obj[String(k)] = toJSONable(v);
        }
        return obj;
    }

    // Plain object / class instance
    if (typeof value === "object") {
        const obj: { [key: string]: JSONValue } = {};

        for (const key of Object.keys(value)) {
            // @ts-expect-error — dynamic indexing
            obj[key] = toJSONable(value[key]);
        }

        return obj;
    }

    // Fallback (functions, symbols, etc.)
    return null;
}

export function hydrateFromJSONable<T extends object>(
    target: T,
    json: any
): T {
    if ( ! json || typeof json !== "object") {
        return target;
    }
    const targetKeys = Object.keys(target);

    for (const key of Object.keys(json)) {
        if (targetKeys.indexOf(key) < 0) {
            console.warn(`incoming json key ('${key}') doesn't exist in target object's keys ([${targetKeys}]). dropping incoming value.`);
            continue;
        }

        const incoming = json[key];
        const current = (target as any)[key];

        // Existing Set → refill
        if (current instanceof Set && Array.isArray(incoming)) {
            current.clear();
            for (const v of incoming) {
                current.add(v);
            }
            continue;
        }

        // Existing Map → refill
        if (current instanceof Map && typeof incoming === "object") {
            current.clear();
            for (const [k, v] of Object.entries(incoming)) {
                current.set(k, v);
            }
            continue;
        }

        // Existing object → recurse
        if (
            current &&
            typeof current === "object" &&
            typeof incoming === "object" &&
            ! Array.isArray(incoming)
        ) {
            hydrateFromJSONable(current, incoming);
            continue;
        }

        // Fallback: direct assign
        (target as any)[key] = incoming;
    }

    return target;
}

