"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

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

    router.push(`/festival/builder?eventId=${data.id}`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Nieuw event</h1>
        <p style={{ marginBottom: 12 }}>
          Vul titel en datum in. Na opslaan ga je rechtstreeks naar de builder om de kanalen te kiezen.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #555",
            background: "#0f0f0f",
            cursor: "pointer",
          }}
        >
          ← Terug naar overzicht
        </button>
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

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Titel"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: "1 1 280px",
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
    </div>
  );
}
