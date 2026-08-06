"use client";

import { useCallback, useMemo, useState } from "react";

import {
  inspectionCounts,
  inspectionFeatureIds,
  inspectionStatusLabel,
  listInspectionSections,
  type InspectionCounts,
  type InspectionFeatureLike,
  type InspectionRisk,
  type InspectionStatus,
} from "@/lib/erasmus-inspections";

export type ErasmusInspectionController = {
  section: string | null;
  setSection: (section: string | null) => void;
  sections: string[];
  summary: InspectionCounts;
  highlightedIds: string[];
  selectStatuses: (statuses: readonly InspectionStatus[]) => void;
  selectRisks: (risks: readonly InspectionRisk[]) => void;
  selectFlagged: () => void;
  flagSelected: () => void;
  clearSelectedFlags: () => void;
  clearHighlights: () => void;
};

export function useErasmusInspections(options: {
  features: readonly InspectionFeatureLike[];
  selectedIds: readonly string[];
  onSelect: (ids: string[]) => void;
  onZoom: (ids: string[]) => void;
  onSetFlag: (ids: readonly string[], flagged: boolean) => void;
  onStatus: (message: string) => void;
}): ErasmusInspectionController {
  const {
    features,
    selectedIds,
    onSelect,
    onZoom,
    onSetFlag,
    onStatus,
  } = options;
  const [section, setSectionState] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  const sections = useMemo(() => listInspectionSections(features), [features]);
  const summary = useMemo(
    () => inspectionCounts(features, section),
    [features, section],
  );

  const setSection = useCallback(
    (next: string | null) => {
      setSectionState(next);
      setHighlightedIds([]);
      onSelect([]);
      if (next) {
        const ids = inspectionFeatureIds(features, { section: next });
        if (ids.length) onZoom(ids);
        onStatus(
          ids.length
            ? `Section ${next} · ${ids.length.toLocaleString()} plot${ids.length === 1 ? "" : "s"} in view.`
            : `Section ${next} has no plots on the map.`,
        );
        return;
      }
      const allIds = features.map((feature) => String(feature.id));
      if (allIds.length) onZoom(allIds);
      onStatus("Showing all cemetery sections.");
    },
    [features, onSelect, onStatus, onZoom],
  );

  const applyResults = useCallback(
    (ids: string[], label: string) => {
      setHighlightedIds(ids);
      onSelect(ids);
      if (ids.length) onZoom(ids);
      onStatus(
        ids.length
          ? `${ids.length.toLocaleString()} ${label} memorial${ids.length === 1 ? "" : "s"} selected.`
          : `No ${label} memorials found${section ? ` in section ${section}` : ""}.`,
      );
    },
    [onSelect, onStatus, onZoom, section],
  );

  const selectStatuses = useCallback(
    (statuses: readonly InspectionStatus[]) => {
      const ids = inspectionFeatureIds(features, { section, statuses });
      applyResults(
        ids,
        statuses.map((status) => inspectionStatusLabel(status).toLowerCase()).join(" / "),
      );
    },
    [applyResults, features, section],
  );

  const selectRisks = useCallback(
    (risks: readonly InspectionRisk[]) => {
      const ids = inspectionFeatureIds(features, { section, risks });
      applyResults(ids, `${risks.join(" / ")} risk`);
    },
    [applyResults, features, section],
  );

  const selectFlagged = useCallback(() => {
    const ids = inspectionFeatureIds(features, { section, flagged: true });
    applyResults(ids, "queued");
  }, [applyResults, features, section]);

  const flagSelected = useCallback(() => {
    if (!selectedIds.length) {
      onStatus("Select one or more graves before adding them to the inspection queue.");
      return;
    }
    onSetFlag(selectedIds, true);
  }, [onSetFlag, onStatus, selectedIds]);

  const clearSelectedFlags = useCallback(() => {
    if (!selectedIds.length) {
      onStatus("Select queued graves before removing them from the inspection queue.");
      return;
    }
    onSetFlag(selectedIds, false);
  }, [onSetFlag, onStatus, selectedIds]);

  const clearHighlights = useCallback(() => {
    setHighlightedIds([]);
    onStatus("Cleared Erasmus inspection highlights.");
  }, [onStatus]);

  return {
    section,
    setSection,
    sections,
    summary,
    highlightedIds,
    selectStatuses,
    selectRisks,
    selectFlagged,
    flagSelected,
    clearSelectedFlags,
    clearHighlights,
  };
}
