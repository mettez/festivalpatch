"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type Techlist = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string | null;
};

type TechlistChannel = {
  id: string;
  techlist_id: string;
  channel_number: number;
  canonical_channel_id: string;
  label: string | null;
  mic_or_di: string | null;
  stand: string | null;
  notes: string | null;
};

type ChannelDetails = {
  label: string;
  mic_or_di: string;
  stand: string;
  notes: string;
};

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

export default function TechListPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<CanonicalChannel[]>([]);
  const [techlists, setTechlists] = useState<Techlist[]>([]);
  const [selectedTechlistId, setSelectedTechlistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTechlist, setLoadingTechlist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bandName, setBandName] = useState("");
  const [bandNotes, setBandNotes] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(() => new Set());
  const [channelDetails, setChannelDetails] = useState<Record<string, ChannelDetails>>({});
  const [newChannelNames, setNewChannelNames] = useState<Record<string, string>>({});
  const [newChannelOrders, setNewChannelOrders] = useState<Record<string, string>>({});
  const [savingChannelCatId, setSavingChannelCatId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const knownCategoryIdsRef = useRef<Set<string>>(new Set());
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [{ data: catData, error: catError }, { data: chData, error: chError }, { data: techData, error: techError }] =
        await Promise.all([
          supabase.from("categories").select("id, name, sort_order"),
          supabase
            .from("canonical_channels")
            .select("id, name, default_order, category_id")
            .eq("is_active", true)
            .order("default_order", { ascending: true }),
          supabase
            .from("techlists")
            .select("id, name, notes, created_at")
            .order("created_at", { ascending: false }),
        ]);

      if (catError?.message) console.error("Categories error:", catError);
      if (chError?.message) console.error("Channels error:", chError);
      if (techError?.message) console.error("Techlists error:", techError);

      if (catData) setCategories(catData);
      if (chData) setChannels(chData);
      if (techData) setTechlists(techData);
      setLoading(false);
    };

    load();
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    const next = new Set<string>();
    categories.forEach((cat) => next.add(cat.id));
    setCollapsedCategories(next);
    knownCategoryIdsRef.current = next;
  }, [categories]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = categoryOrderValue(a.name);
      const orderB = categoryOrderValue(b.name);
      if (orderA !== orderB) return orderA - orderB;
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    });
  }, [categories]);

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

  const orderedChannels = useMemo(() => [...channels].sort(canonicalOrder), [channels, canonicalOrder]);

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleChannel = (id: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      channels.filter((c) => c.category_id === categoryId).reduce((acc, cur) => Math.max(acc, cur.default_order), 0) || 0;
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

    setChannels((prev) => [
      ...prev,
      {
        id: data.id,
        name: data.name,
        default_order: data.default_order,
        category_id: data.category_id,
      },
    ]);
    setNewChannelNames((prev) => ({ ...prev, [categoryId]: "" }));
    setNewChannelOrders((prev) => ({ ...prev, [categoryId]: "" }));
    setSavingChannelCatId(null);
  };

  const selectedChannelsSorted = useMemo(() => {
    return orderedChannels.filter((ch) => selectedChannelIds.has(ch.id));
  }, [orderedChannels, selectedChannelIds]);

  const copyToClipboard = async () => {
    const lines = selectedChannelsSorted.map((ch, idx) => {
      const details = channelDetails[ch.id] ?? {
        label: ch.name,
        mic_or_di: "",
        stand: "",
        notes: "",
      };
      return `${idx + 1};${details.label || ch.name};${details.mic_or_di};${details.stand};${details.notes}`;
    });
    const text = ["Channel;Name;Mic/DI;Stand;Notes", ...lines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Gekopieerd naar klembord.");
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error("Clipboard error", err);
      setCopyMessage("Kopiëren mislukt.");
    }
  };

  const downloadCsv = () => {
    const lines = selectedChannelsSorted.map((ch, idx) => {
      const details = channelDetails[ch.id] ?? {
        label: ch.name,
        mic_or_di: "",
        stand: "",
        notes: "",
      };
      const esc = (val: string) => `"${val.replace(/"/g, '""')}"`;
      return `${idx + 1};${esc(details.label || ch.name)};${esc(details.mic_or_di)};${esc(details.stand)};${esc(
        details.notes
      )}`;
    });
    const csv = ["Channel;Name;Mic/DI;Stand;Notes", ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${bandName || "kanalenlijst"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveTechlist = async () => {
    if (bandName.trim() === "") {
      setError("Geef een groepsnaam in.");
      return;
    }
    if (selectedChannelsSorted.length === 0) {
      setError("Selecteer minstens één kanaal.");
      return;
    }

    setSaving(true);
    setError(null);

    let techlistId = selectedTechlistId;

    if (!techlistId) {
      const { data, error: insertError } = await supabase
        .from("techlists")
        .insert({
          name: bandName.trim(),
          notes: bandNotes.trim() === "" ? null : bandNotes.trim(),
        })
        .select()
        .single();

      if (insertError || !data) {
        console.error("Insert techlist error:", insertError);
        setError("Fout bij opslaan van techlist.");
        setSaving(false);
        return;
      }
      techlistId = data.id;
      setSelectedTechlistId(techlistId);
      setTechlists((prev) => [{ id: data.id, name: data.name, notes: data.notes, created_at: data.created_at }, ...prev]);
    } else {
      const { error: updateError } = await supabase
        .from("techlists")
        .update({
          name: bandName.trim(),
          notes: bandNotes.trim() === "" ? null : bandNotes.trim(),
        })
        .eq("id", techlistId);
      if (updateError) {
        console.error("Update techlist error:", updateError);
        setError("Fout bij opslaan van techlist.");
        setSaving(false);
        return;
      }
    }

    const { error: delError } = await supabase.from("techlist_channels").delete().eq("techlist_id", techlistId);
    if (delError) {
      console.error("Delete techlist_channels error:", delError);
      setError("Fout bij opslaan van techlist-kanalen.");
      setSaving(false);
      return;
    }

    const rows = selectedChannelsSorted.map((ch, idx) => {
      const details = channelDetails[ch.id] ?? {
        label: ch.name,
        mic_or_di: "",
        stand: "",
        notes: "",
      };
      return {
        techlist_id: techlistId,
        channel_number: idx + 1,
        canonical_channel_id: ch.id,
        label: details.label || ch.name,
        mic_or_di: details.mic_or_di || null,
        stand: details.stand || null,
        notes: details.notes || null,
      };
    });

    const { error: insertChannelsError } = await supabase.from("techlist_channels").insert(rows);
    if (insertChannelsError) {
      console.error("Insert techlist_channels error:", insertChannelsError);
      setError("Fout bij opslaan van techlist-kanalen.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setCopyMessage("Techlist opgeslagen.");
    setTimeout(() => setCopyMessage(null), 2000);
  };

  const loadTechlist = async (id: string) => {
    setLoadingTechlist(true);
    setError(null);
    setSelectedTechlistId(id);

    const [{ data: tlData, error: tlError }, { data: chData, error: chError }] = await Promise.all([
      supabase.from("techlists").select("id, name, notes").eq("id", id).single(),
      supabase
        .from("techlist_channels")
        .select("id, techlist_id, channel_number, canonical_channel_id, label, mic_or_di, stand, notes")
        .eq("techlist_id", id)
        .order("channel_number", { ascending: true }),
    ]);

    if (tlError?.message) console.error("Techlist error:", tlError);
    if (chError?.message) console.error("Techlist channels error:", chError);

    if (tlData) {
      setBandName(tlData.name ?? "");
      setBandNotes(tlData.notes ?? "");
    }

    if (chData) {
      const ids = chData.map((row) => row.canonical_channel_id);
      setSelectedChannelIds(new Set(ids));
      const details: Record<string, ChannelDetails> = {};
      chData.forEach((row) => {
        details[row.canonical_channel_id] = {
          label: row.label ?? "",
          mic_or_di: row.mic_or_di ?? "",
          stand: row.stand ?? "",
          notes: row.notes ?? "",
        };
      });
      setChannelDetails(details);
    }

    setLoadingTechlist(false);
  };

  const handleDeleteTechlist = async () => {
    if (!selectedTechlistId) return;
    if (!window.confirm("Techlist verwijderen?")) return;
    setDeleting(true);
    setError(null);

    const { error: delChannelsError } = await supabase
      .from("techlist_channels")
      .delete()
      .eq("techlist_id", selectedTechlistId);
    if (delChannelsError) {
      console.error("Delete techlist_channels error:", delChannelsError);
      setError("Fout bij verwijderen van techlist-kanalen.");
      setDeleting(false);
      return;
    }

    const { error: delTlError } = await supabase.from("techlists").delete().eq("id", selectedTechlistId);
    if (delTlError) {
      console.error("Delete techlist error:", delTlError);
      setError("Fout bij verwijderen van techlist.");
      setDeleting(false);
      return;
    }

    setTechlists((prev) => prev.filter((t) => t.id !== selectedTechlistId));
    setSelectedTechlistId(null);
    setBandName("");
    setBandNotes("");
    setSelectedChannelIds(new Set());
    setChannelDetails({});
    setDeleting(false);
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #techlist-print,
          #techlist-print * {
            visibility: visible;
          }
          #techlist-print {
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
      <div style={{ marginBottom: 16 }}>
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>Kanalenlijst voor technische fiche</h1>
          <p style={{ marginBottom: 8 }}>
            Kies een groep en vink de kanalen aan. Export via CSV of PDF (print).
          </p>
        </div>
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

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Groepsnaam"
            value={bandName}
            onChange={(e) => setBandName(e.target.value)}
            style={{
              flex: "1 1 280px",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={saving || deleting || loadingTechlist}
          />
          <textarea
            placeholder="Notes (optioneel)"
            value={bandNotes}
            onChange={(e) => setBandNotes(e.target.value)}
            style={{
              flex: "1 1 280px",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
              minHeight: 60,
            }}
            disabled={saving || deleting || loadingTechlist}
          />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedTechlistId ?? ""}
            onChange={(e) => {
              const nextId = e.target.value;
              if (nextId === "") {
                setSelectedTechlistId(null);
                setBandName("");
                setBandNotes("");
                setSelectedChannelIds(new Set());
                setChannelDetails({});
              } else {
                loadTechlist(nextId);
              }
            }}
            style={{ padding: "8px 10px", borderRadius: 4, border: "1px solid #444" }}
            disabled={loadingTechlist}
          >
            <option value="">Nieuwe techlist…</option>
            {techlists.map((tl) => (
              <option key={tl.id} value={tl.id}>
                {tl.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSaveTechlist}
            disabled={saving || deleting}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: saving ? "#444" : "#111",
              cursor: saving ? "not-allowed" : "pointer",
            }}
            className="no-print"
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
          <button
            type="button"
            onClick={handleDeleteTechlist}
            disabled={deleting || !selectedTechlistId}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #d9534f",
              background: deleting || !selectedTechlistId ? "#2a0f0f" : "#2a0f0f",
              color: "#f5c6cb",
              cursor: deleting || !selectedTechlistId ? "not-allowed" : "pointer",
            }}
            className="no-print"
          >
            {deleting ? "Verwijderen…" : "Techlist verwijderen"}
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={selectedChannelsSorted.length === 0}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: selectedChannelsSorted.length === 0 ? "#444" : "#111",
              cursor: selectedChannelsSorted.length === 0 ? "not-allowed" : "pointer",
            }}
            className="no-print"
          >
            Kopieer CSV
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={selectedChannelsSorted.length === 0}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: selectedChannelsSorted.length === 0 ? "#444" : "#111",
              cursor: selectedChannelsSorted.length === 0 ? "not-allowed" : "pointer",
            }}
            className="no-print"
          >
            Download CSV
          </button>
          {copyMessage && <span>{copyMessage}</span>}
        </div>
      </section>

      <section className="no-print" style={{ marginBottom: 32 }}>
        {orderedChannels.length === 0 ? (
          <p>Geen kanalen beschikbaar.</p>
        ) : (
          sortedCategories.map((cat) => {
            const inCategory = orderedChannels.filter((ch) => ch.category_id === cat.id);
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
                    {inCategory.length === 0 && <p style={{ color: "#aaa" }}>Nog geen kanalen in deze categorie.</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                      {inCategory.map((ch) => {
                        const checked = selectedChannelIds.has(ch.id);
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
                            <input type="checkbox" checked={checked} onChange={() => toggleChannel(ch.id)} />
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

      <section id="techlist-print">
        <h2>Preview kanalenlijst</h2>
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
              {selectedChannelsSorted.map((ch, index) => {
                const details = channelDetails[ch.id] ?? {
                  label: ch.name,
                  mic_or_di: "",
                  stand: "",
                  notes: "",
                };
                return (
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
                      <input
                        type="text"
                        value={details.label}
                        onChange={(e) =>
                          setChannelDetails((prev) => ({
                            ...prev,
                            [ch.id]: { ...details, label: e.target.value },
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderBottom: "1px solid #333",
                        width: 140,
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Mic/DI"
                        value={details.mic_or_di}
                        onChange={(e) =>
                          setChannelDetails((prev) => ({
                            ...prev,
                            [ch.id]: { ...details, mic_or_di: e.target.value },
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderBottom: "1px solid #333",
                        width: 140,
                      }}
                    >
                      <select
                        value={details.stand || "none"}
                        onChange={(e) =>
                          setChannelDetails((prev) => ({
                            ...prev,
                            [ch.id]: { ...details, stand: e.target.value },
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                      >
                        <option value="none">none</option>
                        <option value="Large Boom">Large Boom</option>
                        <option value="Small Boom">Small boom</option>
                        <option value="Clamp">Clamp</option>
                      </select>
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderBottom: "1px solid #333",
                        width: 200,
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Notes"
                        value={details.notes}
                        onChange={(e) =>
                          setChannelDetails((prev) => ({
                            ...prev,
                            [ch.id]: { ...details, notes: e.target.value },
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #444",
                          background: "#0f0f0f",
                          color: "#fff",
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
