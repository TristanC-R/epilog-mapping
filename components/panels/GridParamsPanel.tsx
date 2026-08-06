"use client";

import NumberingFields from "@/components/panels/NumberingFields";
import type { GridParams } from "@/lib/tools";

type GridParamsPanelProps = {
  params: GridParams;
  onChange: (params: GridParams) => void;
};

export default function GridParamsPanel({
  params,
  onChange,
}: GridParamsPanelProps) {
  const set = (patch: Partial<GridParams>) => onChange({ ...params, ...patch });

  return (
    <div className="tool-options__form">
      <div className="tool-options__inline-fields">
        <label>
          Count
          <input
            type="number"
            min={1}
            value={params.count}
            onChange={(event) => set({ count: Number(event.target.value) || 1 })}
          />
        </label>
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
      </div>

      <div className="tool-options__inline-fields">
        <label>
          Length (m)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={params.along}
            disabled={params.lockRatio}
            onChange={(event) =>
              set({ along: Number(event.target.value) || 0.1 })
            }
          />
        </label>
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

      <label className="tool-options__check">
        <input
          type="checkbox"
          checked={params.lockRatio}
          onChange={(event) => set({ lockRatio: event.target.checked })}
        />
        Lock 2:1 ratio
      </label>
      <label className="tool-options__check">
        <input
          type="checkbox"
          checked={params.adaptive}
          onChange={(event) => set({ adaptive: event.target.checked })}
        />
        Adaptive fit to the boundary
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
