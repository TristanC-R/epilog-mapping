"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { emptyCollection, type CemeteryCollection } from "@/lib/geo";
import {
  BASE_LAYER_ID,
  GRAVES_LAYER_ID,
  createMapProjectFromLegacy,
  getLegacyCollections,
  getProjectLayer,
  type GenericFeatureCollection,
  type MapLayer,
  type MapProject,
  type NewMapLayer,
} from "@/lib/project-model";
import { saveStoredProject } from "@/lib/project-store";

const MAX_HISTORY = 50;
const AUTOSAVE_DELAY_MS = 900;

type Snapshot = {
  project: MapProject;
  label: string;
};

export type CemeteryProject = {
  project: MapProject;
  /** Always current, unlike state, so map callbacks can read it safely. */
  projectRef: RefObject<MapProject>;
  layers: MapLayer[];
  activeLayerId: string | null;
  activeLayer: MapLayer | null;
  base: CemeteryCollection;
  graves: CemeteryCollection;
  /** Always current, unlike state, so map callbacks can read them safely. */
  baseRef: RefObject<CemeteryCollection>;
  gravesRef: RefObject<CemeteryCollection>;
  commit: (
    base: CemeteryCollection,
    graves: CemeteryCollection,
    label: string,
  ) => void;
  reset: (base: CemeteryCollection, graves: CemeteryCollection) => void;
  commitProject: (next: MapProject, label: string) => void;
  resetProject: (project: MapProject) => void;
  setActiveLayer: (id: string | null) => void;
  updateLayer: (
    id: string,
    updater: (layer: MapLayer) => MapLayer,
    label: string,
  ) => void;
  addLayer: (layer: NewMapLayer, label?: string) => string;
  removeLayer: (id: string, label?: string) => void;
  reorderLayer: (
    id: string,
    destination: number | "up" | "down",
    label?: string,
  ) => void;
  toggleLayerEditable: (id: string, label?: string) => void;
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  lastSaved: string | null;
  setLastSaved: (savedAt: string | null) => void;
  markSaved: () => void;
};

function newLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function replaceLegacyCollections(
  project: MapProject,
  base: CemeteryCollection,
  graves: CemeteryCollection,
): MapProject {
  const replacements = new Map<string, GenericFeatureCollection>([
    [BASE_LAYER_ID, base as GenericFeatureCollection],
    [GRAVES_LAYER_ID, graves as GenericFeatureCollection],
  ]);
  const found = new Set<string>();
  const layers = project.layers.map((layer) => {
    const data = replacements.get(layer.id);
    if (!data) {
      return layer;
    }
    found.add(layer.id);
    return { ...layer, data };
  });
  if (!found.has(BASE_LAYER_ID) || !found.has(GRAVES_LAYER_ID)) {
    const defaults = createMapProjectFromLegacy(base, graves, project.id);
    for (const layer of defaults.layers) {
      if (!found.has(layer.id)) {
        layers.push(layer);
      }
    }
  }
  return { ...project, version: 2, layers };
}

/**
 * Owns the ordered v2 project, undo history and local autosave. Legacy
 * base/graves views remain available while the workspace moves to layers.
 */
export function useCemeteryProject(options: {
  autosave: boolean;
  onAutosaveError?: () => void;
}): CemeteryProject {
  const { autosave, onAutosaveError } = options;

  const [project, setProject] = useState<MapProject>(() =>
    createMapProjectFromLegacy(emptyCollection(), emptyCollection()),
  );
  const projectRef = useRef<MapProject>(project);
  const initialCollections = getLegacyCollections(project);
  const baseRef = useRef<CemeteryCollection>(initialCollections.base);
  const gravesRef = useRef<CemeteryCollection>(initialCollections.graves);
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const revision = useRef(0);

  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    GRAVES_LAYER_ID,
  );
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const publish = useCallback((nextProject: MapProject) => {
    const collections = getLegacyCollections(nextProject);
    revision.current += 1;
    projectRef.current = nextProject;
    baseRef.current = collections.base;
    gravesRef.current = collections.graves;
    setProject(nextProject);
    setActiveLayerId((current) =>
      current && getProjectLayer(nextProject, current)
        ? current
        : (getProjectLayer(nextProject, GRAVES_LAYER_ID)?.id ??
          nextProject.layers[0]?.id ??
          null),
    );
    setHistory({
      undo: undoStack.current.length,
      redo: redoStack.current.length,
    });
  }, []);

  const commitProject = useCallback(
    (nextProject: MapProject, label: string) => {
      undoStack.current.push({ project: projectRef.current, label });
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift();
      }
      redoStack.current = [];
      publish(nextProject);
      setIsDirty(true);
    },
    [publish],
  );

  const resetProject = useCallback(
    (nextProject: MapProject) => {
      undoStack.current = [];
      redoStack.current = [];
      publish(nextProject);
      setIsDirty(false);
    },
    [publish],
  );

  const commit = useCallback(
    (
      nextBase: CemeteryCollection,
      nextGraves: CemeteryCollection,
      label: string,
    ) => {
      commitProject(
        replaceLegacyCollections(
          projectRef.current,
          nextBase,
          nextGraves,
        ),
        label,
      );
    },
    [commitProject],
  );

  const reset = useCallback(
    (nextBase: CemeteryCollection, nextGraves: CemeteryCollection) => {
      resetProject(
        createMapProjectFromLegacy(
          nextBase,
          nextGraves,
          projectRef.current.id,
        ),
      );
    },
    [resetProject],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) {
      return null;
    }
    redoStack.current.push({
      project: projectRef.current,
      label: previous.label,
    });
    publish(previous.project);
    setIsDirty(true);
    return previous.label;
  }, [publish]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) {
      return null;
    }
    undoStack.current.push({
      project: projectRef.current,
      label: next.label,
    });
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    publish(next.project);
    setIsDirty(true);
    return next.label;
  }, [publish]);

  const setActiveLayer = useCallback((id: string | null) => {
    setActiveLayerId(
      id == null || getProjectLayer(projectRef.current, id) ? id : null,
    );
  }, []);

  const updateLayer = useCallback(
    (
      id: string,
      updater: (layer: MapLayer) => MapLayer,
      label: string,
    ) => {
      const current = projectRef.current;
      if (!getProjectLayer(current, id)) {
        return;
      }
      commitProject(
        {
          ...current,
          layers: current.layers.map((layer) =>
            layer.id === id ? { ...updater(layer), id: layer.id } : layer,
          ),
        },
        label,
      );
    },
    [commitProject],
  );

  const addLayer = useCallback(
    (input: NewMapLayer, label = "Add layer") => {
      const requestedId =
        input.kind === "base"
          ? BASE_LAYER_ID
          : input.kind === "graves"
            ? GRAVES_LAYER_ID
            : input.id;
      let id = requestedId || newLayerId();
      if (
        (id === BASE_LAYER_ID || id === GRAVES_LAYER_ID) &&
        getProjectLayer(projectRef.current, id)
      ) {
        setActiveLayerId(id);
        return id;
      }
      while (getProjectLayer(projectRef.current, id)) {
        id = newLayerId();
      }
      const layer: MapLayer = {
        ...input,
        id,
        visible: input.visible ?? true,
        editable: input.editable ?? true,
        fields: input.fields ? [...input.fields] : [],
        data: input.data ?? { type: "FeatureCollection", features: [] },
      };
      commitProject(
        {
          ...projectRef.current,
          layers: [...projectRef.current.layers, layer],
        },
        label,
      );
      setActiveLayerId(id);
      return id;
    },
    [commitProject],
  );

  const removeLayer = useCallback(
    (id: string, label = "Remove layer") => {
      const current = projectRef.current;
      if (!getProjectLayer(current, id)) {
        return;
      }
      commitProject(
        {
          ...current,
          layers: current.layers.filter((layer) => layer.id !== id),
        },
        label,
      );
    },
    [commitProject],
  );

  const reorderLayer = useCallback(
    (
      id: string,
      destination: number | "up" | "down",
      label = "Reorder layer",
    ) => {
      const current = projectRef.current;
      const fromIndex = current.layers.findIndex((layer) => layer.id === id);
      if (fromIndex < 0 || current.layers.length < 2) {
        return;
      }
      const toIndex =
        destination === "up"
          ? fromIndex - 1
          : destination === "down"
            ? fromIndex + 1
            : destination;
      const target = Math.max(
        0,
        Math.min(Math.trunc(toIndex), current.layers.length - 1),
      );
      if (target === fromIndex) {
        return;
      }
      const layers = [...current.layers];
      const [layer] = layers.splice(fromIndex, 1);
      layers.splice(target, 0, layer);
      commitProject({ ...current, layers }, label);
    },
    [commitProject],
  );

  const toggleLayerEditable = useCallback(
    (id: string, label = "Toggle layer editing") => {
      updateLayer(
        id,
        (layer) => ({ ...layer, editable: !layer.editable }),
        label,
      );
    },
    [updateLayer],
  );

  const markSaved = useCallback(() => setIsDirty(false), []);

  useEffect(() => {
    if (!autosave || !isDirty) {
      return;
    }
    const pending = revision.current;
    const timeout = window.setTimeout(() => {
      void saveStoredProject(projectRef.current)
        .then((savedAt) => {
          setLastSaved(savedAt);
          if (pending === revision.current) {
            setIsDirty(false);
          }
        })
        .catch(() => onAutosaveError?.());
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [autosave, history, isDirty, onAutosaveError]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const { base, graves } = getLegacyCollections(project);
  const activeLayer = useMemo(
    () =>
      (activeLayerId
        ? getProjectLayer(project, activeLayerId)
        : undefined) ?? null,
    [activeLayerId, project],
  );

  return {
    project,
    projectRef,
    layers: project.layers,
    activeLayerId,
    activeLayer,
    base,
    graves,
    baseRef,
    gravesRef,
    commit,
    reset,
    commitProject,
    resetProject,
    setActiveLayer,
    updateLayer,
    addLayer,
    removeLayer,
    reorderLayer,
    toggleLayerEditable,
    undo,
    redo,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    isDirty,
    lastSaved,
    setLastSaved,
    markSaved,
  };
}
