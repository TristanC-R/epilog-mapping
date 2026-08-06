/**
 * Bulk export and outreach helpers for selected memorial plots.
 * Pulls memorial attributes from the map feature and deceased / owner
 * details from the synthetic (or future) Cloud record.
 */

import {
  demoCloudRecordForGrave,
  type DemoCloudRecord,
  type DemoInterment,
  type DemoOwner,
} from "@/lib/demo-records";

const MEMORIAL_COLUMNS = [
  "epilog_id",
  "epilog_record_id",
  "status",
  "burial_count",
  "Cem",
  "Sect",
  "SubSect",
  "Grave",
  "SubGrave",
  "GraveRef",
  "HasID",
] as const;

const OWNER_COLUMNS = [
  "owner_forename",
  "owner_surname",
  "owner_email",
  "owner_relationship",
  "owner_address",
  "owner_postcode",
] as const;

const MAX_DECEASED = 5;

export type GraveFeatureLike = {
  id: string | number;
  properties: Record<string, unknown>;
};

/** Which record groups to include in a selective CSV export. */
export type GraveExportSections = {
  memorial: boolean;
  deceased: boolean;
  owner: boolean;
};

export const DEFAULT_GRAVE_EXPORT_SECTIONS: GraveExportSections = {
  memorial: true,
  deceased: true,
  owner: true,
};

export function hasExportSection(sections: GraveExportSections): boolean {
  return sections.memorial || sections.deceased || sections.owner;
}

function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cloudForFeature(feature: GraveFeatureLike): DemoCloudRecord {
  const fromProps = feature.properties.epilog_id;
  const id =
    typeof fromProps === "string" || typeof fromProps === "number"
      ? fromProps
      : feature.id;
  return demoCloudRecordForGrave(id);
}

function deceasedColumns(): string[] {
  const columns: string[] = [];
  for (let index = 1; index <= MAX_DECEASED; index += 1) {
    columns.push(
      `deceased_${index}_forename`,
      `deceased_${index}_surname`,
      `deceased_${index}_burial_date`,
      `deceased_${index}_age_at_death`,
      `deceased_${index}_sex`,
    );
  }
  return columns;
}

function deceasedValues(interments: readonly DemoInterment[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < MAX_DECEASED; index += 1) {
    const person = interments[index];
    values.push(
      person?.forename ?? "",
      person?.surname ?? "",
      person?.burialDate ?? "",
      person?.ageAtDeath == null ? "" : String(person.ageAtDeath),
      person?.sex ?? "",
    );
  }
  return values;
}

function ownerValues(owner: DemoOwner | null): string[] {
  return [
    owner?.forename ?? "",
    owner?.surname ?? "",
    owner?.email ?? "",
    owner?.relationship ?? "",
    owner?.addressLine ?? "",
    owner?.postcode ?? "",
  ];
}

function memorialValue(
  feature: GraveFeatureLike,
  cloud: DemoCloudRecord,
  key: (typeof MEMORIAL_COLUMNS)[number],
): string {
  const props = feature.properties;
  if (key === "epilog_id") {
    return escapeCsv(props.epilog_id ?? feature.id);
  }
  if (key === "epilog_record_id") {
    return escapeCsv(props.epilog_record_id ?? cloud.recordId);
  }
  if (key === "status") {
    return escapeCsv(props.status ?? cloud.status);
  }
  if (key === "burial_count") {
    return escapeCsv(props.burial_count ?? cloud.interments.length);
  }
  return escapeCsv(props[key]);
}

function graveRefValue(
  feature: GraveFeatureLike,
  cloud: DemoCloudRecord,
): string {
  const fromProps = String(feature.properties.GraveRef ?? "").trim();
  if (fromProps) return escapeCsv(fromProps);
  const sect = String(feature.properties.Sect ?? "").trim();
  const grave = feature.properties.Grave;
  if (sect && grave != null && String(grave).trim() !== "") {
    return escapeCsv(`${sect}-${grave}`);
  }
  return escapeCsv(feature.properties.epilog_record_id ?? cloud.recordId);
}

/** Selective CSV for memorial / deceased / owner groups. */
export function gravesRecordsCsv(
  features: readonly GraveFeatureLike[],
  sections: GraveExportSections = DEFAULT_GRAVE_EXPORT_SECTIONS,
): string {
  if (!hasExportSection(sections)) {
    return "";
  }

  const columns: string[] = [];
  // When memorial fields are omitted, GraveRef stays first so rows can be joined.
  if (!sections.memorial) {
    columns.push("GraveRef");
  }
  if (sections.memorial) {
    columns.push(...MEMORIAL_COLUMNS);
  }
  if (sections.deceased) {
    columns.push(...deceasedColumns());
  }
  if (sections.owner) {
    columns.push(...OWNER_COLUMNS);
  }

  const rows = features.map((feature) => {
    const cloud = cloudForFeature(feature);
    const cells: string[] = [];
    if (!sections.memorial) {
      cells.push(graveRefValue(feature, cloud));
    }
    if (sections.memorial) {
      for (const key of MEMORIAL_COLUMNS) {
        cells.push(memorialValue(feature, cloud, key));
      }
    }
    if (sections.deceased) {
      cells.push(...deceasedValues(cloud.interments).map(escapeCsv));
    }
    if (sections.owner) {
      cells.push(...ownerValues(cloud.owner).map(escapeCsv));
    }
    return cells.join(",");
  });

  return [columns.join(","), ...rows].join("\n");
}

/** Unique owner emails for selected graves that have an owner account. */
export function ownerEmailsForGraves(
  features: readonly GraveFeatureLike[],
): string[] {
  const emails = new Set<string>();
  for (const feature of features) {
    const owner = cloudForFeature(feature).owner;
    const email = owner?.email?.trim().toLowerCase();
    if (email) {
      emails.add(email);
    }
  }
  return Array.from(emails).sort();
}

const MAILTO_SAFE_LENGTH = 1800;

/**
 * Open the system mail client with owners on BCC.
 * Falls back to copying the address list when the selection is too large.
 */
export async function emailOwnersOfGraves(
  features: readonly GraveFeatureLike[],
): Promise<{
  emailed: number;
  copied: boolean;
  missing: number;
  mode: "mailto" | "clipboard" | "empty";
}> {
  const emails = ownerEmailsForGraves(features);
  const withOwner = features.filter(
    (feature) => cloudForFeature(feature).owner?.email,
  ).length;
  const missing = features.length - withOwner;

  if (!emails.length) {
    return { emailed: 0, copied: false, missing, mode: "empty" };
  }

  const bcc = emails.join(",");
  const mailto = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(
    "Regarding your memorial",
  )}`;

  if (mailto.length <= MAILTO_SAFE_LENGTH) {
    window.location.href = mailto;
    return {
      emailed: emails.length,
      copied: false,
      missing,
      mode: "mailto",
    };
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(emails.join("; "));
    copied = true;
  } catch {
    // Clipboard may be blocked; caller can still download CSV.
  }

  return {
    emailed: emails.length,
    copied,
    missing,
    mode: "clipboard",
  };
}
