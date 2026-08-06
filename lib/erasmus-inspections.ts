/**
 * Deterministic synthetic Erasmus memorial safety inspections.
 *
 * Inspection campaigns are seeded by cemetery + section, so neighbouring
 * memorials normally share an inspection visit. Full records are generated
 * on demand; only lightweight summary fields are stamped onto map features.
 */

export const INSPECTION_INTERVAL_YEARS = 2;
export const INSPECTION_DUE_WINDOW_DAYS = 90;

export type InspectionStatus =
  | "current"
  | "due"
  | "overdue"
  | "no_monument";

export type InspectionOutcome =
  | "Pass"
  | "Monitor"
  | "Repair required"
  | "Made safe";

export type InspectionRisk = "Low" | "Medium" | "High" | "Critical";

export type ErasmusInspectionRecord = {
  id: string;
  memorialRecordId: string;
  inspectedAt: string;
  inspector: string;
  outcome: InspectionOutcome;
  risk: InspectionRisk;
  notes: string;
  nextDueAt: string;
};

export type ErasmusInspectionSummary = {
  recordId: string | null;
  lastInspectedAt: string | null;
  nextDueAt: string | null;
  status: InspectionStatus;
  outcome: InspectionOutcome | null;
  risk: InspectionRisk | null;
};

export type InspectionFeatureLike = {
  id: string | number;
  properties: Record<string, unknown>;
};

export type InspectionCounts = {
  total: number;
  current: number;
  due: number;
  overdue: number;
  no_monument: number;
  flagged: number;
};

const INSPECTORS = [
  "Aled Morgan",
  "Bethan Hughes",
  "Carys Evans",
  "Dylan Thomas",
  "Elin Roberts",
  "Gareth Davies",
] as const;

const NOTES: Record<InspectionOutcome, readonly string[]> = {
  Pass: [
    "Memorial stable with no movement detected.",
    "Fixings secure and memorial remains serviceable.",
    "Visual and hand test completed without concern.",
  ],
  Monitor: [
    "Minor movement noted; monitor at the next section visit.",
    "Early weathering visible with no immediate safety concern.",
    "Joint condition recorded for follow-up inspection.",
  ],
  "Repair required": [
    "Movement exceeds tolerance; responsible owner should be contacted.",
    "Fixing requires remedial work before the next routine visit.",
    "Memorial requires a competent memorial mason assessment.",
  ],
  "Made safe": [
    "Immediate hazard controlled and memorial temporarily made safe.",
    "Area secured pending permanent remedial work.",
    "Memorial laid down following failed stability assessment.",
  ],
};

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length) % values.length];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return isoDate(date);
}

function validIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

function sectionKey(properties: Record<string, unknown>): string {
  const cemetery = String(properties.Cem ?? "cemetery").trim() || "cemetery";
  const section = String(properties.Sect ?? "unsectioned").trim() || "unsectioned";
  return `${cemetery}\u001f${section}`;
}

function memorialRecordId(feature: InspectionFeatureLike): string {
  const linked = String(feature.properties.epilog_record_id ?? "").trim();
  return linked || `MEM-${hashSeed(String(feature.id)).toString(36).toUpperCase()}`;
}

/**
 * Stable campaign date for a section, aged relative to `now` so demos always
 * include current, due-soon, and overdue sections. Neighbours in the same
 * section stay within a few days of each other.
 */
function syntheticInspectionDate(
  feature: InspectionFeatureLike,
  now = new Date(),
): string {
  const sectionSeed = hashSeed(`erasmus-section:${sectionKey(feature.properties)}`);
  const graveSeed = hashSeed(`erasmus-grave:${String(feature.id)}`);
  const bucket = sectionSeed % 100;
  // ~55% current, ~15% due within 90 days, ~30% overdue.
  let daysAgo: number;
  if (bucket < 55) {
    // Inspected 4–20 months ago → still current.
    daysAgo = 120 + (sectionSeed % 480);
  } else if (bucket < 70) {
    // Next due falls inside the 90-day window (10–80 days from now).
    daysAgo =
      INSPECTION_INTERVAL_YEARS * 365 -
      (10 + (Math.floor(sectionSeed / 11) % 71));
  } else {
    // Overdue by 1–24 months.
    daysAgo =
      INSPECTION_INTERVAL_YEARS * 365 + 30 + (Math.floor(sectionSeed / 13) % 700);
  }
  const jitter = graveSeed % 4;
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - daysAgo + jitter);
  return isoDate(date);
}

function syntheticOutcome(rng: () => number): {
  outcome: InspectionOutcome;
  risk: InspectionRisk;
} {
  const roll = rng();
  if (roll < 0.72) return { outcome: "Pass", risk: "Low" };
  if (roll < 0.88) return { outcome: "Monitor", risk: "Medium" };
  if (roll < 0.97) return { outcome: "Repair required", risk: "High" };
  return { outcome: "Made safe", risk: "Critical" };
}

export function inspectionStatus(
  lastInspectedAt: string | null | undefined,
  now = new Date(),
): InspectionStatus {
  if (!lastInspectedAt || !validIsoDate(lastInspectedAt)) return "no_monument";
  const due = new Date(`${addYears(lastInspectedAt, INSPECTION_INTERVAL_YEARS)}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (today.getTime() > due.getTime()) return "overdue";
  const dueWindowStart = new Date(
    due.getTime() - INSPECTION_DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return today.getTime() >= dueWindowStart.getTime() ? "due" : "current";
}

export function inspectionStatusLabel(status: InspectionStatus): string {
  switch (status) {
    case "current":
      return "Current";
    case "due":
      return "Due soon";
    case "overdue":
      return "Overdue";
    case "no_monument":
      return "No monument";
  }
}

export function inspectionRecordForFeature(
  feature: InspectionFeatureLike,
  now = new Date(),
): ErasmusInspectionRecord | null {
  const rng = createRng(hashSeed(`erasmus-record:${String(feature.id)}`));
  // Lawn graves and plots with no above-ground memorial have nothing to test.
  if (rng() < 0.08) return null;
  const inspectedAt = syntheticInspectionDate(feature, now);
  const { outcome, risk } = syntheticOutcome(rng);
  const recordId = `ERA-${hashSeed(String(feature.id))
    .toString(36)
    .toUpperCase()
    .padStart(7, "0")}`;
  return {
    id: recordId,
    memorialRecordId: memorialRecordId(feature),
    inspectedAt,
    inspector: pick(rng, INSPECTORS),
    outcome,
    risk,
    notes: pick(rng, NOTES[outcome]),
    nextDueAt: addYears(inspectedAt, INSPECTION_INTERVAL_YEARS),
  };
}

export function inspectionSummaryForFeature(
  feature: InspectionFeatureLike,
  now = new Date(),
): ErasmusInspectionSummary {
  const record = inspectionRecordForFeature(feature, now);
  if (!record) {
    return {
      recordId: null,
      lastInspectedAt: null,
      nextDueAt: null,
      status: "no_monument",
      outcome: null,
      risk: null,
    };
  }
  return {
    recordId: record.id,
    lastInspectedAt: record.inspectedAt,
    nextDueAt: record.nextDueAt,
    status: inspectionStatus(record.inspectedAt, now),
    outcome: record.outcome,
    risk: record.risk,
  };
}

export function listInspectionSections(
  features: readonly InspectionFeatureLike[],
): string[] {
  const sections = new Set<string>();
  for (const feature of features) {
    const section = String(feature.properties.Sect ?? "").trim();
    if (section) sections.add(section);
  }
  return Array.from(sections).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

export function inspectionCounts(
  features: readonly InspectionFeatureLike[],
  section: string | null = null,
  now = new Date(),
): InspectionCounts {
  const counts: InspectionCounts = {
    total: 0,
    current: 0,
    due: 0,
    overdue: 0,
    no_monument: 0,
    flagged: 0,
  };
  for (const feature of features) {
    if (section && String(feature.properties.Sect ?? "") !== section) continue;
    const status = inspectionSummaryForFeature(feature, now).status;
    counts.total += 1;
    counts[status] += 1;
    if (feature.properties.erasmus_flagged === true) counts.flagged += 1;
  }
  return counts;
}

export function inspectionFeatureIds(
  features: readonly InspectionFeatureLike[],
  options: {
    section?: string | null;
    statuses?: readonly InspectionStatus[];
    risks?: readonly InspectionRisk[];
    flagged?: boolean;
    now?: Date;
  } = {},
): string[] {
  const statuses = options.statuses ? new Set(options.statuses) : null;
  const risks = options.risks ? new Set(options.risks) : null;
  const ids: string[] = [];
  for (const feature of features) {
    if (
      options.section &&
      String(feature.properties.Sect ?? "") !== options.section
    ) {
      continue;
    }
    if (
      options.flagged != null &&
      (feature.properties.erasmus_flagged === true) !== options.flagged
    ) {
      continue;
    }
    const summary = inspectionSummaryForFeature(feature, options.now);
    if (statuses && !statuses.has(summary.status)) continue;
    if (risks && (!summary.risk || !risks.has(summary.risk))) continue;
    ids.push(String(feature.id));
  }
  return ids;
}

export function enrichFeaturesWithInspectionSummaries<
  T extends InspectionFeatureLike,
>(features: readonly T[], now = new Date()): T[] {
  return features.map((feature) => {
    const summary = inspectionSummaryForFeature(feature, now);
    const existingFlag = feature.properties.erasmus_flagged;
    const flagged =
      typeof existingFlag === "boolean"
        ? existingFlag
        : syntheticInspectionQueueFlag(feature, summary);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        erasmus_record_id: summary.recordId ?? undefined,
        erasmus_last_inspected: summary.lastInspectedAt ?? undefined,
        erasmus_next_due: summary.nextDueAt ?? undefined,
        erasmus_status: summary.status,
        erasmus_outcome: summary.outcome ?? undefined,
        erasmus_risk: summary.risk ?? undefined,
        ...(flagged
          ? {
              erasmus_flagged: true,
              erasmus_flagged_at: String(
                feature.properties.erasmus_flagged_at ??
                  `${summary.nextDueAt ?? now.toISOString().slice(0, 10)}T09:00:00.000Z`,
              ),
            }
          : {
              erasmus_flagged: false,
              erasmus_flagged_at: undefined,
            }),
      },
    };
  });
}

/**
 * Seed a realistic inspection queue: mostly due/overdue memorials, plus a few
 * higher-risk current ones. Lawn graves with no monument are never queued.
 */
function syntheticInspectionQueueFlag(
  feature: InspectionFeatureLike,
  summary: ErasmusInspectionSummary,
): boolean {
  if (summary.status === "no_monument") return false;
  const rng = createRng(hashSeed(`erasmus-queue:${String(feature.id)}`));
  if (summary.status === "due") return rng() < 0.35;
  if (summary.status === "overdue") return rng() < 0.22;
  if (summary.risk === "Critical") return rng() < 0.4;
  if (summary.risk === "High") return rng() < 0.18;
  return rng() < 0.015;
}
