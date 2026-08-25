"use client";

import React, { useEffect, useState } from "react";

export default function HeaderStatus() {
  const [ingestionMode, setIngestionMode] = useState<string>("LIVE_STREAM");

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/system/status");
      if (res.ok) {
        const data = await res.json();
        const ingSvc = data.services?.find((s: any) => s.name === "ingestion_worker");
        if (ingSvc && ingSvc.mode) {
          setIngestionMode(ingSvc.mode === "STREAMING" ? "LIVE_STREAM" : ingSvc.mode);
        }
      }
    } catch {
      setIngestionMode("LIVE_STREAM");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "var(--text-secondary)" }}>
      <span>
        INGESTION: <strong style={{ color: "var(--accent-green)" }}>{ingestionMode}</strong>
      </span>
      {process.env.NODE_ENV !== "production" && (
        <span style={{ borderLeft: "1px solid var(--border-color)", paddingLeft: "16px" }}>
          GATEWAY: <strong className="font-mono">localhost:8000</strong>
        </span>
      )}
    </div>
  );
}
