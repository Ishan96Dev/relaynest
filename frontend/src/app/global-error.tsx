"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#08081A", color: "#F8F8FF", fontFamily: "system-ui, sans-serif", padding: "24px" }}>
        <div style={{ maxWidth: 460, textAlign: "center", background: "#141232", border: "1px solid #2C2860", borderRadius: 20, padding: "36px 28px" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: "#F87171", textTransform: "uppercase" }}>Critical Error</p>
          <h1 style={{ margin: "10px 0 8px", fontSize: 26 }}>RelayNest encountered an error</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#A6A3C8" }}>{error.message || "Unexpected runtime error."}</p>
          <button type="button" onClick={reset} style={{ padding: "10px 20px", borderRadius: 10, border: 0, background: "#6C47FF", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Reload Page
          </button>
        </div>
      </body>
    </html>
  );
}
