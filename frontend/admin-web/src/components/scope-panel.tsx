import { useMemo } from "react";

interface Point {
  t: number | string;
  said: number;
  did: number;
}

interface ScopePanelProps {
  data: Point[];
  height?: number;
  className?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  markDivergences?: boolean;
  ambient?: boolean; // gently animate for login
  onPointClick?: (index: number) => void;
}

/**
 * The "scope panel" — dark inset chart panel with two traces (Said dim, Did solid blue/green)
 * and shaded gap between them. Used across dashboard, sessions rows (mini), and session detail.
 */
export function ScopePanel({
  data,
  height = 260,
  className = "",
  showGrid = true,
  showLabels = true,
  markDivergences = true,
  ambient = false,
  onPointClick,
}: ScopePanelProps) {
  const width = 1000; // viewBox width; scales via CSS
  const h = height;
  const padX = 24;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = h - padY * 2;

  const { saidPath, didPath, gapPath, divergences, avgGap } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    if (!safeData.length) {
      return {
        saidPath: "",
        didPath: "",
        gapPath: "",
        divergences: [] as { i: number; x: number; y: number; gap: number }[],
        avgGap: 0,
      };
    }
    const n = safeData.length;
    const denom = n > 1 ? n - 1 : 1;
    const xFor = (i: number) => padX + (i / denom) * innerW;
    const yFor = (v: number) => {
      const num = Number(v) || 0;
      return padY + (1 - Math.min(Math.max(num, 0), 100) / 100) * innerH;
    };

    let saidP = "";
    let didP = "";
    safeData.forEach((p, i) => {
      const x = xFor(i);
      const saidVal = Number(p.said) || 0;
      const didVal = Number(p.did) || 0;
      saidP += (i === 0 ? "M" : "L") + x + " " + yFor(saidVal) + " ";
      didP += (i === 0 ? "M" : "L") + x + " " + yFor(didVal) + " ";
    });

    // gap polygon (said upper - did lower, or reverse)
    let top = "";
    let bot = "";
    safeData.forEach((p, i) => {
      const x = xFor(i);
      const saidVal = Number(p.said) || 0;
      const didVal = Number(p.did) || 0;
      top += (i === 0 ? "M" : "L") + x + " " + yFor(Math.max(saidVal, didVal)) + " ";
    });
    for (let i = n - 1; i >= 0; i--) {
      const x = xFor(i);
      const saidVal = Number(safeData[i].said) || 0;
      const didVal = Number(safeData[i].did) || 0;
      bot += "L" + x + " " + yFor(Math.min(saidVal, didVal)) + " ";
    }
    const gapP = top + bot + "Z";

    const divs: { i: number; x: number; y: number; gap: number }[] = [];
    let totalGap = 0;
    safeData.forEach((p, i) => {
      const saidVal = Number(p.said) || 0;
      const didVal = Number(p.did) || 0;
      const gap = Math.abs(saidVal - didVal);
      totalGap += gap;
      if (gap >= 8) divs.push({ i, x: xFor(i), y: yFor(Math.min(saidVal, didVal)), gap });
    });
    return {
      saidPath: saidP,
      didPath: didP,
      gapPath: gapP,
      divergences: divs,
      avgGap: totalGap / n,
    };
  }, [data, innerW, innerH]);

  const isHealthy = avgGap < 6;
  const didColor = isHealthy ? "#17C964" : "#2F5CFF";

  return (
    <div
      className={`relative rounded-[10px] border border-[#232327] bg-[#0B0B0D] overflow-hidden ${className}`}
      style={{ height }}
    >
      {/* subtle grid overlay */}
      {showGrid && (
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, #EDEDEF 1px, transparent 1px), linear-gradient(to bottom, #EDEDEF 1px, transparent 1px)",
            backgroundSize: "40px 32px",
          }}
        />
      )}
      {/* scanline sheen */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.4) 0 1px, transparent 1px 3px)",
        }}
      />

      <svg
        viewBox={`0 0 ${width} ${h}`}
        preserveAspectRatio="none"
        className={`w-full h-full ${ambient ? "scope-ambient" : ""}`}
      >
        <defs>
          <linearGradient id="gapGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={didColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={didColor} stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* y-axis reference lines */}
        {[25, 50, 75].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={width - padX}
            y1={padY + (1 - v / 100) * innerH}
            y2={padY + (1 - v / 100) * innerH}
            stroke="#232327"
            strokeDasharray="3 5"
          />
        ))}

        {/* gap area */}
        <path d={gapPath} fill="url(#gapGrad)" />

        {/* said trace (dim) */}
        <path
          d={saidPath}
          stroke="#8B8B93"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
          opacity={0.9}
        />

        {/* did trace (bold) */}
        <path d={didPath} stroke={didColor} strokeWidth={2.25} fill="none" />

        {/* divergence markers */}
        {markDivergences &&
          divergences.map((d) => (
            <circle
              key={d.i}
              cx={d.x}
              cy={d.y}
              r={4}
              fill="#0B0B0D"
              stroke={d.gap > 14 ? "#E5484D" : "#F5A623"}
              strokeWidth={1.5}
              className={onPointClick ? "cursor-pointer" : ""}
              onClick={() => onPointClick?.(d.i)}
            />
          ))}
      </svg>

      {showLabels && (
        <div className="absolute top-2 left-3 right-3 flex justify-between items-center pointer-events-none">
          <div className="flex gap-4 text-[10px] uppercase tracking-[0.14em] font-mono text-[#8B8B93]">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-px border-t border-dashed border-[#8B8B93]" />
              said
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-[2px]" style={{ background: didColor }} />
              did
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#8B8B93] uppercase tracking-[0.14em]">
            avg gap {avgGap.toFixed(1)}
          </div>
        </div>
      )}

      {ambient && (
        <style>{`
          .scope-ambient path { animation: scopeDrift 8s ease-in-out infinite alternate; }
          @keyframes scopeDrift {
            0% { transform: translateY(0) }
            100% { transform: translateY(6px) }
          }
        `}</style>
      )}
    </div>
  );
}

/** Compact 2-line sparkline for table rows */
export function ScopeSpark({
  data,
  width = 88,
  height = 28,
}: {
  data: Point[];
  width?: number;
  height?: number;
}) {
  const safeData = Array.isArray(data) ? data : [];
  const n = safeData.length;
  if (!n) return null;
  const denom = n > 1 ? n - 1 : 1;
  const xFor = (i: number) => (i / denom) * (width - 4) + 2;
  const yFor = (v: number) => {
    const num = Number(v) || 0;
    return 2 + (1 - Math.min(Math.max(num, 0), 100) / 100) * (height - 4);
  };
  const avgGap = safeData.reduce((a, p) => a + Math.abs((Number(p.said) || 0) - (Number(p.did) || 0)), 0) / n;
  const didColor = avgGap < 6 ? "#17C964" : "#2F5CFF";
  let saidP = "";
  let didP = "";
  safeData.forEach((p, i) => {
    saidP += (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(p.said) + " ";
    didP += (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(p.did) + " ";
  });
  return (
    <svg width={width} height={height} className="rounded-sm bg-[#0B0B0D]">
      <path d={saidP} stroke="#8B8B93" strokeWidth={1} strokeDasharray="2 2" fill="none" />
      <path d={didP} stroke={didColor} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
