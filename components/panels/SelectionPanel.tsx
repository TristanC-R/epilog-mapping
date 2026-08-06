"use client";

import { useMemo, useState } from "react";

import GraveInspector from "@/components/panels/GraveInspector";
import GenericFeatureInspector from "@/components/panels/GenericFeatureInspector";
import {
  SURFACE_ORDER,
  SURFACE_STYLE,
  type SurfaceClass,
} from "@/lib/base-style";
import {
  editableGraveFields,
  type GraveListItem,
  type GraveRecordRow,
} from "@/lib/grave-records";
import type { EditLayer } from "@/lib/geo";
import type { GenericFeature, MapLayer } from "@/lib/project-model";
import {
  DEFAULT_GRAVE_EXPORT_SECTIONS,
  hasExportSection,
  type GraveExportSections,
} from "@/lib/bulk-records";

export type SelectionPanelProps = {
  layer: EditLayer | null;
  layerMeta: MapLayer | null;
  genericFeatures: GenericFeature[];
  items: GraveListItem[];
  primary: {
    title: string | null;
    rows: GraveRecordRow[];
    properties: Record<string, unknown>;
  } | null;
  selectedSurface: SurfaceClass | null;
  onAssignSurface: (surface: SurfaceClass) => void;
  onSavePrimary: (patch: Record<string, unknown>) => void;
  onGeneratePrimaryReference: () => void;
  onZoomTo: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onBulkUpdate: (patch: Record<string, unknown>) => void;
  onBulkDelete: () => void;
  onBulkReferences: () => void;
  onExportCsv: (sections: GraveExportSections) => void;
  onEmailOwners: () => void;
  onSaveGeneric: (patch: Record<string, unknown>) => void;
};

const LIST_LIMIT = 200;

export default function SelectionPanel({
  layer,
  layerMeta,
  genericFeatures,
  items,
  primary,
  selectedSurface,
  onAssignSurface,
  onSavePrimary,
  onGeneratePrimaryReference,
  onZoomTo,
  onRemove,
  onClear,
  onBulkUpdate,
  onBulkDelete,
  onBulkReferences,
  onExportCsv,
  onEmailOwners,
  onSaveGeneric,
}: SelectionPanelProps) {
  const bulkFields = useMemo(
    () => editableGraveFields(genericFeatures),
    [genericFeatures],
  );
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [exportSections, setExportSections] = useState<GraveExportSections>(
    DEFAULT_GRAVE_EXPORT_SECTIONS,
  );
  const effectiveBulkField =
    bulkField && bulkFields.includes(bulkField)
      ? bulkField
      : (bulkFields[0] ?? "");

  const toggleExportSection = (key: keyof GraveExportSections) => {
    setExportSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const canExport = hasExportSection(exportSections);

  if (!layer) {
    return (
      <p className="tool-options__assign-empty">
        Click a plot to open its record. Shift-click, or drag with Box select,
        to build a working list.
      </p>
    );
  }

  if (layerMeta && layerMeta.kind === "generic") {
    const feature = genericFeatures[0];
    return feature ? (
      <GenericFeatureInspector
        key={`${layerMeta.id}:${String(feature.id)}`}
        layer={layerMeta}
        feature={feature}
        selectionCount={genericFeatures.length}
        onSave={onSaveGeneric}
      />
    ) : (
      <p className="tool-options__assign-empty">
        Select a feature from {layerMeta.name} to inspect its attributes.
      </p>
    );
  }

  if (layer === "base") {
    return (
      <div className="panel-stack">
        <p className="tool-options__assign-label">
          Assign surface
          {selectedSurface ? (
            <span> · current {SURFACE_STYLE[selectedSurface].label}</span>
          ) : null}
        </p>
        <div className="tool-options__surface-grid" role="group">
          {SURFACE_ORDER.map((surface) => {
            const active = selectedSurface === surface;
            return (
              <button
                key={surface}
                type="button"
                className={`tool-options__surface-btn${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => onAssignSurface(surface)}
              >
                <span
                  className="tool-options__surface-swatch"
                  style={{ background: SURFACE_STYLE[surface].fill }}
                  aria-hidden
                />
                {SURFACE_STYLE[surface].label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const single = items.length === 1 && primary;

  return (
    <div className="panel-stack">
      <div className="selection-summary">
        <div>
          <p className="eyebrow">Working list</p>
          <strong>
            {items.length.toLocaleString()} grave
            {items.length === 1 ? "" : "s"} selected
          </strong>
        </div>
        <button
          type="button"
          className="secondary-action secondary-action--inline"
          onClick={onClear}
        >
          Clear
        </button>
      </div>

      {items.length > 1 ? (
        <>
          <ul className="selection-list">
            {items.slice(0, LIST_LIMIT).map((item) => (
              <li key={item.id} className="selection-list__item">
                <button
                  type="button"
                  className="selection-list__zoom"
                  onClick={() => onZoomTo(item.id)}
                  title="Zoom to this grave"
                >
                  <span>{item.title}</span>
                  <small>
                    {item.reference || "No reference"}
                    {item.linked
                      ? ` · ${item.burialCount} burial${item.burialCount === 1 ? "" : "s"}`
                      : ""}
                    {item.status ? ` · ${item.status}` : ""}
                  </small>
                </button>
                <span
                  className={`dot${item.linked ? " is-good" : ""}`}
                  title={
                    item.linked
                      ? `Cloud linked · ${item.status || "linked"}`
                      : "Not linked"
                  }
                  aria-hidden
                />
                <button
                  type="button"
                  className="selection-list__remove"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title} from the list`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {items.length > LIST_LIMIT ? (
            <p className="issue-list__empty">
              Showing the first {LIST_LIMIT} of {items.length.toLocaleString()}.
              Bulk actions still apply to every selected grave.
            </p>
          ) : null}

          <details className="compact-details" open>
            <summary>Bulk actions</summary>
            <div className="compact-details__body">
              <p className="tool-options__assign-label">Records &amp; outreach</p>
              <div
                className="export-section-toggles"
                role="group"
                aria-label="CSV export sections"
              >
                <label className="tool-options__check">
                  <input
                    type="checkbox"
                    checked={exportSections.memorial}
                    onChange={() => toggleExportSection("memorial")}
                  />
                  Memorial
                </label>
                <label className="tool-options__check">
                  <input
                    type="checkbox"
                    checked={exportSections.deceased}
                    onChange={() => toggleExportSection("deceased")}
                  />
                  Deceased
                </label>
                <label className="tool-options__check">
                  <input
                    type="checkbox"
                    checked={exportSections.owner}
                    onChange={() => toggleExportSection("owner")}
                  />
                  Owner
                </label>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-action"
                  disabled={!canExport}
                  onClick={() => onExportCsv(exportSections)}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onEmailOwners}
                >
                  Email owners
                </button>
              </div>
              <p className="issue-list__empty">
                {exportSections.memorial
                  ? "Export the checked sections only."
                  : "GraveRef is included as the first column when memorial fields are off."}
              </p>

              <p className="tool-options__assign-label">Mapped fields</p>
              <div className="tool-options__inline-fields">
                <label>
                  Field
                  <select
                    value={effectiveBulkField}
                    disabled={!bulkFields.length}
                    onChange={(event) => setBulkField(event.target.value)}
                  >
                    {bulkFields.length === 0 ? (
                      <option value="">No fields</option>
                    ) : (
                      bulkFields.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  Value
                  <input
                    value={bulkValue}
                    onChange={(event) => setBulkValue(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-action"
                disabled={!effectiveBulkField}
                onClick={() =>
                  onBulkUpdate({ [effectiveBulkField]: bulkValue })
                }
              >
                Apply field to selection
              </button>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onBulkReferences}
                >
                  Rebuild refs
                </button>
                <button
                  type="button"
                  className="secondary-action secondary-action--danger"
                  onClick={onBulkDelete}
                >
                  Delete selected
                </button>
              </div>
            </div>
          </details>
        </>
      ) : null}

      {single ? (
        <>
          <div
            className="export-section-toggles"
            role="group"
            aria-label="CSV export sections"
          >
            <label className="tool-options__check">
              <input
                type="checkbox"
                checked={exportSections.memorial}
                onChange={() => toggleExportSection("memorial")}
              />
              Memorial
            </label>
            <label className="tool-options__check">
              <input
                type="checkbox"
                checked={exportSections.deceased}
                onChange={() => toggleExportSection("deceased")}
              />
              Deceased
            </label>
            <label className="tool-options__check">
              <input
                type="checkbox"
                checked={exportSections.owner}
                onChange={() => toggleExportSection("owner")}
              />
              Owner
            </label>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="secondary-action"
              disabled={!canExport}
              onClick={() => onExportCsv(exportSections)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={onEmailOwners}
            >
              Email owner
            </button>
          </div>
          <GraveInspector
            key={items[0].id}
            title={primary.title}
            properties={primary.properties}
            rows={primary.rows}
            featureId={items[0].id}
            onSave={onSavePrimary}
            onGenerateReference={onGeneratePrimaryReference}
          />
        </>
      ) : null}
    </div>
  );
}
