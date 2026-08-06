"use client";

import NumberingFields from "@/components/panels/NumberingFields";
import type { RowParams } from "@/lib/tools";

const TEMPLATES: Record<RowParams["template"], [number, number] | null> = {
  adult: [2.4, 1.2],
  child: [1.5, 0.75],
  cremation: [0.6, 0.6],
  double: [2.4, 2.4],
  custom: null,
};

type RowParamsPanelProps = {
  params: RowParams;
  onChange: (params: RowParams) => void;
  /** Count rows ask for a plot count; fixed-size rows ask for a plot length. */
  mode: "count" | "size";
  canMatchSelected: boolean;
};

export default function RowParamsPanel({
  params,
  onChange,
  mode,
  canMatchSelected,
}: RowParamsPanelProps) {
  const set = (patch: Partial<RowParams>) => onChange({ ...params, ...patch });

  return (
    <div className="tool-options__form">
      <label>
        Grave template
        <select
          value={params.template}
          onChange={(event) => {
            const template = event.target.value as RowParams["template"];
            const dimensions = TEMPLATES[template];
            set(
              dimensions
                ? { template, along: dimensions[0], depth: dimensions[1] }
                : { template },
            );
          }}
        >
          <option value="adult">Adult grave (2.4 × 1.2 m)</option>
          <option value="child">Child grave (1.5 × 0.75 m)</option>
          <option value="cremation">Cremation plot (0.6 × 0.6 m)</option>
          <option value="double">Double grave (2.4 × 2.4 m)</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <div className="tool-options__inline-fields">
        {mode === "count" ? (
          <label>
            Count
            <input
              type="number"
              min={1}
              value={params.count}
              onChange={(event) =>
                set({ count: Number(event.target.value) || 1 })
              }
            />
          </label>
        ) : (
          <label>
            Length (m)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={params.along}
              onChange={(event) =>
                set({ along: Number(event.target.value) || 0.1 })
              }
            />
          </label>
        )}
        <label>
          Depth (m)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={params.depth}
            onChange={(event) =>
              set({ depth: Number(event.target.value) || 0.1 })
            }
          />
        </label>
      </div>

      <div className="tool-options__inline-fields">
        <label>
          Gap (m)
          <input
            type="number"
            min={0}
            step={0.05}
            value={params.gap}
            onChange={(event) => set({ gap: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          Setback (m)
          <input
            type="number"
            min={0}
            step={0.05}
            value={params.offset}
            onChange={(event) =>
              set({ offset: Number(event.target.value) || 0 })
            }
          />
        </label>
      </div>

      <label>
        Placement
        <select
          value={params.placement}
          onChange={(event) =>
            set({ placement: event.target.value as RowParams["placement"] })
          }
        >
          <option value="center">Centre on the line</option>
          <option value="left">Left of the line</option>
          <option value="right">Right of the line</option>
          <option value="both">Both sides</option>
        </select>
      </label>

      <label>
        Alignment
        <select
          value={params.alignment}
          onChange={(event) =>
            set({ alignment: event.target.value as RowParams["alignment"] })
          }
        >
          <option value="path">Follow centre-line</option>
          <option value="bearing">Fixed bearing</option>
          <option value="selected" disabled={!canMatchSelected}>
            Match selected grave edge
          </option>
        </select>
      </label>

      {params.alignment === "bearing" ? (
        <label>
          Bearing from north
          <input
            type="number"
            min={0}
            max={359.99}
            step={0.5}
            value={params.bearing}
            onChange={(event) =>
              set({ bearing: Number(event.target.value) || 0 })
            }
          />
        </label>
      ) : null}

      <label>
        Smoothing
        <input
          type="number"
          min={0}
          max={10}
          value={params.smoothing}
          onChange={(event) =>
            set({ smoothing: Number(event.target.value) || 0 })
          }
        />
      </label>

      <label className="tool-options__check">
        <input
          type="checkbox"
          checked={params.excludeObstacles}
          onChange={(event) => set({ excludeObstacles: event.target.checked })}
        />
        Skip graves that touch buildings or flower beds
      </label>

      <NumberingFields
        autoNumber={params.autoNumber}
        numberField={params.numberField}
        numberStart={params.numberStart}
        numberPattern={params.numberPattern}
        attributes={params.attributes}
        onChange={set}
      />
    </div>
  );
}
