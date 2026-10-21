"use client";

/** Last-resort screen when the root layout itself fails: no providers, fonts or tokens exist. */
export function FatalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#141414",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#b3b3b3", marginBottom: 24 }}>Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#fff",
              color: "#000",
              border: 0,
              borderRadius: 4,
              padding: "12px 24px",
              fontWeight: 700,
              minHeight: 44,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
