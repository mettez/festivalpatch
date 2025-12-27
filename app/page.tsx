"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  name: string;
  event_date: string | null;
  inserted_at?: string | null;
};

type Techlist = {
  id: string;
  name: string;
  created_at: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [techlists, setTechlists] = useState<Techlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const filterDateRef = useRef<HTMLInputElement>(null);
  const [techlistSearch, setTechlistSearch] = useState("");
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const [
        { data: evData, error: evError },
        { data: tlData, error: tlError },
      ] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, event_date, inserted_at")
          .order("inserted_at", { ascending: false })
          .order("event_date", { ascending: false }),
        supabase.from("techlists").select("id, name, created_at").order("created_at", { ascending: false }),
      ]);

      if (evError) {
        console.error("Events error:", evError);
      } else if (evData) {
        setEvents(evData);
      }

      if (tlError) {
        console.error("Techlists error:", tlError);
      } else if (tlData) {
        setTechlists(tlData);
      }

      if (evError || tlError) {
        setError("Fout bij laden van data.");
      }

      setLoading(false);
    };

    load();
  }, []);

  const filteredEvents = events
    .filter((ev) => {
      const matchName =
        searchTerm.trim() === "" ||
        ev.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const matchDate = filterDate === "" || ev.event_date === filterDate;
      return matchName && matchDate;
    })
    .sort((a, b) => {
      const aDate = a.inserted_at ? new Date(a.inserted_at).getTime() : 0;
      const bDate = b.inserted_at ? new Date(b.inserted_at).getTime() : 0;
      return bDate - aDate;
    });

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm("Event verwijderen? Dit kan niet ongedaan gemaakt worden.")) return;
    setDeletingEventId(id);
    setError(null);

    const { error: delError } = await supabase.from("events").delete().eq("id", id);
    if (delError) {
      console.error("Delete event error:", delError);
      setError("Fout bij verwijderen van event.");
      setDeletingEventId(null);
      return;
    }

    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setDeletingEventId(null);
  };

  const filteredTechlists = techlists.filter((tl) => {
    const matchName = techlistSearch.trim() === "" || tl.name.toLowerCase().includes(techlistSearch.trim().toLowerCase());
    return matchName;
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Festivalpatch setup</h1>
      </header>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "8px 12px",
            border: "1px solid #d9534f",
            borderRadius: 4,
            color: "#f5c6cb",
            background: "#3b1f1f",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 24 }}>
        <section style={{ flex: "1 1 420px", minWidth: 320, background: "#0c0c0c", padding: 16, borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Events</h2>
            <button
              type="button"
              onClick={() => router.push("/festival/new")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #555",
                background: "#0f0f0f",
                cursor: "pointer",
              }}
            >
              Nieuw event
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Zoek op naam"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: "1 1 200px",
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid #444",
                background: "#0f0f0f",
                color: "#fff",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#0f0f0f",
                  color: "#fff",
                }}
                ref={filterDateRef}
              />
              <button
                type="button"
                onClick={() => {
                  const node = filterDateRef.current;
                  if (!node) return;
                  if (typeof (node as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
                    (node as HTMLInputElement & { showPicker?: () => void }).showPicker();
                  } else {
                    node.focus();
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid #555",
                  background: "#0f0f0f",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Datum filter
              </button>
              <button
                type="button"
                onClick={() => setFilterDate("")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #555",
                  background: "#0f0f0f",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </div>
          {loading ? (
            <p>Loading…</p>
          ) : filteredEvents.length === 0 ? (
            <p>Geen events gevonden.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    border: "1px solid #333",
                    borderRadius: 6,
                    color: "inherit",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  onClick={() => {
                    router.push(`/festival/builder?eventId=${ev.id}`);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#121212";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#555";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#333";
                  }}
                >
                  <div />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{ev.name}</div>
                    <div style={{ color: "#aaa", fontSize: 13 }}>
                      Datum: {ev.event_date ?? "n/a"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Event verwijderen"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEvent(ev.id);
                    }}
                    disabled={deletingEventId === ev.id}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #d9534f",
                      background: "#2a0f0f",
                      color: "#f5c6cb",
                      cursor: deletingEventId === ev.id ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
                      <path d="M10 10v7" />
                      <path d="M14 10v7" />
                      <path d="M9 6 9.6 4.2A1 1 0 0 1 10.56 3.5h2.88a1 1 0 0 1 .96.7L15 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ flex: "1 1 420px", minWidth: 320, background: "#0c0c0c", padding: 16, borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Kanalenlijsten</h2>
            <button
              type="button"
              onClick={() => router.push("/techlist")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #555",
                background: "#0f0f0f",
                cursor: "pointer",
              }}
            >
              Nieuwe lijst
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Zoek op naam"
              value={techlistSearch}
              onChange={(e) => setTechlistSearch(e.target.value)}
              style={{
                flex: "1 1 200px",
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid #444",
                background: "#0f0f0f",
                color: "#fff",
              }}
            />
          </div>
          {loading ? (
            <p>Loading…</p>
          ) : filteredTechlists.length === 0 ? (
            <p>Geen kanalenlijsten gevonden.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredTechlists.map((tl) => (
                <div
                  key={tl.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    border: "1px solid #333",
                    borderRadius: 6,
                    color: "inherit",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "background 0.15s, border-color 0.15s",
                    background: "transparent",
                  }}
                  onClick={() => router.push(`/techlist?techlistId=${tl.id}`)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#121212";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#555";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#333";
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{tl.name}</div>
                    <div style={{ color: "#aaa", fontSize: 13 }}>
                      Laatst toegevoegd: {tl.created_at ? new Date(tl.created_at).toLocaleDateString() : "n/a"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Lijst verwijderen"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm("Kanalenlijst verwijderen?")) return;
                      setTechlists((prev) => prev.filter((item) => item.id !== tl.id));
                      supabase.from("techlists").delete().eq("id", tl.id);
                      supabase.from("techlist_channels").delete().eq("techlist_id", tl.id);
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #d9534f",
                      background: "#2a0f0f",
                      color: "#f5c6cb",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
                      <path d="M10 10v7" />
                      <path d="M14 10v7" />
                      <path d="M9 6 9.6 4.2A1 1 0 0 1 10.56 3.5h2.88a1 1 0 0 1 .96.7L15 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer style={{ marginTop: 12 }}>
        <a
          href="/admin/channels"
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #555",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Standaardkanalen beheren
        </a>
      </footer>
    </div>
  );
}
