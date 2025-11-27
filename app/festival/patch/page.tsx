"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<CanonicalChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingPatch, setLoadingPatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((ev) => ev.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    const loadBase = async () => {
      setLoadingBase(true);
      setError(null);

      const initialEventId = searchParams.get("eventId");

      const [
        { data: evData, error: evError },
        { data: catData, error: catError },
        { data: chData, error: chError },
      ] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, event_date")
          .order("event_date", { ascending: true })
          .order("inserted_at", { ascending: true }),
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

      if (evError) console.error("Events error:", evError);
      if (catError) console.error("Categories error:", catError);
      if (chError) console.error("Channels error:", chError);

      setEvents(evData ?? []);
      setCategories(catData ?? []);
      setChannels(chData ?? []);

      const fallbackEvent = evData?.find((ev) => ev.id === initialEventId) ?? evData?.[0];
      if (fallbackEvent) {
        setSelectedEventId(fallbackEvent.id);
        router.replace(`/festival/patch?eventId=${fallbackEvent.id}`);
        await loadPatchChannels(fallbackEvent.id);
      }

      if (!fallbackEvent) {
        setSelectedChannelIds(new Set());
      }

      setLoadingBase(false);
    };

    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPatchChannels = async (eventId: string) => {
    setLoadingPatch(true);
    const { data: patchData, error: patchError } = await supabase
      .from("patch_channels")
      .select("canonical_channel_id")
      .eq("event_id", eventId)
      .order("channel_number", { ascending: true });

    if (patchError) {
      console.error("Patch channels error:", patchError);
      setError("Fout bij laden van festivalpatch.");
      setSelectedChannelIds(new Set());
    } else {
      const ids = (patchData ?? [])
        .map((row) => row.canonical_channel_id)
        .filter(Boolean) as string[];
      setSelectedChannelIds(new Set(ids));
    }
    setLoadingPatch(false);
  };

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
    if (!selectedEvent) return;
    if (selectedChannelIds.size === 0) {
      setSaveMessage("Geen kanalen geselecteerd om op te slaan.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setError(null);

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
      const { error: delError } = await supabase
        .from("patch_channels")
        .delete()
        .eq("event_id", selectedEvent.id);

      if (delError) {
        console.error("Delete error:", delError);
        setSaveMessage("Fout bij verwijderen oude patch.");
        setSaving(false);
        return;
      }

      const rows = selectedChannelsSorted.map((ch, index) => ({
        event_id: selectedEvent.id,
        channel_number: index + 1,
        canonical_channel_id: ch.id,
        custom_name: null,
        notes: null,
      }));

      const { error: insError } = await supabase.from("patch_channels").insert(rows);

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

  const selectedChannelsSorted = useMemo(() => {
    const categoryOrderMap = new Map<string, number>();
    categories.forEach((cat) => {
      categoryOrderMap.set(cat.id, cat.sort_order);
    });

    return channels
      .filter((ch) => selectedChannelIds.has(ch.id))
      .sort((a, b) => {
        const catA = a.category_id ? categoryOrderMap.get(a.category_id) ?? 9999 : 9999;
        const catB = b.category_id ? categoryOrderMap.get(b.category_id) ?? 9999 : 9999;
        if (catA !== catB) return catA - catB;
        return a.default_order - b.default_order;
      });
  }, [categories, channels, selectedChannelIds]);

  if (loadingBase) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (events.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        Geen events. Maak er eerst één aan op de startpagina.
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Festivalpatch</h1>
      <div style={{ margin: "8px 0 16px" }}>
        <a
          href="/"
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #fff",
            textDecoration: "none",
          }}
        >
          ← Terug naar start
        </a>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <label htmlFor="event-select" style={{ fontWeight: 600 }}>
          Event:
        </label>
        <select
          id="event-select"
          value={selectedEventId ?? ""}
          onChange={async (e) => {
            const nextId = e.target.value;
            setSelectedEventId(nextId);
            setSaveMessage(null);
            router.replace(`/festival/patch?eventId=${nextId}`);
            await loadPatchChannels(nextId);
          }}
          disabled={loadingPatch}
          style={{ padding: "6px 8px", borderRadius: 4 }}
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        {selectedEvent && (
          <span style={{ color: "#aaa" }}>Datum: {selectedEvent.event_date ?? "n/a"}</span>
        )}
      </div>

      {error && <p style={{ color: "#f88" }}>{error}</p>}

      {loadingPatch ? (
        <p>Festivalpatch laden…</p>
      ) : (
        <>
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
                    saving || selectedChannelsSorted.length === 0 ? "not-allowed" : "pointer",
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
        </>
      )}
    </div>
  );
}
