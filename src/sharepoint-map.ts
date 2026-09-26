/**
 * SharePoint list schema → Dataverse table spec mapper (pure, deterministic).
 *
 * Input: a normalized SharePoint schema (produced by `scripts/read-sharepoint-list.ps1` via Graph).
 * Output: a `tables.json` spec for `scripts/provision-tables.ps1`, a source→target column map (for
 * synthetic-data + traceability), and the decisions taken (simplifications/skips). No source rows.
 *
 * Locked design (see docs/SESSION_HANDOFF.md): Title→primary; text→string; note→memo;
 * number→int/decimal; currency→money; choice→choice(optionset); multichoice→choice + decision;
 * yes/no→boolean; date/datetime→datetime; person→text (display name) by default; lookup→Dataverse
 * lookup only if the referenced list is in scope (else text + decision); calculated/rollup→skipped;
 * hyperlink→string(URL); picture→image; attachments→file.
 */

export type SpType =
  | "text" | "note" | "number" | "currency" | "choice" | "multichoice"
  | "boolean" | "datetime" | "date" | "person" | "personmulti"
  | "lookup" | "lookupmulti" | "hyperlink" | "image" | "calculated"
  | "attachments" | "unknown";

export interface SpColumn {
  name: string;
  displayName: string;
  type: SpType;
  required?: boolean;
  maxLength?: number;
  decimals?: number;
  choices?: string[];
  /** Display name of the referenced list (for lookup / lookupmulti). */
  lookupList?: string;
}

export interface SpList {
  name: string;
  displayName: string;
  columns: SpColumn[];
}

export interface SpSchema {
  site?: string;
  lists: SpList[];
}

export type DvColumnType =
  | "string" | "memo" | "int" | "decimal" | "money" | "boolean" | "datetime" | "choice" | "image" | "file";

export interface DvColumnSpec {
  schemaName: string;
  displayName: string;
  type: DvColumnType;
  required?: boolean;
  maxLength?: number;
  options?: string[];
}

export interface DvLookupSpec {
  schemaName: string;
  displayName: string;
  target: string;
  relationshipName: string;
}

export interface DvTableSpec {
  schemaName: string;
  displayName: string;
  collectionName: string;
  primaryColumn: { schemaName: string; displayName: string };
  columns: DvColumnSpec[];
  lookups: DvLookupSpec[];
}

export interface ColumnMapEntry {
  list: string;
  spName: string;
  spType: SpType;
  dvSchemaName: string | null;
  dvType: string;
  note?: string;
}

export interface MapDecision {
  title: string;
  detail: string;
}

export interface MapResult {
  tables: DvTableSpec[];
  columnMap: ColumnMapEntry[];
  decisions: MapDecision[];
}

/** Sanitize a SharePoint display name into a Dataverse schema name: `<prefix>_PascalCase`. */
export function dvName(prefix: string, displayName: string): string {
  const pascal = displayName
    .replace(/[^\w\s]/g, " ")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return `${prefix}_${pascal || "Col"}`;
}

function isTitle(c: SpColumn): boolean {
  return c.name.toLowerCase() === "title" || c.displayName.trim().toLowerCase() === "title";
}

/** Map one SharePoint schema (one or more lists) into Dataverse table specs. */
export function mapSharePointToDataverse(schema: SpSchema, opts: { prefix: string }): MapResult {
  const prefix = opts.prefix.toLowerCase();
  const columnMap: ColumnMapEntry[] = [];
  const decisions: MapDecision[] = [];
  // Display name → target table logical name, for resolving in-scope lookups.
  const listToTable = new Map<string, string>();
  for (const list of schema.lists) listToTable.set(list.displayName.trim().toLowerCase(), dvName(prefix, list.displayName).toLowerCase());

  const tables: DvTableSpec[] = [];

  for (const list of schema.lists) {
    const tableSchema = dvName(prefix, list.displayName);
    const columns: DvColumnSpec[] = [];
    const lookups: DvLookupSpec[] = [];

    // Primary column: the SharePoint Title (or a synthesized Name).
    const titleCol = list.columns.find(isTitle);
    const primaryDisplay = titleCol ? titleCol.displayName : "Name";
    const primaryName = dvName(prefix, primaryDisplay);
    columnMap.push({ list: list.displayName, spName: titleCol?.name ?? "Title", spType: "text", dvSchemaName: primaryName, dvType: "primary", note: "primary name column" });

    for (const col of list.columns) {
      if (isTitle(col)) continue; // already the primary
      const dvSchema = dvName(prefix, col.displayName);
      const push = (type: DvColumnType, extra: Partial<DvColumnSpec> = {}, note?: string): void => {
        columns.push({ schemaName: dvSchema, displayName: col.displayName, type, ...(col.required ? { required: true } : {}), ...extra });
        columnMap.push({ list: list.displayName, spName: col.name, spType: col.type, dvSchemaName: dvSchema, dvType: type, ...(note ? { note } : {}) });
      };
      const skip = (note: string): void => {
        columnMap.push({ list: list.displayName, spName: col.name, spType: col.type, dvSchemaName: null, dvType: "skipped", note });
      };

      switch (col.type) {
        case "text":
          push("string", col.maxLength ? { maxLength: col.maxLength } : {});
          break;
        case "note":
          push("memo");
          break;
        case "number":
          push((col.decimals ?? 0) > 0 ? "decimal" : "int");
          break;
        case "currency":
          push("money");
          break;
        case "choice":
          push("choice", { options: col.choices ?? [] });
          break;
        case "multichoice":
          push("choice", { options: col.choices ?? [] }, "multi-select simplified to single choice");
          decisions.push({ title: `Multi-choice simplified: ${list.displayName}.${col.displayName}`, detail: "SharePoint multi-select choice mapped to a single-select Dataverse choice for the demo." });
          break;
        case "boolean":
          push("boolean");
          break;
        case "datetime":
        case "date":
          push("datetime", {}, col.type === "date" ? "date-only rendered as date/time" : undefined);
          break;
        case "hyperlink":
          push("string", {}, "hyperlink stored as URL text");
          break;
        case "image":
          push("image");
          break;
        case "person":
          push("string", {}, "person mapped to display-name text (no real user link); use synthetic names");
          decisions.push({ title: `Person field flattened: ${list.displayName}.${col.displayName}`, detail: "Mapped to text (display name) to keep the demo portable and identity-free; synthesize names." });
          break;
        case "personmulti":
          push("string", {}, "multi-person flattened to text");
          decisions.push({ title: `Multi-person flattened: ${list.displayName}.${col.displayName}`, detail: "Mapped to text; synthesize a comma-separated list of fictitious names." });
          break;
        case "lookup":
        case "lookupmulti": {
          const targetTable = col.lookupList ? listToTable.get(col.lookupList.trim().toLowerCase()) : undefined;
          if (targetTable) {
            const colBase = dvSchema.slice(prefix.length + 1).toLowerCase();
            lookups.push({ schemaName: dvSchema, displayName: col.displayName, target: targetTable, relationshipName: `${tableSchema.toLowerCase()}_${colBase}` });
            columnMap.push({ list: list.displayName, spName: col.name, spType: col.type, dvSchemaName: dvSchema, dvType: "lookup", note: `-> ${targetTable}` });
            if (col.type === "lookupmulti") decisions.push({ title: `Multi-lookup simplified: ${list.displayName}.${col.displayName}`, detail: "SharePoint multi-value lookup mapped to a single Dataverse lookup for the demo." });
          } else {
            push("string", {}, `lookup to out-of-scope list '${col.lookupList ?? "?"}' flattened to text`);
            decisions.push({ title: `Lookup flattened: ${list.displayName}.${col.displayName}`, detail: `Referenced list '${col.lookupList ?? "?"}' is not in scope; stored the display value as text.` });
          }
          break;
        }
        case "calculated":
          skip("calculated/rollup not recreated — recompute in the app or a Dataverse rollup");
          decisions.push({ title: `Calculated column skipped: ${list.displayName}.${col.displayName}`, detail: "Calculated/rollup values are not recreated as stored columns; recompute in the app." });
          break;
        case "attachments":
          push("file", {}, "list attachments mapped to a file column");
          break;
        default:
          push("string", {}, `unrecognized SharePoint type mapped to text`);
          decisions.push({ title: `Unknown type mapped to text: ${list.displayName}.${col.displayName}`, detail: "SharePoint column type wasn't recognized; defaulted to text." });
      }
    }

    tables.push({
      schemaName: tableSchema,
      displayName: list.displayName,
      collectionName: list.displayName,
      primaryColumn: { schemaName: primaryName, displayName: primaryDisplay },
      columns,
      lookups
    });
  }

  return { tables: orderByLookupDeps(tables, decisions), columnMap, decisions };
}

/** Order tables so a lookup's target table is created before the table that references it. */
function orderByLookupDeps(tables: DvTableSpec[], decisions: MapDecision[]): DvTableSpec[] {
  const byLogical = new Map<string, DvTableSpec>();
  for (const t of tables) byLogical.set(t.schemaName.toLowerCase(), t);
  const ordered: DvTableSpec[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();

  const visit = (t: DvTableSpec): void => {
    const key = t.schemaName.toLowerCase();
    if (done.has(key)) return;
    if (visiting.has(key)) {
      decisions.push({ title: `Lookup cycle broken at ${t.displayName}`, detail: "A circular lookup was detected; provision tables in listed order and add the back-reference lookup after import if needed." });
      return;
    }
    visiting.add(key);
    for (const lk of t.lookups) {
      const dep = byLogical.get(lk.target.toLowerCase());
      if (dep && dep !== t) visit(dep);
    }
    visiting.delete(key);
    done.add(key);
    ordered.push(t);
  };

  for (const t of tables) visit(t);
  return ordered;
}
