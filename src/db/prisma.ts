import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

export function connect(url: string): PrismaClient {
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter });
}
