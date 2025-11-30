"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
};

type CanonicalChannel = {
  id: string;
  name: string;
  default_order: number;
  category_id: string | null;
};

type PatchChannel = {
  id: string;
  channel_number: number;
  canonical_channel_id: string | null;
  canonical_channels?: {
    name: string | null;
  } | null;
};

type Band = {
  id: string;
  name: string;
  sort_order: number;
};

type BandChannelUsage = {
  id: string;
  band_id: string;
  patch_channel_id: string;
  is_used: boolean;
  label: string | null;
};

export default function FestivalBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [canonicalChannels, setCanonicalChannels] = useState<CanonicalChannel[]>([]);
  const [patchChannels, setPatchChannels] = useState<PatchChannel[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [usageMap, setUsageMap] = useState<Map<string, BandChannelUsage>>(new Map());

  const [newBandName, setNewBandName] = useState("");
  const [newBandSelection, setNewBandSelection] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [savingBand, setSavingBand] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [newChannelNames, setNewChannelNames] = useState<Record<string, string>>({});
  const [newChannelOrders, setNewChannelOrders] = useState<Record<string, string>>({});
  const [savingChannelCatId, setSavingChannelCatId] = useState<string | null>(null);
  const knownCategoryIdsRef = useRef<Set<string>>(new Set());

  const selectedEvent = useMemo(
    () => events.find((ev) => ev.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const usageKey = (bandId: string, patchChannelId: string) => `${bandId}-${patchChannelId}`;

  useEffect(() => {
    const loadBase = async () => {
      setLoading(true);
      setError(null);

      const initialEventId = searchParams.get("eventId");

      const [{ data: evData, error: evError }, { data: catData, error: catError }, { data: chData, error: chError }] =
        await Promise.all([
          supabase
            .from("events")
            .select("id, name, event_date")
            .order("event_date", { ascending: true })
            .order("inserted_at", { ascending: true }),
          supabase.from("categories").select("id, name, sort_order").order("sort_order", { ascending: true }),
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
      setCanonicalChannels(chData ?? []);

      const nextEvent = evData?.find((ev) => ev.id === initialEventId) ?? evData?.[0];
      if (nextEvent) {
        setSelectedEventId(nextEvent.id);
        router.replace(`/festival/builder?eventId=${nextEvent.id}`);
        await loadEventData(nextEvent.id);
      } else {
        setLoading(false);
      }
    };

    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // categorieën standaard dichtklappen (ook bij refresh/navigatie)
  useEffect(() => {
    if (categories.length === 0) return;
    const next = new Set<string>();
    categories.forEach((cat) => next.add(cat.id));
    setCollapsedCategories(next);
    knownCategoryIdsRef.current = next;
  }, [categories]);

  const loadEventData = async (eventId: string) => {
    setLoading(true);
    setError(null);
    setBands([]);
    setPatchChannels([]);
    setUsageMap(new Map());

    const [{ data: bandData, error: bandError }, { data: patchData, error: patchError }] = await Promise.all([
      supabase.from("bands").select("id, name, sort_order").eq("event_id", eventId).order("sort_order", { ascending: true }),
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

      if (usageError) console.error("Usage error:", usageError);

      const entries = new Map<string, BandChannelUsage>();
      (usageData ?? []).forEach((row) => {
        entries.set(usageKey(row.band_id, row.patch_channel_id), row);
      });
      setUsageMap(entries);

      // baseline = laatste band selectie
      const lastBand = [...bandData].sort((a, b) => a.sort_order - b.sort_order).slice(-1)[0];
      if (lastBand) {
        const patchToCanonical = new Map<string, string>();
        (patchData ?? []).forEach((p) => {
          if (p.canonical_channel_id) patchToCanonical.set(p.id, p.canonical_channel_id);
        });
        const selected = new Set<string>();
        (usageData ?? []).forEach((row) => {
          if (row.band_id === lastBand.id && row.is_used) {
            const canonicalId = patchToCanonical.get(row.patch_channel_id);
            if (canonicalId) selected.add(canonicalId);
          }
        });
        setNewBandSelection(selected);
      }
    } else {
      setNewBandSelection(new Set());
    }

    setLoading(false);
  };

  const sortedBands = useMemo(
    () => [...bands].sort((a, b) => a.sort_order - b.sort_order),
    [bands]
  );

  const categoryOrderValue = (name: string) => {
    const lower = name.toLowerCase();
    const orderMap: { tokens: string[]; weight: number }[] = [
      { tokens: ["drum", "drums"], weight: 0 },
      { tokens: ["perc", "percussion"], weight: 1 },
      { tokens: ["bass"], weight: 2 },
      { tokens: ["guitar", "gitaar"], weight: 3 },
      { tokens: ["keys", "key", "sample", "samples"], weight: 4 },
      { tokens: ["varia", "other", "overig"], weight: 5 },
      { tokens: ["vox", "vocal", "voice"], weight: 6 },
    ];
    for (const { tokens, weight } of orderMap) {
      if (tokens.some((t) => lower.includes(t))) return weight;
    }
    return 9999;
  };

  const canonicalOrder = useMemo(() => {
    const catOrder = new Map<string, number>();
    categories.forEach((c) => {
      catOrder.set(c.id, categoryOrderValue(c.name));
    });
    return (a: CanonicalChannel, b: CanonicalChannel) => {
      const ca = a.category_id ? catOrder.get(a.category_id) ?? 9999 : 9999;
      const cb = b.category_id ? catOrder.get(b.category_id) ?? 9999 : 9999;
      if (ca !== cb) return ca - cb;
      return a.default_order - b.default_order;
    };
  }, [categories]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = categoryOrderValue(a.name);
      const orderB = categoryOrderValue(b.name);
      if (orderA !== orderB) return orderA - orderB;
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    });
  }, [categories]);

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleNewSelection = (canonicalId: string) => {
    setNewBandSelection((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalId)) next.delete(canonicalId);
      else next.add(canonicalId);
      return next;
    });
  };

  const ensurePatchChannels = async (canonicalIds: string[]) => {
    const canonicalToPatch = new Map<string, PatchChannel>();
    patchChannels.forEach((p) => {
      if (p.canonical_channel_id) canonicalToPatch.set(p.canonical_channel_id, p);
    });

    const missing = canonicalIds.filter((id) => !canonicalToPatch.has(id));
    if (missing.length === 0) return canonicalToPatch;

    const maxNumber = patchChannels.reduce((acc, cur) => Math.max(acc, cur.channel_number), 0);
    const newRows = missing.map((id, idx) => ({
      event_id: selectedEventId!,
      channel_number: maxNumber + idx + 1,
      canonical_channel_id: id,
      custom_name: null,
      notes: null,
    }));

    const { data, error: insertError } = await supabase
      .from("patch_channels")
      .insert(newRows)
      .select("id, channel_number, canonical_channel_id");

    if (insertError) {
      console.error("Patch insert error:", insertError);
      setError("Fout bij opslaan van patch-kanalen.");
      return canonicalToPatch;
    }

    const canonicalMap = new Map<string, CanonicalChannel>();
    canonicalChannels.forEach((c) => canonicalMap.set(c.id, c));

    const appended: PatchChannel[] = (data ?? []).map((row) => {
      const name = canonicalMap.get(row.canonical_channel_id ?? "")?.name ?? null;
      return {
        id: row.id,
        channel_number: row.channel_number,
        canonical_channel_id: row.canonical_channel_id,
        canonical_channels: { name },
      };
    });

    const next = [...patchChannels, ...appended];
    setPatchChannels(next);
    appended.forEach((p) => {
      if (p.canonical_channel_id) canonicalToPatch.set(p.canonical_channel_id, p);
    });

    return canonicalToPatch;
  };

  const handleAddBand = async () => {
    if (!selectedEvent) return;
    if (newBandName.trim() === "") {
      setError("Geef een groepsnaam in.");
      return;
    }

    setSavingBand(true);
    setError(null);

    const canonicalIds = Array.from(newBandSelection);
    const canonicalToPatch = await ensurePatchChannels(canonicalIds);

    const { data: bandRow, error: bandInsertError } = await supabase
      .from("bands")
      .insert({
        event_id: selectedEvent.id,
        name: newBandName.trim(),
        sort_order: bands.length + 1,
      })
      .select()
      .single();

    if (bandInsertError || !bandRow) {
      console.error("Band insert error:", bandInsertError);
      setError("Fout bij opslaan van de groep.");
      setSavingBand(false);
      return;
    }

    const newBand: Band = {
      id: bandRow.id,
      name: bandRow.name,
      sort_order: bandRow.sort_order,
    };

    let insertedUsage: BandChannelUsage[] = [];
    if (canonicalIds.length > 0) {
      const canonicalMap = new Map<string, CanonicalChannel>();
      canonicalChannels.forEach((c) => canonicalMap.set(c.id, c));

      const usageRows = canonicalIds
        .map((cid) => {
          const patch = canonicalToPatch.get(cid);
          if (!patch) return null;
          return {
            band_id: newBand.id,
            patch_channel_id: patch.id,
            is_used: true,
            label: canonicalMap.get(cid)?.name ?? null,
          };
        })
        .filter(Boolean) as {
        band_id: string;
        patch_channel_id: string;
        is_used: boolean;
        label: string | null;
      }[];

      if (usageRows.length > 0) {
        const { data: usageInsertData, error: usageInsertError } = await supabase
          .from("band_channel_usage")
          .insert(usageRows)
          .select();

        if (usageInsertError) {
          console.error("Usage insert error:", usageInsertError);
          setError("Fout bij opslaan van de groep-kanalen.");
          setSavingBand(false);
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
    }

    setBands((prev) => [...prev, newBand]);
    setUsageMap((prev) => {
      const next = new Map(prev);
      insertedUsage.forEach((row) => {
        next.set(usageKey(row.band_id, row.patch_channel_id), row);
      });
      return next;
    });

    // refresh data so patch_channels and usage stay in sync (en baseline = laatste band)
    await loadEventData(selectedEvent.id);

    setNewBandName("");
    setSavingBand(false);
  };

  const handleAddChannel = async (categoryId: string) => {
    const name = (newChannelNames[categoryId] ?? "").trim();
    if (name === "") {
      setError("Geef een kanaalnaam in.");
      return;
    }

    setSavingChannelCatId(categoryId);
    setError(null);

    const maxOrder =
      canonicalChannels
        .filter((c) => c.category_id === categoryId)
        .reduce((acc, cur) => Math.max(acc, cur.default_order), 0) || 0;

    const orderInput = newChannelOrders[categoryId];
    const defaultOrder = orderInput && !Number.isNaN(Number(orderInput)) ? Number(orderInput) : maxOrder + 1;

    const { data, error: insertError } = await supabase
      .from("canonical_channels")
      .insert({
        name,
        category_id: categoryId,
        default_order: defaultOrder,
        is_active: true,
      })
      .select()
      .single();

    if (insertError || !data) {
      console.error("New channel error:", insertError);
      setError("Fout bij toevoegen van kanaal.");
      setSavingChannelCatId(null);
      return;
    }

    const newChannel: CanonicalChannel = {
      id: data.id,
      name: data.name,
      default_order: data.default_order,
      category_id: data.category_id,
    };

    setCanonicalChannels((prev) => [...prev, newChannel]);
    setNewChannelNames((prev) => ({ ...prev, [categoryId]: "" }));
    setNewChannelOrders((prev) => ({ ...prev, [categoryId]: "" }));
    setSavingChannelCatId(null);
  };

  const usedByBand = (bandId: string) => {
    const set = new Set<string>();
    patchChannels.forEach((p) => {
      const key = usageKey(bandId, p.id);
      const usage = usageMap.get(key);
      if (usage?.is_used) set.add(p.id);
    });
    return set;
  };

  const channelsUsedByAllBands = useMemo(() => {
    if (bands.length === 0) return new Set<string>();
    const sets = bands.map((b) => usedByBand(b.id));
    const allIds = new Set<string>();
    sets.forEach((s) => s.forEach((id) => allIds.add(id)));
    return allIds;
  }, [bands, usageMap, patchChannels]);

  const canonicalName = (patchChannel: PatchChannel) =>
    patchChannel.canonical_channels?.name ??
    canonicalChannels.find((c) => c.id === patchChannel.canonical_channel_id)?.name ??
    "Onbekend kanaal";

  const orderedCanonicalChannels = useMemo(
    () => [...canonicalChannels].sort(canonicalOrder),
    [canonicalChannels, canonicalOrder]
  );

  const patchChannelRows = useMemo(
    () => [...patchChannels].sort((a, b) => a.channel_number - b.channel_number),
    [patchChannels]
  );

  const applyChannelOrder = async (orderedIds: string[]) => {
    // twee-staps update om unieke constraint te vermijden
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("patch_channels").update({ channel_number: idx + 1000 }).eq("id", id)
      )
    );
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("patch_channels").update({ channel_number: idx + 1 }).eq("id", id)
      )
    );
  };

  const movePatchChannel = async (patchId: string, direction: -1 | 1) => {
    const rows = patchChannelRows;
    const idx = rows.findIndex((p) => p.id === patchId);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= rows.length) return;

    const newOrder = [...rows];
    const [item] = newOrder.splice(idx, 1);
    newOrder.splice(targetIdx, 0, item);

    const orderedIds = newOrder.map((p) => p.id);
    setPatchChannels(
      newOrder.map((p, i) => ({
        ...p,
        channel_number: i + 1,
      }))
    );

    await applyChannelOrder(orderedIds);
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading && !selectedEventId) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (events.length === 0) {
    return <div style={{ padding: 16 }}>Geen events gevonden. Ga naar / om er een aan te maken.</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-overview,
          #print-overview * {
            visibility: visible;
          }
          #print-overview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>
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
            router.replace(`/festival/builder?eventId=${nextId}`);
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
        {selectedEvent && <span style={{ color: "#aaa" }}>Datum: {selectedEvent.event_date ?? "n/a"}</span>}
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
          <h1 style={{ marginBottom: 4 }}>Matrix builder – {selectedEvent.name}</h1>
          <div style={{ color: "#ccc" }}>Vul per groep de kanalen in; eerdere keuzes blijven aangevinkt.</div>
        </div>
      )}

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
        <p style={{ color: "#aaa", marginBottom: 8 }}>
          Gebruik de kanalenlijst die je binnenkreeg. Vorige keuzes blijven aangevinkt; pas alleen de verschillen aan.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 8, marginBottom: 12, alignItems: "center" }}>
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
            disabled={savingBand}
          />
          <button
            onClick={handleAddBand}
            disabled={savingBand || newBandName.trim() === ""}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: savingBand ? "#444" : "#111",
              cursor: savingBand || newBandName.trim() === "" ? "not-allowed" : "pointer",
            }}
          >
            {savingBand ? "Opslaan…" : "Opslaan / volgende groep"}
          </button>
        </div>

        {orderedCanonicalChannels.length === 0 ? (
          <p>Geen kanalen beschikbaar.</p>
        ) : (
          sortedCategories.map((cat) => {
            const inCategory = orderedCanonicalChannels.filter((ch) => ch.category_id === cat.id);
            const collapsed = collapsedCategories.has(cat.id);

            return (
              <section key={cat.id} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                    borderBottom: "1px solid #444",
                    paddingBottom: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(cat.id)}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #555",
                        background: "#0f0f0f",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {collapsed ? "+" : "–"}
                    </button>
                    <h3 style={{ margin: 0 }}>{cat.name}</h3>
                  </div>
                </div>

                {!collapsed && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                      {inCategory.map((ch) => {
                        const checked = newBandSelection.has(ch.id);
                        return (
                          <label
                            key={ch.id}
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
                              onChange={() => toggleNewSelection(ch.id)}
                              disabled={savingBand}
                            />
                            <span>{ch.name}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        placeholder="Nieuw kanaal"
                        value={newChannelNames[cat.id] ?? ""}
                        onChange={(e) =>
                          setNewChannelNames((prev) => ({
                            ...prev,
                            [cat.id]: e.target.value,
                          }))
                        }
                        style={{
                          flex: "1 1 220px",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                        disabled={savingChannelCatId === cat.id}
                      />
                      <input
                        type="number"
                        placeholder="Volgorde (optioneel)"
                        value={newChannelOrders[cat.id] ?? ""}
                        onChange={(e) =>
                          setNewChannelOrders((prev) => ({
                            ...prev,
                            [cat.id]: e.target.value,
                          }))
                        }
                        style={{
                          width: 160,
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                        disabled={savingChannelCatId === cat.id}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddChannel(cat.id)}
                        disabled={savingChannelCatId === cat.id || (newChannelNames[cat.id] ?? "").trim() === ""}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #fff",
                          background: savingChannelCatId === cat.id ? "#444" : "#111",
                          cursor:
                            savingChannelCatId === cat.id || (newChannelNames[cat.id] ?? "").trim() === ""
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {savingChannelCatId === cat.id ? "Opslaan…" : "Kanaal toevoegen"}
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })
        )}
      </section>

      <section id="print-overview">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2>Overzicht – {selectedEvent?.name ?? "Event"}</h2>
          <button
            type="button"
            onClick={handlePrint}
            className="no-print"
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: "#111",
              cursor: "pointer",
            }}
          >
            Exporteer PDF
          </button>
        </div>
        {bands.length === 0 ? (
          <p>Nog geen groepen toegevoegd.</p>
        ) : patchChannels.length === 0 ? (
          <p>Er zijn nog geen patch-kanalen voor dit event.</p>
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
                      borderRight: "1px solid #999",
                      padding: "10px 8px",
                      width: 100,
                      fontWeight: 700,
                    }}
                  >
                    Ch / volgorde
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #999",
                      borderRight: "1px solid #999",
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
                        borderRight: "1px solid #999",
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
                {patchChannelRows.map((patchChannel, index) => {
                  const inPatch = channelsUsedByAllBands.has(patchChannel.id);
                  return (
                    <tr key={patchChannel.id} style={{ background: index % 2 === 0 ? "#0f0f0f" : "#141414" }}>
                      <td
                        style={{
                          padding: "8px 8px",
                          borderBottom: "1px solid #333",
                          borderRight: "1px solid #333",
                          color: "#aaa",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ minWidth: 24, textAlign: "right" }}>{patchChannel.channel_number}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => movePatchChannel(patchChannel.id, -1)}
                            className="no-print"
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "1px solid #555",
                              background: "#0f0f0f",
                              color: "#fff",
                              cursor: index === 0 ? "not-allowed" : "pointer",
                              opacity: index === 0 ? 0.4 : 1,
                            }}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => movePatchChannel(patchChannel.id, 1)}
                            className="no-print"
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "1px solid #555",
                              background: "#0f0f0f",
                              color: "#fff",
                              cursor: index === patchChannelRows.length - 1 ? "not-allowed" : "pointer",
                              opacity: index === patchChannelRows.length - 1 ? 0.4 : 1,
                            }}
                            disabled={index === patchChannelRows.length - 1}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          borderBottom: "1px solid #333",
                          borderRight: "1px solid #333",
                        }}
                      >
                        {inPatch ? canonicalName(patchChannel) : "×"}
                      </td>
                      {sortedBands.map((band) => {
                        const key = usageKey(band.id, patchChannel.id);
                        const usage = usageMap.get(key);
                        const isUsed = usage?.is_used ?? false;
                        const label = usage?.label ?? canonicalName(patchChannel);
                        return (
                          <td
                            key={band.id}
                            style={{
                              padding: "10px 8px",
                              borderBottom: "1px solid #333",
                              borderRight: "1px solid #333",
                              textAlign: "center",
                              background: isUsed ? "#e5f2ff" : "transparent",
                              color: isUsed ? "#0d2c46" : "#666",
                              fontWeight: isUsed ? 600 : 400,
                            }}
                          >
                            {isUsed ? label : "×"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
