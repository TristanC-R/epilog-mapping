"use client";

import { useMemo, useState } from "react";

import type { GenericFeature, MapLayer } from "@/lib/project-model";

type GenericFeatureInspectorProps = {
  layer: MapLayer;
  feature: GenericFeature;
  selectionCount: number;
  onSave: (patch: Record<string, unknown>) => void;
};

function editableProperties(feature: GenericFeature): Record<string, string> {
  return Object.fromEntries(
    Object.entries(feature.properties ?? {})
      .filter(([key]) => key !== "epilog_id" && !key.startsWith("cds_"))
      .map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
}

export function coerceLayerAttributeValues(
  layer: Pick<MapLayer, "fields">,
  values: Record<string, string>,
): Record<string, unknown> {
  const fieldTypes = new Map(
    layer.fields.map((field) => [field.name, field.type ?? "string"]),
  );
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const type = fieldTypes.get(key) ?? "string";
      if (type === "number") {
        if (!value.trim()) return [key, null];
        const number = Number(value);
        return [key, Number.isFinite(number) ? number : null];
      }
      if (type === "boolean") {
        return [key, /^(true|1|yes|on)$/i.test(value)];
      }
      if (type === "date") {
        const date = value.trim();
        return [key, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null];
      }
      return [key, value];
    }),
  );
}

export default function GenericFeatureInspector({
  layer,
  feature,
  selectionCount,
  onSave,
}: GenericFeatureInspectorProps) {
  const initial = useMemo(() => editableProperties(feature), [feature]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [newField, setNewField] = useState("");

  const fieldTypes = useMemo(
    () =>
      new Map(
        layer.fields.map((field) => [
          field.name,
          field.type ?? ("string" as const),
        ]),
      ),
    [layer.fields],
  );

  const addField = () => {
    const key = newField.trim();
    if (!key || key in values) {
      return;
    }
    setValues((current) => ({ ...current, [key]: "" }));
    setNewField("");
  };

  return (
    <div className="record-inspector">
      <div className="record-inspector__heading">
        <div>
          <p className="eyebrow">{layer.name}</p>
          <h3>
            {selectionCount === 1
              ? `${layer.geometryFamily} feature`
              : `${selectionCount.toLocaleString()} features`}
          </h3>
        </div>
        <span className={`pill${layer.editable ? " is-good" : ""}`}>
          {layer.editable ? "Editing" : "Read only"}
        </span>
      </div>

      <dl className="tool-options__record-list">
        <div className="tool-options__record-row">
          <dt>Geometry</dt>
          <dd>{feature.geometry.type}</dd>
        </div>
        <div className="tool-options__record-row">
          <dt>Feature ID</dt>
          <dd>{String(feature.id)}</dd>
        </div>
      </dl>

      {selectionCount === 1 ? (
        <details className="record-inspector__details" open>
          <summary>Attributes</summary>
          <div className="generic-attributes">
            {Object.entries(values).map(([key, value]) => (
              <label key={key}>
                <span>{key}</span>
                {fieldTypes.get(key) === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={/^(true|1|yes|on)$/i.test(value)}
                    disabled={!layer.editable}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [key]: String(event.target.checked),
                      }))
                    }
                  />
                ) : (
                  <input
                    type={
                      fieldTypes.get(key) === "number"
                        ? "number"
                        : fieldTypes.get(key) === "date"
                          ? "date"
                          : "text"
                    }
                    value={value}
                    disabled={!layer.editable}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
            <div className="generic-attributes__new">
              <input
                value={newField}
                disabled={!layer.editable}
                placeholder="New field name"
                onChange={(event) => setNewField(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addField();
                  }
                }}
              />
              <button
                type="button"
                className="secondary-action secondary-action--inline"
                disabled={!layer.editable || !newField.trim()}
                onClick={addField}
              >
                Add
              </button>
            </div>
          </div>
          <button
            type="button"
            className="primary-action"
            disabled={!layer.editable}
            onClick={() => onSave(coerceLayerAttributeValues(layer, values))}
          >
            Save attributes
          </button>
        </details>
      ) : (
        <p className="tool-options__assign-empty">
          Attribute editing is available when one feature is selected.
        </p>
      )}
    </div>
  );
}
