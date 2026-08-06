/**
 * Deterministic synthetic Epic Cloud records for demo and UX work.
 * Generated from the grave feature id so reloads stay stable without
 * bloating GeoJSON / IndexedDB with nested person data.
 */

export type DemoInterment = {
  id: string;
  forename: string;
  surname: string;
  burialDate: string;
  ageAtDeath: number | null;
  sex: "F" | "M" | "U";
};

export type DemoOwner = {
  id: string;
  forename: string;
  surname: string;
  email: string;
  relationship: string;
  addressLine: string;
  postcode: string;
  relatedIntermentId: string;
};

export type DemoPlotStatus = "Available" | "Occupied" | "Reserved";

export type DemoCloudRecord = {
  recordId: string;
  status: DemoPlotStatus;
  interments: DemoInterment[];
  owner: DemoOwner | null;
};

const FORENAMES_F = [
  "Margaret",
  "Dorothy",
  "Joan",
  "Elizabeth",
  "Mary",
  "Susan",
  "Patricia",
  "Helen",
  "Barbara",
  "Christine",
  "Janet",
  "Irene",
  "Florence",
  "Edith",
  "Gladys",
  "Vera",
  "Joyce",
  "Ann",
  "Sarah",
  "Emma",
];

const FORENAMES_M = [
  "Arthur",
  "George",
  "William",
  "Albert",
  "Harold",
  "Frederick",
  "John",
  "Charles",
  "Edward",
  "Frank",
  "Henry",
  "Thomas",
  "Robert",
  "James",
  "Joseph",
  "Stanley",
  "Ernest",
  "Walter",
  "David",
  "Peter",
];

const SURNAMES = [
  "Smith",
  "Jones",
  "Williams",
  "Brown",
  "Taylor",
  "Davies",
  "Wilson",
  "Evans",
  "Thomas",
  "Johnson",
  "Roberts",
  "Walker",
  "Wright",
  "Robinson",
  "Thompson",
  "White",
  "Hughes",
  "Edwards",
  "Green",
  "Hall",
  "Clark",
  "Lewis",
  "Harris",
  "Martin",
  "Jackson",
  "Clarke",
  "Wood",
  "Turner",
  "Hill",
  "Cooper",
];

const STREETS = [
  "Station Road",
  "High Street",
  "Church Lane",
  "Manor Way",
  "Park Avenue",
  "Victoria Road",
  "The Green",
  "Corbets Tey Road",
  "St Mary's Lane",
  "Upminster Road",
  "Hall Lane",
  "Front Lane",
];

const RELATIONSHIPS = [
  "Spouse",
  "Daughter",
  "Son",
  "Sister",
  "Brother",
  "Executor",
  "Niece",
  "Nephew",
];

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

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function occupantCount(rng: () => number): number {
  const roll = rng();
  if (roll < 0.14) return 0;
  if (roll < 0.42) return 1;
  if (roll < 0.68) return 2;
  if (roll < 0.84) return 3;
  if (roll < 0.94) return 4;
  return 5;
}

function burialDate(rng: () => number, index: number, count: number): string {
  const year =
    1920 + Math.floor(rng() * 100) + index * Math.floor(4 + rng() * 10);
  const clampedYear = Math.min(
    2024,
    Math.max(1918, year - (count - 1 - index) * 8),
  );
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 27);
  return `${clampedYear}-${pad(month, 2)}-${pad(day, 2)}`;
}

function personName(
  rng: () => number,
  sex: "F" | "M" | "U",
  family?: string,
) {
  const resolvedSex = sex === "U" ? (rng() < 0.5 ? "F" : "M") : sex;
  return {
    forename: pick(rng, resolvedSex === "F" ? FORENAMES_F : FORENAMES_M),
    surname: family ?? pick(rng, SURNAMES),
    sex: resolvedSex as "F" | "M",
  };
}

function postcode(rng: () => number): string {
  const outward = pick(rng, ["RM14", "RM13", "RM12", "RM11"]);
  const letters = "ABCDEFGHJKLMNPRSTUWXYZ".split("");
  const inward = `${pick(rng, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])}${pick(
    rng,
    letters,
  )}${pick(rng, letters)}`;
  return `${outward} ${inward}`;
}

function ownerEmail(
  rng: () => number,
  forename: string,
  surname: string,
): string {
  const local = `${forename}.${surname}`
    .toLowerCase()
    .replace(/[^a-z.]+/g, "")
    .replace(/\.+/g, ".");
  const domain = pick(rng, [
    "example.com",
    "mail.test",
    "epilog-demo.local",
    "outlook.test",
    "gmail.test",
  ]);
  const discriminator = 1 + Math.floor(rng() * 98);
  return `${local}${discriminator}@${domain}`;
}

/**
 * Build a stable demo Cloud record for a grave. Empty plots have no owner;
 * occupied plots have an owner related only to the most recent interment.
 */
export function demoCloudRecordForGrave(
  featureId: string | number,
): DemoCloudRecord {
  const id = String(featureId);
  const rng = createRng(hashSeed(`epilog-demo:${id}`));
  const count = occupantCount(rng);
  const recordId = `EPL-UPM-${pad((hashSeed(id) % 900000) + 100000, 6)}`;
  const familyName = pick(rng, SURNAMES);

  if (count === 0) {
    const reserved = rng() < 0.18;
    return {
      recordId,
      status: reserved ? "Reserved" : "Available",
      interments: [],
      owner: null,
    };
  }

  const interments: DemoInterment[] = [];
  for (let index = 0; index < count; index += 1) {
    const shareFamily = index === 0 || rng() < 0.72;
    const person = personName(rng, "U", shareFamily ? familyName : undefined);
    interments.push({
      id: `${recordId}-INT-${index + 1}`,
      forename: person.forename,
      surname: person.surname,
      burialDate: burialDate(rng, index, count),
      ageAtDeath: 28 + Math.floor(rng() * 62),
      sex: person.sex,
    });
  }

  interments.sort((left, right) =>
    left.burialDate.localeCompare(right.burialDate),
  );

  const latest = interments[interments.length - 1];
  const ownerIsSameFamily = rng() < 0.8;
  const ownerSex = rng() < 0.55 ? "F" : "M";
  const ownerPerson = personName(
    rng,
    ownerSex,
    ownerIsSameFamily ? latest.surname : undefined,
  );

  return {
    recordId,
    status: "Occupied",
    interments,
    owner: {
      id: `${recordId}-OWN`,
      forename: ownerPerson.forename,
      surname: ownerPerson.surname,
      email: ownerEmail(rng, ownerPerson.forename, ownerPerson.surname),
      relationship: pick(rng, RELATIONSHIPS),
      addressLine: `${1 + Math.floor(rng() * 148)} ${pick(rng, STREETS)}`,
      postcode: postcode(rng),
      relatedIntermentId: latest.id,
    },
  };
}

/** Lightweight plot fields safe to store on map features. */
export function demoPlotSummary(featureId: string | number): {
  epilog_record_id: string;
  status: DemoPlotStatus;
  burial_count: number;
} {
  const record = demoCloudRecordForGrave(featureId);
  return {
    epilog_record_id: record.recordId,
    status: record.status,
    burial_count: record.interments.length,
  };
}

export function attachDemoRecordsToGraves<
  T extends { id: string | number; properties: Record<string, unknown> },
>(features: T[]): T[] {
  return features.map((feature) => {
    if (String(feature.properties.epilog_record_id ?? "").trim()) {
      return feature;
    }
    const summary = demoPlotSummary(feature.id);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        ...summary,
      },
    };
  });
}

export function formatDemoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}
