import fs from "fs";

/** Merge durable map.json fields after a pipeline run. */
export function patchMapJson(mapJsonPath, patches) {
  if (!fs.existsSync(mapJsonPath)) return false;
  const data = JSON.parse(fs.readFileSync(mapJsonPath, "utf8"));
  Object.assign(data, patches);
  data.updated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(mapJsonPath, JSON.stringify(data, null, 2) + "\n");
  return true;
}
