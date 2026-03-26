// src/utils/sqlGenerator.ts
// Generates CREATE TABLE DDL from entity schema — used by /api/setup-db and /api/generate

export interface SchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "date";
}

export interface SchemaEntity {
  entity: string;
  fields: SchemaField[];
}

function mysqlType(type: SchemaField["type"]): string {
  switch (type) {
    case "string":  return "VARCHAR(255)";
    case "number":  return "INT";
    case "boolean": return "TINYINT(1)";
    case "date":    return "DATETIME";
    default:        return "VARCHAR(255)";
  }
}

function mssqlType(type: SchemaField["type"]): string {
  switch (type) {
    case "string":  return "NVARCHAR(255)";
    case "number":  return "INT";
    case "boolean": return "BIT";
    case "date":    return "DATETIME2";
    default:        return "NVARCHAR(255)";
  }
}

export function generateMysqlDDL(entities: SchemaEntity[]): string {
  return entities.map((entity) => {
    const cols = entity.fields
      .map((f) => `  \`${f.name}\` ${mysqlType(f.type)} NOT NULL`)
      .join(",\n");
    return [
      `CREATE TABLE IF NOT EXISTS \`${entity.entity}\` (`,
      `  \`id\` INT AUTO_INCREMENT PRIMARY KEY,`,
      cols + ",",
      `  \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP,`,
      `  \`updatedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
      `);`,
    ].join("\n");
  }).join("\n\n");
}

export function generateMssqlDDL(entities: SchemaEntity[]): string {
  return entities.map((entity) => {
    const cols = entity.fields
      .map((f) => `    [${f.name}] ${mssqlType(f.type)} NOT NULL`)
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
  }).join("\n\n");
}

export function generateDDL(entities: SchemaEntity[], db: string): string {
  if (db === "mssql") return generateMssqlDDL(entities);
  return generateMysqlDDL(entities);
}
