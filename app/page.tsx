"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  name: string;
  event_date: string | null;
  inserted_at?: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const filterDateRef = useRef<HTMLInputElement>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error: evError } = await supabase
        .from("events")
        .select("id, name, event_date, inserted_at")
        .order("inserted_at", { ascending: false })
        .order("event_date", { ascending: false });

      if (evError) {
        console.error("Events error:", evError);
        setError("Fout bij laden van events.");
      } else {
        setEvents(data ?? []);
      }
      setLoading(false);
    };

    load();
  }, []);

  const handleCreate = async () => {
    if (name.trim() === "") {
      setError("Titel is verplicht.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        name: name.trim(),
        event_date: date || null,
      })
      .select()
      .single();

    if (insertError || !data) {
      console.error("Insert error:", insertError);
      setError("Fout bij aanmaken event.");
      setSaving(false);
      return;
    }

    setEvents((prev) => [...prev, data]);
    setSaving(false);
    setName("");
    setDate("");
    router.push(`/festival/builder?eventId=${data.id}`);
  };

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

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Festivalpatch setup</h1>
      <p style={{ marginBottom: 8 }}>
        1) Maak een event aan. 2) Gebruik de builder om per band de kanalen te kiezen (baselines
        blijven aangevinkt). De builder vervangt de losse patch- en matrixpagina.
      </p>
      <p style={{ marginBottom: 24 }}>
        Standaardkanalen beheren? Ga naar <a href="/admin/channels">/admin/channels</a>.
      </p>
      <div style={{ marginBottom: 24 }}>
        <a
          href="/admin/channels"
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #fff",
            textDecoration: "none",
          }}
        >
          → Beheer standaardkanalen
        </a>
      </div>
      <div style={{ marginBottom: 24 }}>
        <a
          href="/techlist"
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #fff",
            textDecoration: "none",
          }}
        >
          → Tech-fiche kanalenlijst
        </a>
      </div>

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

      <section style={{ marginBottom: 32 }}>
        <h2>Nieuw event</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Titel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: "1 1 260px",
              padding: "10px 12px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={saving}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={saving}
            ref={dateInputRef}
          />
          <button
            type="button"
            onClick={() => {
              const node = dateInputRef.current;
              if (!node) return;
              if (typeof (node as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
                (node as HTMLInputElement & { showPicker?: () => void }).showPicker();
              } else {
                node.focus();
              }
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#0f0f0f",
              color: "#fff",
              cursor: "pointer",
            }}
            disabled={saving}
          >
            Datum kiezen
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: saving ? "#444" : "#111",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Opslaan…" : "Event aanmaken"}
          </button>
        </div>
      </section>

      <section>
        <h2>Bestaande events</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Zoek op naam"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: "1 1 220px",
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
              Reset datum
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
                }}
                onClick={() => router.push(`/festival/builder?eventId=${ev.id}`)}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{ev.name}</div>
                  <div style={{ color: "#aaa", fontSize: 13 }}>
                    Datum: {ev.event_date ?? "n/a"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#bbb", fontSize: 13 }}>Open builder →</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEvent(ev.id);
                    }}
                    disabled={deletingEventId === ev.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #d9534f",
                      background: "#2a0f0f",
                      color: "#f5c6cb",
                      cursor: deletingEventId === ev.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingEventId === ev.id ? "Verwijderen…" : "Event verwijderen"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
