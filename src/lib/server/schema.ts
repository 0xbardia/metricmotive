export type SchemaColumn = { column_name: string };

export function guardProvenanceSchemaReady(columns: SchemaColumn[]): boolean {
  const names = new Set(columns.map((column) => column.column_name));
  return ["contract_address", "chain_id", "network"].every((name) => names.has(name));
}
