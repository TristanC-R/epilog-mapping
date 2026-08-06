import type { CemeteryCollection } from "@/lib/geo";
import {
  createMapProjectFromLegacy,
  getLegacyCollections,
  type MapProject,
} from "@/lib/project-model";

const DATABASE_NAME = "epilog-mapping";
const DATABASE_VERSION = 2;
const STORE_NAME = "projects";
const PROJECT_ID = "upminster";

type LegacyStoredCemeteryProject = {
  id: string;
  version: 1;
  savedAt: string;
  base: CemeteryCollection;
  graves: CemeteryCollection;
};

export type StoredMapProject = MapProject & {
  savedAt: string;
};

/** Includes read-time aliases required by the original workspace. */
export type StoredCemeteryProject = StoredMapProject & {
  base: CemeteryCollection;
  graves: CemeteryCollection;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withLegacyAliases(record: StoredMapProject): StoredCemeteryProject {
  return { ...record, ...getLegacyCollections(record) };
}

function writeRecord(
  database: IDBDatabase,
  record: StoredMapProject,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadStoredProject(): Promise<StoredCemeteryProject | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }
  const database = await openDatabase();
  try {
    const stored = await new Promise<
      LegacyStoredCemeteryProject | StoredMapProject | null
    >((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(PROJECT_ID);
      request.onsuccess = () =>
        resolve(
          (request.result as
            | LegacyStoredCemeteryProject
            | StoredMapProject
            | undefined) ?? null,
        );
      request.onerror = () => reject(request.error);
    });
    if (!stored) {
      return null;
    }
    if (stored.version === 1) {
      const migrated: StoredMapProject = {
        ...createMapProjectFromLegacy(stored.base, stored.graves, stored.id),
        savedAt: stored.savedAt,
      };
      await writeRecord(database, migrated);
      return withLegacyAliases(migrated);
    }
    return withLegacyAliases(stored);
  } finally {
    database.close();
  }
}

export async function saveStoredProject(project: MapProject): Promise<string>;
export async function saveStoredProject(
  base: CemeteryCollection,
  graves: CemeteryCollection,
): Promise<string>;
export async function saveStoredProject(
  projectOrBase: MapProject | CemeteryCollection,
  graves?: CemeteryCollection,
): Promise<string> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Local project storage is unavailable.");
  }
  const savedAt = new Date().toISOString();
  const project =
    "version" in projectOrBase && projectOrBase.version === 2
      ? projectOrBase
      : createMapProjectFromLegacy(
          projectOrBase as CemeteryCollection,
          graves ?? { type: "FeatureCollection", features: [] },
          PROJECT_ID,
        );
  const record: StoredMapProject = {
    id: project.id || PROJECT_ID,
    version: 2,
    layers: project.layers,
    savedAt,
  };
  const database = await openDatabase();
  try {
    await writeRecord(database, record);
  } finally {
    database.close();
  }
  return savedAt;
}

