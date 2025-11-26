"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  name: string;
  event_date: string | null;
};

type Category = {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
};

type CanonicalChannel = {
  id: string;
  name: string;
  default_order: number;
  category_id: string | null;
};

export default function FestivalPatchPage() {
const [event, setEvent] = useState<Event | null>(null);
const [categories, setCategories] = useState<Category[]>([]);
const [channels, setChannels] = useState<CanonicalChannel[]>([]);
const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
  () => new Set()
);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      // 1) pak voorlopig gewoon het eerste event
      const { data: evData, error: evError } = await supabase
        .from("events")
        .select("id, name, event_date")
        .order("inserted_at", { ascending: true })
        .limit(1);

      if (evError) {
        console.error("Events error:", evError);
        setLoading(false);
        return;
      }

      const currentEvent = evData?.[0] ?? null;
      setEvent(currentEvent);

      // 2) categories + channels
      const [{ data: catData, error: catError }, { data: chData, error: chError }] =
        await Promise.all([
          supabase
            .from("categories")
            .select("id, name, sort_order, color")
            .order("sort_order", { ascending: true }),
          supabase
            .from("canonical_channels")
            .select("id, name, default_order, category_id")
            .eq("is_active", true)
            .order("default_order", { ascending: true }),
        ]);

      if (catError) console.error("Categories error:", catError);
      if (chError) console.error("Channels error:", chError);

      setCategories(catData ?? []);
      setChannels(chData ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const toggleChannel = (id: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

    const handleSavePatch = async () => {
    if (!event) return;
    if (selectedChannelIds.size === 0) {
      setSaveMessage("Geen kanalen geselecteerd om op te slaan.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    // zelfde sortering als in de preview
    const categoryOrderMap = new Map<string, number>();
    categories.forEach((cat) => {
      categoryOrderMap.set(cat.id, cat.sort_order);
    });

    const selectedChannelsSorted = channels
      .filter((ch) => selectedChannelIds.has(ch.id))
      .sort((a, b) => {
        const catA = a.category_id ? categoryOrderMap.get(a.category_id) ?? 9999 : 9999;
        const catB = b.category_id ? categoryOrderMap.get(b.category_id) ?? 9999 : 9999;

        if (catA !== catB) return catA - catB;
        return a.default_order - b.default_order;
      });

    try {
      // 1) bestaande patch_channels voor dit event wegdoen
      const { error: delError } = await supabase
        .from("patch_channels")
        .delete()
        .eq("event_id", event.id);

      if (delError) {
        console.error("Delete error:", delError);
        setSaveMessage("Fout bij verwijderen oude patch.");
        setSaving(false);
        return;
      }

      // 2) nieuwe rows inserten
      const rows = selectedChannelsSorted.map((ch, index) => ({
        event_id: event.id,
        channel_number: index + 1,
        canonical_channel_id: ch.id,
        custom_name: null,
        notes: null,
      }));

      const { error: insError } = await supabase
        .from("patch_channels")
        .insert(rows);

      if (insError) {
        console.error("Insert error:", insError);
        setSaveMessage("Fout bij opslaan van de nieuwe patch.");
      } else {
        setSaveMessage("Festivalpatch opgeslagen.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (!event) {
    return <div style={{ padding: 16 }}>Geen event gevonden.</div>;
  }

    if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (!event) {
    return <div style={{ padding: 16 }}>Geen event gevonden.</div>;
  }

  // 👉 helper: categorie-sortorder voor de sort-functie
  const categoryOrderMap = new Map<string, number>();
  categories.forEach((cat) => {
    categoryOrderMap.set(cat.id, cat.sort_order);
  });

  // 👉 geselecteerde kanalen sorteren op category.sort_order + default_order
  const selectedChannelsSorted = channels
    .filter((ch) => selectedChannelIds.has(ch.id))
    .sort((a, b) => {
      const catA = a.category_id ? categoryOrderMap.get(a.category_id) ?? 9999 : 9999;
      const catB = b.category_id ? categoryOrderMap.get(b.category_id) ?? 9999 : 9999;

      if (catA !== catB) return catA - catB;
      return a.default_order - b.default_order;
    });

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Festivalpatch – {event.name}</h1>
      <p style={{ marginBottom: 24 }}>Datum: {event.event_date ?? "n/a"}</p>

      {/* ====== CHECKBOXEN PER CATEGORIE ====== */}
      {categories.map((cat) => {
        const inCategory = channels.filter((ch) => ch.category_id === cat.id);
        if (inCategory.length === 0) return null;

        return (
          <section key={cat.id} style={{ marginBottom: 24 }}>
            <h2
              style={{
                marginBottom: 8,
                borderBottom: "1px solid #444",
                paddingBottom: 4,
              }}
            >
              {cat.name}
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {inCategory.map((ch) => {
                const checked = selectedChannelIds.has(ch.id);
                return (
                  <label
                    key={ch.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: checked ? "1px solid #fff" : "1px solid #555",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(ch.id)}
                    />
                    <span>{ch.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* ====== TABEL MET FESTIVALPATCH ====== */}
           <section style={{ marginTop: 32 }}>
        <h2>Festivalpatch preview</h2>

        <div style={{ marginTop: 8, marginBottom: 12, display: "flex", gap: 12 }}>
          <button
            onClick={handleSavePatch}
            disabled={saving || selectedChannelsSorted.length === 0}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: saving ? "#444" : "#111",
              cursor:
                saving || selectedChannelsSorted.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving ? "Opslaan..." : "Opslaan als festivalpatch"}
          </button>
          {saveMessage && <span>{saveMessage}</span>}
        </div>

        {selectedChannelsSorted.length === 0 ? (
          <p>Nog geen kanalen geselecteerd.</p>
        ) : (
          <table
            style={{
              marginTop: 8,
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #444",
                    padding: "4px 8px",
                  }}
                >
                  Ch
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #444",
                    padding: "4px 8px",
                  }}
                >
                  Kanaal
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedChannelsSorted.map((ch, index) => (
                <tr key={ch.id}>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderBottom: "1px solid #333",
                      width: 60,
                    }}
                  >
                    {index + 1}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderBottom: "1px solid #333",
                    }}
                  >
                    {ch.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}