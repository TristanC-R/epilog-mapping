"use client";

import { useState } from "react";

import {
  SURFACE_ORDER,
  SURFACE_STYLE,
  type SurfaceClass,
} from "@/lib/base-style";
import {
  GRAVE_LABEL_MODES,
  type GraveLabelMode,
} from "@/lib/cemetery-layers";
import {
  GRAVE_COLORS,
  GRAVE_COLOR_MODES,
  OCCUPANCY_GRADIENTS,
  getGraveColor,
  graveColorLegend,
  occupancyGradientCss,
  type GraveColorId,
  type GraveColorModeId,
  type OccupancyGradientId,
} from "@/lib/grave-style";
import type { MapLayer } from "@/lib/project-model";

type LayerPanelProps = {
  layers: MapLayer[];
  activeLayerId: string | null;
  surfaceVisibility: Record<SurfaceClass, boolean>;
  onSurfaceVisibility: (value: Record<SurfaceClass, boolean>) => void;
  graveColorId: GraveColorId;
  onGraveColorChange: (id: GraveColorId) => void;
  graveColorMode: GraveColorModeId;
  onGraveColorModeChange: (mode: GraveColorModeId) => void;
  occupancyGradientId: OccupancyGradientId;
  onOccupancyGradientChange: (id: OccupancyGradientId) => void;
  labelMode: GraveLabelMode;
  onLabelMode: (mode: GraveLabelMode) => void;
  flaggedCount: number;
  onClearFlagged: () => void;
  onActivate: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleEditable: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRename: (id: string, name: string) => void;
  onStyle: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
};

function GeometryMark({ layer }: { layer: MapLayer }) {
  return (
    <span
      className={`layer-geometry layer-geometry--${layer.geometryFamily}`}
      style={{
        color: layer.style.color,
        background:
          layer.geometryFamily === "polygon"
            ? layer.style.fillColor
            : undefined,
      }}
      aria-hidden
    />
  );
}

export default function LayerPanel({
  layers,
  activeLayerId,
  surfaceVisibility,
  onSurfaceVisibility,
  graveColorId,
  onGraveColorChange,
  graveColorMode,
  onGraveColorModeChange,
  occupancyGradientId,
  onOccupancyGradientChange,
  labelMode,
  onLabelMode,
  flaggedCount,
  onClearFlagged,
  onActivate,
  onToggleVisible,
  onToggleEditable,
  onMove,
  onRename,
  onStyle,
  onDelete,
  onAdd,
}: LayerPanelProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const graveColor = getGraveColor(graveColorId);
  const legend = graveColorLegend(
    graveColorMode,
    graveColorId,
    occupancyGradientId,
  );
  const displayLayers = [...layers].reverse();

  return (
    <section className="layer-panel" aria-label="Map layers">
      <div className="layer-panel__heading">
        <div>
          <p className="layer-panel__label">Layers</p>
          <span>Choose the active target, then toggle editing.</span>
        </div>
        <button type="button" className="layer-panel__add" onClick={onAdd}>
          + New
        </button>
      </div>

      <ul className="project-layer-list">
        {displayLayers.map((layer, displayIndex) => {
          const active = layer.id === activeLayerId;
          return (
            <li
              key={layer.id}
              className={`project-layer${active ? " is-active" : ""}${layer.visible ? "" : " is-hidden"}`}
            >
              <div className="project-layer__row">
                <button
                  type="button"
                  className="project-layer__visibility"
                  aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  aria-pressed={layer.visible}
                  onClick={() => onToggleVisible(layer.id)}
                >
                  {layer.visible ? "●" : "○"}
                </button>
                <button
                  type="button"
                  className="project-layer__main"
                  onClick={() => onActivate(layer.id)}
                >
                  <GeometryMark layer={layer} />
                  <span>
                    <strong>{layer.name}</strong>
                    <small>
                      {layer.geometryFamily} ·{" "}
                      {layer.data.features.length.toLocaleString()}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`project-layer__edit${layer.editable ? " is-on" : ""}`}
                  aria-label={`${layer.editable ? "Stop editing" : "Make editable"} ${layer.name}`}
                  aria-pressed={layer.editable}
                  title={
                    layer.editable
                      ? "Editing is on"
                      : "Toggle editing for this layer"
                  }
                  onClick={() => onToggleEditable(layer.id)}
                >
                  ✎
                </button>
              </div>

              {active ? (
                <div className="project-layer__details">
                  {editingName === layer.id ? (
                    <div className="project-layer__rename">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && nameDraft.trim()) {
                            onRename(layer.id, nameDraft.trim());
                            setEditingName(null);
                          }
                          if (event.key === "Escape") {
                            setEditingName(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (nameDraft.trim()) {
                            onRename(layer.id, nameDraft.trim());
                          }
                          setEditingName(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : null}

                  <div className="project-layer__actions">
                    <button
                      type="button"
                      disabled={displayIndex === 0}
                      onClick={() => onMove(layer.id, "up")}
                      title="Move layer up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={displayIndex === displayLayers.length - 1}
                      onClick={() => onMove(layer.id, "down")}
                      title="Move layer down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(layer.name);
                        setEditingName(layer.id);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => onDelete(layer.id)}
                    >
                      Delete
                    </button>
                  </div>

                  {layer.kind === "generic" ? (
                    <label className="project-layer__style">
                      Layer colour
                      <input
                        type="color"
                        value={layer.style.fillColor}
                        onChange={(event) =>
                          onStyle(layer.id, event.target.value)
                        }
                      />
                    </label>
                  ) : null}

                  {layer.kind === "graves" ? (
                    <>
                      <div
                        className="segmented"
                        role="group"
                        aria-label="Colour graves by"
                      >
                        {GRAVE_COLOR_MODES.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            className={`segmented__btn${graveColorMode === mode.id ? " is-active" : ""}`}
                            aria-pressed={graveColorMode === mode.id}
                            title={mode.hint}
                            onClick={() => onGraveColorModeChange(mode.id)}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>

                      {graveColorMode === "solid" ? (
                        <div
                          className="layer-panel__color-picker"
                          role="group"
                          aria-label="Grave colour"
                        >
                          {GRAVE_COLORS.map((color) => (
                            <button
                              key={color.id}
                              type="button"
                              className={`layer-panel__color-swatch${color.id === graveColorId ? " is-active" : ""}`}
                              style={{ background: color.fill }}
                              title={color.label}
                              aria-label={color.label}
                              aria-pressed={color.id === graveColorId}
                              onClick={() => onGraveColorChange(color.id)}
                            />
                          ))}
                        </div>
                      ) : null}

                      {graveColorMode === "occupancy" ? (
                        <>
                          <div
                            className="layer-panel__gradient-picker"
                            role="group"
                            aria-label="Occupancy gradient"
                          >
                            {OCCUPANCY_GRADIENTS.map((gradient) => (
                              <button
                                key={gradient.id}
                                type="button"
                                className={`layer-panel__gradient-swatch${occupancyGradientId === gradient.id ? " is-active" : ""}`}
                                style={{
                                  background: occupancyGradientCss(gradient.id),
                                }}
                                title={gradient.label}
                                aria-label={gradient.label}
                                aria-pressed={occupancyGradientId === gradient.id}
                                onClick={() =>
                                  onOccupancyGradientChange(gradient.id)
                                }
                              />
                            ))}
                          </div>
                          <ul
                            className="layer-panel__record-legend"
                            aria-label="Occupancy legend"
                          >
                            {legend.map((stop) => (
                              <li key={stop.id}>
                                <span
                                  className="layer-panel__swatch"
                                  style={{ background: stop.fill }}
                                  aria-hidden
                                />
                                <span>{stop.label}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      {graveColorMode === "status" ||
                      graveColorMode === "inspection" ? (
                        <ul
                          className="layer-panel__record-legend"
                          aria-label={
                            graveColorMode === "inspection"
                              ? "Inspection legend"
                              : "Status legend"
                          }
                        >
                          {legend.map((stop) => (
                            <li key={stop.id}>
                              <span
                                className="layer-panel__swatch"
                                style={{ background: stop.fill }}
                                aria-hidden
                              />
                              <span>{stop.label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="segmented" aria-label="Grave labels">
                        {GRAVE_LABEL_MODES.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            className={`segmented__btn${labelMode === mode.id ? " is-active" : ""}`}
                            aria-pressed={labelMode === mode.id}
                            onClick={() => onLabelMode(mode.id)}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      {flaggedCount ? (
                        <button
                          type="button"
                          className="layer-panel__flagged"
                          onClick={onClearFlagged}
                        >
                          <span className="dot is-error" aria-hidden />
                          {flaggedCount.toLocaleString()} highlighted · clear
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {layer.kind === "base" ? (
                    <ul
                      className="layer-panel__legend"
                      aria-label="Base surface classes"
                    >
                      {SURFACE_ORDER.map((surface) => (
                        <li key={surface}>
                          <button
                            type="button"
                            className={`layer-panel__legend-item${surfaceVisibility[surface] ? " is-on" : ""}`}
                            aria-pressed={surfaceVisibility[surface]}
                            onClick={() =>
                              onSurfaceVisibility({
                                ...surfaceVisibility,
                                [surface]: !surfaceVisibility[surface],
                              })
                            }
                          >
                            <span
                              className="layer-panel__swatch"
                              style={{
                                background: SURFACE_STYLE[surface].fill,
                              }}
                              aria-hidden
                            />
                            <span className="layer-panel__name">
                              {SURFACE_STYLE[surface].label}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!layers.length ? (
        <p className="tool-options__assign-empty">
          Create a point, line or polygon layer to begin mapping.
        </p>
      ) : null}
      <span className="sr-only" aria-hidden>
        Current grave colour {graveColor.label}
      </span>
    </section>
  );
}
