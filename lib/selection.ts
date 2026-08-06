import type { CemeteryCollection, CemeteryFeature, EditLayer } from "@/lib/geo";
import type { GenericFeature, MapProject } from "@/lib/project-model";

/**
 * The workspace keeps one selection at a time, but it can hold many features
 * so bulk record work (references, numbering, exports) reads from one place.
 */
export type Selection = {
  layer: EditLayer;
  ids: string[];
};

export function selectOne(layer: EditLayer, id: string | number): Selection {
  return { layer, ids: [String(id)] };
}

export function selectMany(
  layer: EditLayer,
  ids: Iterable<string | number>,
): Selection | null {
  const unique = Array.from(new Set(Array.from(ids, String)));
  return unique.length ? { layer, ids: unique } : null;
}

export function selectionSize(selection: Selection | null): number {
  return selection?.ids.length ?? 0;
}

export function primaryId(selection: Selection | null): string | null {
  return selection?.ids[0] ?? null;
}

/** Ctrl/Shift-click behaviour: add, or drop when the feature is already in. */
export function toggleSelection(
  selection: Selection | null,
  layer: EditLayer,
  id: string | number,
): Selection | null {
  const key = String(id);
  if (!selection || selection.layer !== layer) {
    return { layer, ids: [key] };
  }
  const ids = selection.ids.includes(key)
    ? selection.ids.filter((candidate) => candidate !== key)
    : [...selection.ids, key];
  return ids.length ? { layer, ids } : null;
}

export function extendSelection(
  selection: Selection | null,
  layer: EditLayer,
  ids: Iterable<string | number>,
): Selection | null {
  const incoming = Array.from(ids, String);
  if (!selection || selection.layer !== layer) {
    return selectMany(layer, incoming);
  }
  return selectMany(layer, [...selection.ids, ...incoming]);
}

export function removeFromSelection(
  selection: Selection | null,
  id: string | number,
): Selection | null {
  if (!selection) {
    return null;
  }
  const ids = selection.ids.filter((candidate) => candidate !== String(id));
  return ids.length ? { layer: selection.layer, ids } : null;
}

export function selectedFeatures(
  selection: Selection | null,
  base: CemeteryCollection,
  graves: CemeteryCollection,
): CemeteryFeature[] {
  if (!selection) {
    return [];
  }
  const wanted = new Set(selection.ids);
  const source = selection.layer === "graves" ? graves : base;
  return source.features.filter((feature) => wanted.has(String(feature.id)));
}

export function selectedProjectFeatures(
  selection: Selection | null,
  project: MapProject,
): GenericFeature[] {
  if (!selection) {
    return [];
  }
  const layer = project.layers.find(
    (candidate) => candidate.id === selection.layer,
  );
  if (!layer) {
    return [];
  }
  const wanted = new Set(selection.ids);
  return layer.data.features.filter((feature) =>
    wanted.has(String(feature.id)),
  ) as GenericFeature[];
}
