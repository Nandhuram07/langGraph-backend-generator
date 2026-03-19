export interface EntityField {
  name: string
  type: string
}

export interface EntitySchema {
  entity: string
  fields: EntityField[]
}

export function isSchemaComplete(entities: EntitySchema[]): boolean {
  if (!entities || entities.length === 0) return false

  for (const entity of entities) {
    if (!entity.entity) return false
    if (!entity.fields || entity.fields.length === 0) return false
  }

  return true
}