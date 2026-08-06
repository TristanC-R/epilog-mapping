"use client";

import { useState } from "react";

import type {
  GeometryFamily,
  LayerKind,
  LayerStyle,
} from "@/lib/project-model";

export type NewLayerOptions = {
  name: string;
  geometryFamily: GeometryFamily;
  kind: LayerKind;
  style: LayerStyle;
};

type CreateLayerDialogProps = {
  onCreate: (options: NewLayerOptions) => void;
  onCancel: () => void;
};

const DEFAULT_STYLES: Record<GeometryFamily, LayerStyle> = {
  point: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.9,
    width: 2,
    radius: 6,
  },
  line: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.9,
    width: 2.5,
    radius: 5,
  },
  polygon: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.45,
    width: 1.2,
    radius: 5,
  },
};

export default function CreateLayerDialog({
  onCreate,
  onCancel,
}: CreateLayerDialogProps) {
  const [name, setName] = useState("New polygon layer");
  const [geometryFamily, setGeometryFamily] =
    useState<GeometryFamily>("polygon");
  const [kind, setKind] = useState<LayerKind>("generic");
  const [color, setColor] = useState(DEFAULT_STYLES.polygon.fillColor);

  const changeFamily = (family: GeometryFamily) => {
    setGeometryFamily(family);
    setName(`New ${family} layer`);
    setColor(DEFAULT_STYLES[family].fillColor);
    if (family !== "polygon") {
      setKind("generic");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="layer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-layer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <p className="eyebrow">Project layer</p>
          <h2 id="create-layer-title">Create a new layer</h2>
          <p>
            Choose one geometry family. New features will be written here while
            this layer is active and editable.
          </p>
        </header>

        <div className="layer-dialog__form">
          <label>
            Layer name
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <fieldset>
            <legend>Geometry</legend>
            <div className="segmented">
              {(["point", "line", "polygon"] as const).map((family) => (
                <button
                  key={family}
                  type="button"
                  className={`segmented__btn${geometryFamily === family ? " is-active" : ""}`}
                  aria-pressed={geometryFamily === family}
                  onClick={() => changeFamily(family)}
                >
                  {family[0].toUpperCase() + family.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            Layer purpose
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as LayerKind)}
            >
              <option value="generic">General mapping</option>
              {geometryFamily === "polygon" ? (
                <>
                  <option value="graves">Grave records</option>
                  <option value="base">Cemetery surfaces</option>
                </>
              ) : null}
            </select>
          </label>

          <label className="layer-dialog__color">
            Display colour
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
        </div>

        <footer className="button-row">
          <button type="button" className="secondary-action" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-action"
            disabled={!name.trim()}
            onClick={() =>
              onCreate({
                name: name.trim(),
                geometryFamily,
                kind,
                style: {
                  ...DEFAULT_STYLES[geometryFamily],
                  color:
                    geometryFamily === "polygon"
                      ? DEFAULT_STYLES[geometryFamily].color
                      : color,
                  fillColor: color,
                },
              })
            }
          >
            Create and edit
          </button>
        </footer>
      </section>
    </div>
  );
}
