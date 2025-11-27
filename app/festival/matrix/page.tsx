"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  name: string;
  event_date: string | null;
};

type Band = {
  id: string;
  name: string;
  sort_order: number;
};

type PatchChannel = {
  id: string;
  channel_number: number;
  canonical_channel_id: string | null;
  canonical_channels?: {
    name: string | null;
  } | null;
};

type BandChannelUsage = {
  id: string;
  band_id: string;
  patch_channel_id: string;
  is_used: boolean;
  label: string | null;
};

export default function FestivalMatrixPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [patchChannels, setPatchChannels] = useState<PatchChannel[]>([]);
  const [usageMap, setUsageMap] = useState<Map<string, BandChannelUsage>>(new Map());
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newBandName, setNewBandName] = useState("");
  const [newBandSelected, setNewBandSelected] = useState<Set<string>>(() => new Set());
  const [creatingBand, setCreatingBand] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((ev) => ev.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const usageKey = (bandId: string, patchChannelId: string) => `${bandId}-${patchChannelId}`;

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      setError(null);

      const initialEventId = searchParams.get("eventId");

      const { data: evData, error: evError } = await supabase
        .from("events")
        .select("id, name, event_date")
        .order("event_date", { ascending: true })
        .order("inserted_at", { ascending: true });

      if (evError) {
        console.error("Events error:", evError);
        setError("Fout bij ophalen van events.");
        setLoading(false);
        return;
      }

      setEvents(evData ?? []);

      const nextEvent = evData?.find((ev) => ev.id === initialEventId) ?? evData?.[0];
      if (nextEvent) {
        setSelectedEventId(nextEvent.id);
        router.replace(`/festival/matrix?eventId=${nextEvent.id}`);
        await loadEventData(nextEvent.id);
      } else {
        setLoading(false);
      }
    };

    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEventData = async (eventId: string) => {
    setLoading(true);
    setError(null);
    setBands([]);
    setPatchChannels([]);
    setUsageMap(new Map());
    setLabelDrafts({});

    const [
      { data: bandData, error: bandError },
      { data: patchData, error: patchError },
    ] = await Promise.all([
      supabase
        .from("bands")
        .select("id, name, sort_order")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("patch_channels")
        .select("id, channel_number, canonical_channel_id, canonical_channels(name)")
        .eq("event_id", eventId)
        .order("channel_number", { ascending: true }),
    ]);

    if (bandError) console.error("Bands error:", bandError);
    if (patchError) console.error("Patch channels error:", patchError);

    setBands(bandData ?? []);
    setPatchChannels(patchData ?? []);

    if (bandData && bandData.length > 0) {
      const bandIds = bandData.map((b) => b.id);
      const { data: usageData, error: usageError } = await supabase
        .from("band_channel_usage")
        .select("id, band_id, patch_channel_id, is_used, label")
        .in("band_id", bandIds);

      if (usageError) {
        console.error("Usage error:", usageError);
        setError("Fout bij ophalen van band_channel_usage.");
      }

      const usageEntries = new Map<string, BandChannelUsage>();
      (usageData ?? []).forEach((row) => {
        usageEntries.set(usageKey(row.band_id, row.patch_channel_id), row);
      });

      setUsageMap(usageEntries);
    }

    setLoading(false);
  };

  const sortedBands = useMemo(
    () => [...bands].sort((a, b) => a.sort_order - b.sort_order),
    [bands]
  );

  const getChannelName = (patchChannel: PatchChannel) =>
    patchChannel.canonical_channels?.name ?? "Onbekend kanaal";

  const toggleUsage = async (bandId: string, patchChannelId: string) => {
    if (!selectedEvent) return;

    const key = usageKey(bandId, patchChannelId);
    const current = usageMap.get(key);
    const nextUsed = !(current?.is_used ?? false);
    const defaultLabel = getChannelName(
      patchChannels.find((p) => p.id === patchChannelId) ?? ({} as PatchChannel)
    );

    setSavingCellKey(key);
    setEditingCellKey(null);
    setError(null);

    const payload = {
      band_id: bandId,
      patch_channel_id: patchChannelId,
      is_used: nextUsed,
      label: nextUsed ? current?.label ?? defaultLabel : current?.label ?? null,
    };

    const { data, error: upsertError } = await supabase
      .from("band_channel_usage")
      .upsert(payload, { onConflict: "band_id,patch_channel_id" })
      .select();

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      setError("Fout bij opslaan van de matrix.");
      setSavingCellKey(null);
      return;
    }

    const savedRow = Array.isArray(data) ? data[0] : data;
    const nextRow: BandChannelUsage = {
      id: savedRow?.id ?? current?.id ?? `${bandId}-${patchChannelId}`,
      band_id: bandId,
      patch_channel_id: patchChannelId,
      is_used: nextUsed,
      label: savedRow?.label ?? payload.label ?? null,
    };

    setUsageMap((prev) => {
      const next = new Map(prev);
      next.set(key, nextRow);
      return next;
    });

    setSavingCellKey(null);
  };

  const handleLabelBlur = async (
    bandId: string,
    patchChannelId: string,
    key: string,
    draftOverride?: string
  ) => {
    const usage = usageMap.get(key);
    if (!usage || !usage.is_used) {
      setEditingCellKey(null);
      return;
    }

    const draft = (draftOverride ?? labelDrafts[key] ?? usage.label ?? "").trim();
    if ((usage.label ?? "") === draft) {
      setEditingCellKey(null);
      return;
    }

    setSavingCellKey(key);
    setError(null);

    const { data, error: updateError } = await supabase
      .from("band_channel_usage")
      .update({ label: draft === "" ? null : draft })
      .eq("band_id", bandId)
      .eq("patch_channel_id", patchChannelId)
      .select();

    if (updateError) {
      console.error("Update label error:", updateError);
      setError("Fout bij opslaan van label.");
      setSavingCellKey(null);
      setEditingCellKey(null);
      return;
    }

    const savedRow = Array.isArray(data) ? data[0] : data;

    setUsageMap((prev) => {
      const next = new Map(prev);
      next.set(key, {
        ...(usage ?? savedRow),
        label: draft === "" ? null : draft,
      });
      return next;
    });

    setSavingCellKey(null);
    setEditingCellKey(null);
  };

  const startEditLabel = (
    bandId: string,
    patchChannelId: string,
    key: string,
    initialValue: string
  ) => {
    setEditingCellKey(key);
    setLabelDrafts((prev) => ({ ...prev, [key]: initialValue }));
  };

  const toggleNewBandChannel = (id: string) => {
    setNewBandSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateBand = async () => {
    if (!selectedEvent) return;
    const name = newBandName.trim();
    if (name === "") {
      setError("Geef een groepsnaam in.");
      return;
    }

    setCreatingBand(true);
    setError(null);

    const { data: bandRow, error: bandInsertError } = await supabase
      .from("bands")
      .insert({
        event_id: selectedEvent.id,
        name,
        sort_order: bands.length + 1,
      })
      .select()
      .single();

    if (bandInsertError || !bandRow) {
      console.error("Band insert error:", bandInsertError);
      setError("Fout bij opslaan van de groep.");
      setCreatingBand(false);
      return;
    }

    const newBand: Band = {
      id: bandRow.id,
      name: bandRow.name,
      sort_order: bandRow.sort_order,
    };

    const selectedIds = Array.from(newBandSelected);
    let insertedUsage: BandChannelUsage[] = [];

    if (selectedIds.length > 0) {
      const rows = selectedIds.map((chId) => ({
        band_id: newBand.id,
        patch_channel_id: chId,
        is_used: true,
        label: getChannelName(patchChannels.find((p) => p.id === chId) ?? ({} as PatchChannel)),
      }));

      const { data: usageInsertData, error: usageInsertError } = await supabase
        .from("band_channel_usage")
        .insert(rows)
        .select();

      if (usageInsertError) {
        console.error("Usage insert error:", usageInsertError);
        setError("Fout bij opslaan van de groep-kanalen.");
        setCreatingBand(false);
        return;
      }

      insertedUsage = (usageInsertData ?? []).map((row) => ({
        id: row.id,
        band_id: row.band_id,
        patch_channel_id: row.patch_channel_id,
        is_used: row.is_used,
        label: row.label,
      }));
    }

    setBands((prev) => [...prev, newBand]);
    setUsageMap((prev) => {
      const next = new Map(prev);
      insertedUsage.forEach((row) => {
        next.set(usageKey(row.band_id, row.patch_channel_id), row);
      });
      return next;
    });

    setNewBandName("");
    setNewBandSelected(new Set());
    setCreatingBand(false);
  };

  if (loading && !selectedEventId) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (events.length === 0) {
    return <div style={{ padding: 16 }}>Geen events gevonden. Maak er één aan op de startpagina.</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label htmlFor="event-select" style={{ fontWeight: 600 }}>
          Event:
        </label>
        <select
          id="event-select"
          value={selectedEventId ?? ""}
          onChange={async (e) => {
            const nextId = e.target.value;
            setSelectedEventId(nextId);
            router.replace(`/festival/matrix?eventId=${nextId}`);
            await loadEventData(nextId);
          }}
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

      <div style={{ margin: "0 0 16px" }}>
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

      {selectedEvent && (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ marginBottom: 4 }}>{selectedEvent.name}</h1>
          <div style={{ color: "#ccc" }}>Datum: {selectedEvent.event_date ?? "n/a"}</div>
        </div>
      )}

      <p style={{ marginBottom: 24 }}>
        Stap 1: Maak de festivalpatch op /festival/patch. Stap 2: voeg hieronder groepen toe
        en kies per groep welke patch-kanalen ze gebruiken. Matrix toont kanaalnummer, de
        festivalpatch en daarna een kolom per groep (naam bovenaan, instrument of "×" per cel).
        Dubbelklik op een actieve cel om het label te wijzigen; klikken togglet aan/uit.
      </p>

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
        <h2>Nieuwe groep toevoegen</h2>
        <div style={{ display: "flex", gap: 12, marginTop: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newBandName}
            placeholder="Groepsnaam"
            onChange={(e) => setNewBandName(e.target.value)}
            style={{
              flex: "0 0 260px",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={creatingBand}
          />
          <button
            onClick={handleCreateBand}
            disabled={creatingBand || newBandName.trim() === "" || !selectedEvent}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: creatingBand ? "#444" : "#111",
              cursor:
                creatingBand || newBandName.trim() === "" || !selectedEvent
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {creatingBand ? "Opslaan…" : "Groep toevoegen"}
          </button>
        </div>

        {patchChannels.length === 0 ? (
          <p>Geen festivalpatch gevonden. Maak die eerst aan op /festival/patch.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {patchChannels.map((patchChannel) => {
              const checked = newBandSelected.has(patchChannel.id);
              return (
                <label
                  key={patchChannel.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: checked ? "1px solid #fff" : "1px solid #555",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleNewBandChannel(patchChannel.id)}
                    disabled={creatingBand}
                  />
                  <span>
                    {patchChannel.channel_number}. {getChannelName(patchChannel)}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {patchChannels.length === 0 ? (
        <div>
          <p>Geen patch_channels gevonden voor dit event.</p>
          <p>Maak eerst een festivalpatch op /festival/patch.</p>
        </div>
      ) : bands.length === 0 ? (
        <p>Nog geen groepen toegevoegd.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: 700,
              border: "1px solid #999",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            <thead>
              <tr style={{ background: "#d2d2d2", color: "#111" }}>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #999",
                    padding: "10px 8px",
                    width: 60,
                    fontWeight: 700,
                  }}
                >
                  Ch
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #999",
                    padding: "10px 8px",
                    width: 220,
                    fontWeight: 700,
                  }}
                >
                  Festivalpatch
                </th>
                {sortedBands.map((band) => (
                  <th
                    key={band.id}
                    style={{
                      textAlign: "center",
                      borderBottom: "1px solid #999",
                      padding: "10px 8px",
                      fontWeight: 700,
                    }}
                  >
                    {band.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patchChannels.map((patchChannel, index) => (
                <tr key={patchChannel.id} style={{ background: index % 2 === 0 ? "#0f0f0f" : "#141414" }}>
                  <td
                    style={{
                      padding: "8px 8px",
                      borderBottom: "1px solid #333",
                      color: "#aaa",
                      fontWeight: 700,
                    }}
                  >
                    {patchChannel.channel_number}
                  </td>
                  <td
                    style={{
                      padding: "8px 8px",
                      borderBottom: "1px solid #333",
                    }}
                  >
                    {getChannelName(patchChannel)}
                  </td>
                  {sortedBands.map((band) => {
                    const key = usageKey(band.id, patchChannel.id);
                    const usage = usageMap.get(key);
                    const isUsed = usage?.is_used ?? false;
                    const defaultLabel = getChannelName(patchChannel);
                    const label = labelDrafts[key] ?? usage?.label ?? defaultLabel;
                    const saving = savingCellKey === key;
                    const isEditing = editingCellKey === key;

                    return (
                      <td
                        key={band.id}
                        style={{
                          padding: "0",
                          borderBottom: "1px solid #333",
                        }}
                      >
                        <div
                          role="button"
                          onClick={() => {
                            if (!isEditing) toggleUsage(band.id, patchChannel.id);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isUsed) {
                              startEditLabel(band.id, patchChannel.id, key, label);
                            }
                          }}
                          style={{
                            padding: "10px 8px",
                            minHeight: 46,
                            width: "100%",
                            textAlign: "center",
                            cursor: saving ? "not-allowed" : "pointer",
                            background: isUsed ? "#e5f2ff" : "#0f0f0f",
                            color: isUsed ? "#0d2c46" : "#666",
                            borderLeft: "1px solid #333",
                            borderRight: "1px solid #333",
                            fontWeight: isUsed ? 600 : 400,
                            userSelect: "none",
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={labelDrafts[key] ?? usage?.label ?? ""}
                              placeholder={defaultLabel}
                              onChange={(e) =>
                                setLabelDrafts((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              onBlur={() => handleLabelBlur(band.id, patchChannel.id, key)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                  setEditingCellKey(null);
                                  setLabelDrafts((prev) => ({ ...prev, [key]: usage?.label ?? "" }));
                                }
                              }}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                borderRadius: 4,
                                border: "1px solid #444",
                                background: "#0f0f0f",
                                color: "#fff",
                              }}
                              disabled={saving}
                            />
                          ) : (
                            <span>{isUsed ? label || defaultLabel : "×"}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
