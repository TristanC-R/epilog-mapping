/** Preferred display order for grave attributes in the inspector. */
const GRAVE_RECORD_FIELDS = [
  "Cem",
  "Sect",
  "SubSect",
  "Grave",
  "SubGrave",
  "GraveRef",
  "HasID",
] as const;

const HIDDEN_FIELDS = new Set([
  "epilog_id",
  "epilog_record_id",
  "burial_count",
  "cds_id",
  "cds_idx",
  "cds_mode",
  "cds_points",
  "cds_params",
  "cds_label_px20",
  "erasmus_record_id",
  "erasmus_last_inspected",
  "erasmus_next_due",
  "erasmus_status",
  "erasmus_outcome",
  "erasmus_risk",
  "erasmus_flagged",
  "erasmus_flagged_at",
]);

export type GraveRecordRow = {
  key: string;
  label: string;
  value: string;
  empty: boolean;
};

/**
 * Attribute keys present on the selection that are safe for bulk editing.
 * Preferred memorial fields come first; internal/system keys are excluded.
 */
export function editableGraveFields(
  features: readonly { properties?: Record<string, unknown> | null }[],
): string[] {
  const keys = new Set<string>();
  for (const feature of features) {
    const props = feature.properties ?? {};
    for (const key of Object.keys(props)) {
      if (HIDDEN_FIELDS.has(key) || key.startsWith("cds_")) continue;
      keys.add(key);
    }
  }
  const preferred = GRAVE_RECORD_FIELDS.filter((key) => keys.has(key));
  for (const key of preferred) keys.delete(key);
  // Keep status near the top when present.
  const status = keys.has("status") ? ["status"] : [];
  keys.delete("status");
  const rest = Array.from(keys).sort((left, right) =>
    left.localeCompare(right),
  );
  return [...preferred, ...status, ...rest];
}

function formatValue(value: unknown): { text: string; empty: boolean } {
  if (value == null) {
    return { text: "—", empty: true };
  }
  if (typeof value === "boolean") {
    return { text: value ? "Yes" : "No", empty: false };
  }
  if (typeof value === "number") {
    return { text: Number.isFinite(value) ? String(value) : "—", empty: !Number.isFinite(value) };
  }
  const text = String(value).trim();
  if (!text) {
    return { text: "—", empty: true };
  }
  return { text, empty: false };
}

export function graveRecordRows(
  properties: Record<string, unknown> | null | undefined,
): GraveRecordRow[] {
  const props = properties ?? {};
  const seen = new Set<string>();
  const rows: GraveRecordRow[] = [];

  for (const key of GRAVE_RECORD_FIELDS) {
    seen.add(key);
    const { text, empty } = formatValue(props[key]);
    rows.push({ key, label: key, value: text, empty });
  }

  for (const key of Object.keys(props).sort()) {
    if (seen.has(key) || HIDDEN_FIELDS.has(key)) {
      continue;
    }
    const { text, empty } = formatValue(props[key]);
    rows.push({ key, label: key, value: text, empty });
  }

  return rows;
}

/** One row of the multi-select working list. */
export type GraveListItem = {
  id: string;
  title: string;
  reference: string;
  status: string;
  linked: boolean;
  burialCount: number;
};

export function graveListItem(feature: {
  id: string | number;
  properties: Record<string, unknown>;
}): GraveListItem {
  const props = feature.properties;
  const burialCount = Number(props.burial_count);
  return {
    id: String(feature.id),
    title: graveRecordTitle(props),
    reference: String(props.GraveRef ?? "").trim(),
    status: String(props.status ?? "").trim(),
    linked: String(props.epilog_record_id ?? "").trim().length > 0,
    burialCount: Number.isFinite(burialCount) ? burialCount : 0,
  };
}

export function graveRecordTitle(
  properties: Record<string, unknown> | null | undefined,
): string {
  const props = properties ?? {};
  const sect = String(props.Sect ?? "").trim();
  const grave = props.Grave;
  const sub = String(props.SubGrave ?? "").trim();
  const gravePart =
    grave != null && String(grave).trim() !== ""
      ? `${grave}${sub ? sub : ""}`
      : "";

  if (sect && gravePart) {
    return `${sect} · ${gravePart}`;
  }
  if (sect) {
    return sect;
  }
  if (gravePart) {
    return `Grave ${gravePart}`;
  }
  return "Grave record";
}
