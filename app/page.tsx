import { createClient } from "./utils/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        background:
          "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(226,232,240,1) 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "40rem",
          padding: "2rem",
          borderRadius: "1rem",
          background: "#ffffff",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
        }}
      >
        <p style={{ margin: 0, color: "#475569", fontSize: "0.875rem" }}>
          Supabase session bootstrap
        </p>
        <h1 style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          KaloriFit auth is connected
        </h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>
          {user
            ? `Signed in as ${user.email ?? user.id}.`
            : "No active session found yet. Middleware and helper clients are ready."}
        </p>
      </div>
    </main>
  );
}
