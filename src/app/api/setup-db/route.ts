// src/app/api/setup-db/route.ts
// Connects to the user's remote database and creates tables from schema

import { NextRequest, NextResponse } from "next/server";
import { generateMysqlDDL, generateMssqlDDL, type SchemaEntity } from "@/utils/sqlGenerator";

export async function POST(req: NextRequest) {
  try {
    const { entities, db, config } = await req.json() as {
      entities: SchemaEntity[];
      db: string;
      config: { host: string; port?: number; user: string; password: string; database: string };
    };

    if (!entities?.length) {
      return NextResponse.json({ error: "No entities provided" }, { status: 400 });
    }
    if (!config?.host || !config?.user || !config?.database) {
      return NextResponse.json({ error: "Missing database connection fields" }, { status: 400 });
    }

    const tablesCreated: string[] = [];

    if (db === "mysql" || db === "oracledb" || !db) {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection({
        host:     config.host,
        port:     config.port ?? 3306,
        user:     config.user,
        password: config.password,
        database: config.database,
        multipleStatements: false,
      });
      try {
        for (const entity of entities) {
          const ddl = generateMysqlDDL([entity]);
          await conn.execute(ddl);
          tablesCreated.push(entity.entity);
        }
      } finally {
        await conn.end();
      }
    } else if (db === "mssql") {
      const sql = await import("mssql");
      const pool = await sql.connect({
        server:   config.host,
        port:     config.port ?? 1433,
        user:     config.user,
        password: config.password,
        database: config.database,
        options:  { encrypt: true, trustServerCertificate: true },
      });
      try {
        for (const entity of entities) {
          const ddl = generateMssqlDDL([entity]);
          await pool.request().query(ddl);
          tablesCreated.push(entity.entity);
        }
      } finally {
        await pool.close();
      }
    } else {
      return NextResponse.json({ error: `Database "${db}" not supported for remote setup` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      tablesCreated,
      message: `Created ${tablesCreated.length} table(s): ${tablesCreated.join(", ")}`,
    });

  } catch (error: any) {
    const msg = error?.message ?? "Unknown error";
    // Surface friendly messages for common connection errors
    if (msg.includes("ECONNREFUSED") || msg.includes("connect ETIMEDOUT")) {
      return NextResponse.json(
        { error: "Cannot reach database. Make sure it is publicly accessible (not localhost)." },
        { status: 400 }
      );
    }
    if (msg.includes("Access denied")) {
      return NextResponse.json({ error: "Access denied — check username and password." }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
