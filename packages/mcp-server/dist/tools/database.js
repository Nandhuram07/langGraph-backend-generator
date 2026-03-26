/**
 * Tool: setup_database
 *
 * Connects to the user's MySQL or MSSQL database and runs
 * CREATE TABLE statements derived from the entity schema.
 */
// ── SQL type mappings ──────────────────────────────────────────────────────
function mysqlType(f) {
    switch (f.type) {
        case "string": return "VARCHAR(255)";
        case "number": return "INT";
        case "boolean": return "TINYINT(1)";
        case "date": return "DATETIME";
        default: return "VARCHAR(255)";
    }
}
function mssqlType(f) {
    switch (f.type) {
        case "string": return "NVARCHAR(255)";
        case "number": return "INT";
        case "boolean": return "BIT";
        case "date": return "DATETIME2";
        default: return "NVARCHAR(255)";
    }
}
// ── DDL generators ─────────────────────────────────────────────────────────
function buildMysqlDDL(entity) {
    const cols = entity.fields
        .map((f) => `  \`${f.name}\` ${mysqlType(f)} NOT NULL`)
        .join(",\n");
    return [
        `CREATE TABLE IF NOT EXISTS \`${entity.entity}\` (`,
        `  \`id\` INT AUTO_INCREMENT PRIMARY KEY,`,
        cols + ",",
        `  \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP,`,
        `  \`updatedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        `);`,
    ].join("\n");
}
function buildMssqlDDL(entity) {
    const cols = entity.fields
        .map((f) => `  [${f.name}] ${mssqlType(f)} NOT NULL`)
        .join(",\n");
    return [
        `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${entity.entity}')`,
        `BEGIN`,
        `  CREATE TABLE [dbo].[${entity.entity}] (`,
        `    [id] INT IDENTITY(1,1) PRIMARY KEY,`,
        cols + ",",
        `    [createdAt] DATETIME2 DEFAULT GETDATE(),`,
        `    [updatedAt] DATETIME2 DEFAULT GETDATE()`,
        `  );`,
        `END;`,
    ].join("\n");
}
// ── MySQL executor ─────────────────────────────────────────────────────────
async function runMysql(entities, cfg) {
    // Dynamic import so mssql doesn't fail if mysql2 isn't installed
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port ?? 3306,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        multipleStatements: false,
    });
    const created = [];
    try {
        for (const entity of entities) {
            const ddl = buildMysqlDDL(entity);
            await conn.execute(ddl);
            created.push(entity.entity);
        }
    }
    finally {
        await conn.end();
    }
    return created;
}
// ── MSSQL executor ─────────────────────────────────────────────────────────
async function runMssql(entities, cfg) {
    const sql = await import("mssql");
    const pool = await sql.connect({
        server: cfg.host,
        port: cfg.port ?? 1433,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        options: { encrypt: true, trustServerCertificate: true },
    });
    const created = [];
    try {
        for (const entity of entities) {
            const ddl = buildMssqlDDL(entity);
            await pool.request().query(ddl);
            created.push(entity.entity);
        }
    }
    finally {
        await pool.close();
    }
    return created;
}
// ── Public function ────────────────────────────────────────────────────────
export async function setupDatabase(input) {
    const { entities, db, config } = input;
    if (db !== "mysql" && db !== "mssql") {
        throw new Error(`Database type "${db}" is not yet supported for bootstrapping. Use mysql or mssql.`);
    }
    const tablesCreated = db === "mysql"
        ? await runMysql(entities, config)
        : await runMssql(entities, config);
    return {
        tablesCreated,
        message: `Created ${tablesCreated.length} table(s): ${tablesCreated.join(", ")}`,
    };
}
