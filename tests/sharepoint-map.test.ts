import assert from "node:assert/strict";
import test from "node:test";
import { mapSharePointToDataverse, dvName, type SpSchema } from "../src/sharepoint-map.js";

const schema: SpSchema = {
  site: "https://contoso.sharepoint.com/sites/ops",
  lists: [
    {
      name: "Equipment",
      displayName: "Equipment",
      columns: [
        { name: "Title", displayName: "Title", type: "text", required: true },
        { name: "Asset_x0020_Tag", displayName: "Asset Tag", type: "text", maxLength: 255 },
        { name: "Category", displayName: "Category", type: "choice", choices: ["PPE", "Wound Care"] },
        { name: "Tags", displayName: "Tags", type: "multichoice", choices: ["A", "B"] },
        { name: "Cost", displayName: "Cost", type: "currency" },
        { name: "OnHand", displayName: "On Hand", type: "number", decimals: 0 },
        { name: "Weight", displayName: "Weight", type: "number", decimals: 2 },
        { name: "InService", displayName: "In Service", type: "boolean" },
        { name: "DueDate", displayName: "Due Date", type: "date" },
        { name: "Owner", displayName: "Owner", type: "person" },
        { name: "Room", displayName: "Room", type: "lookup", lookupList: "Rooms" },
        { name: "Vendor", displayName: "Vendor", type: "lookup", lookupList: "Vendors" },
        { name: "Photo", displayName: "Photo", type: "image" },
        { name: "TotalValue", displayName: "Total Value", type: "calculated" }
      ]
    },
    {
      name: "Rooms",
      displayName: "Rooms",
      columns: [
        { name: "Title", displayName: "Title", type: "text" },
        { name: "Floor", displayName: "Floor", type: "number", decimals: 0 }
      ]
    }
  ]
};

test("dvName sanitizes a SharePoint display name into <prefix>_PascalCase", () => {
  assert.equal(dvName("sp", "Asset Tag"), "sp_AssetTag");
  assert.equal(dvName("sp", "On-Hand Count!"), "sp_OnHandCount");
  assert.equal(dvName("sp", ""), "sp_Col");
});

test("maps every SharePoint type to the right Dataverse column type", () => {
  const { tables } = mapSharePointToDataverse(schema, { prefix: "sp" });
  const eq = tables.find((t) => t.displayName === "Equipment");
  assert.ok(eq);
  const byName = new Map(eq.columns.map((c) => [c.schemaName, c]));
  assert.equal(eq.primaryColumn.schemaName, "sp_Title");
  assert.equal(byName.get("sp_AssetTag")?.type, "string");
  assert.equal(byName.get("sp_AssetTag")?.maxLength, 255);
  assert.equal(byName.get("sp_Category")?.type, "choice");
  assert.deepEqual(byName.get("sp_Category")?.options, ["PPE", "Wound Care"]);
  assert.equal(byName.get("sp_Cost")?.type, "money");
  assert.equal(byName.get("sp_OnHand")?.type, "int");
  assert.equal(byName.get("sp_Weight")?.type, "decimal");
  assert.equal(byName.get("sp_InService")?.type, "boolean");
  assert.equal(byName.get("sp_DueDate")?.type, "datetime");
  assert.equal(byName.get("sp_Photo")?.type, "image");
  // person -> text (portable, identity-free)
  assert.equal(byName.get("sp_Owner")?.type, "string");
  // calculated -> not a column
  assert.equal(byName.has("sp_TotalValue"), false);
});

test("in-scope lookup becomes a Dataverse lookup; out-of-scope flattens to text", () => {
  const { tables, decisions } = mapSharePointToDataverse(schema, { prefix: "sp" });
  const eq = tables.find((t) => t.displayName === "Equipment");
  assert.ok(eq);
  const room = eq.lookups.find((l) => l.schemaName === "sp_Room");
  assert.ok(room, "Room is a lookup");
  assert.equal(room?.target, "sp_rooms");
  // Vendor list is not in scope -> flattened to a string column
  assert.equal(eq.columns.some((c) => c.schemaName === "sp_Vendor" && c.type === "string"), true);
  assert.ok(decisions.some((d) => /Lookup flattened/.test(d.title)));
});

test("referenced table is ordered before the table that references it", () => {
  const { tables } = mapSharePointToDataverse(schema, { prefix: "sp" });
  const roomsIdx = tables.findIndex((t) => t.displayName === "Rooms");
  const eqIdx = tables.findIndex((t) => t.displayName === "Equipment");
  assert.ok(roomsIdx < eqIdx, "Rooms (referenced) comes before Equipment (referencing)");
});

test("records decisions for simplifications and skips, and a full column map", () => {
  const { columnMap, decisions } = mapSharePointToDataverse(schema, { prefix: "sp" });
  assert.ok(decisions.some((d) => /Multi-choice simplified/.test(d.title)));
  assert.ok(decisions.some((d) => /Person field flattened/.test(d.title)));
  assert.ok(decisions.some((d) => /Calculated column skipped/.test(d.title)));
  // TotalValue tracked as skipped in the column map
  const total = columnMap.find((c) => c.spName === "TotalValue");
  assert.equal(total?.dvType, "skipped");
  // Title tracked as the primary
  assert.ok(columnMap.some((c) => c.spName === "Title" && c.dvType === "primary"));
});
