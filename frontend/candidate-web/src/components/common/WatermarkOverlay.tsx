import { useEffect, useState } from "react";
import { useSessionStore } from "@/store/session.store";

export function WatermarkOverlay() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const candidateId = useSessionStore((s) => s.candidateId);
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    const updateTime = () => {
      setTimestamp(new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 999999,
        overflow: "hidden",
        opacity: 0.05,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignContent: "space-between",
        padding: "2rem",
      }}
    >
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          style={{
            transform: "rotate(-25deg)",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            margin: "4rem",
            color: "#000",
            userSelect: "none",
          }}
        >
          {candidateId || "Candidate"} | {sessionId.substring(0, 8)} | {timestamp}
        </div>
      ))}
    </div>
  );
}
