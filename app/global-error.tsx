"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#050b24", color: "#dce8ff", font: "15px/1.5 system-ui, sans-serif" }}>
        <title>Base World · Error</title>
        <main style={{ width: "min(560px, 100%)" }}>
          <h1 style={{ margin: "0 0 8px", color: "#fff", fontSize: 22 }}>Something broke</h1>
          <pre style={{ margin: "0 0 16px", padding: 12, borderRadius: 10, background: "rgba(255,107,107,0.12)", color: "#ff9a9a", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
            {error.message || "Unknown error"}
            {error.digest ? `\ndigest: ${error.digest}` : ""}
            {error.stack ? `\n\n${error.stack.split("\n").slice(1, 6).join("\n")}` : ""}
          </pre>
          <button onClick={() => retry()} style={{ marginRight: 8, padding: "8px 14px", border: 0, borderRadius: 8, background: "#0052ff", color: "#fff", font: "inherit", cursor: "pointer" }}>
            Try again
          </button>
          <a href="/" style={{ color: "#8ea3d6" }}>
            Back to menu
          </a>
        </main>
      </body>
    </html>
  );
}
