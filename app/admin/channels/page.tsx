"use client";

import { useEffect, useMemo, useState } from "react";
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
  is_active: boolean;
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

export default function AdminChannelsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<CanonicalChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null);
  const [newChannelNames, setNewChannelNames] = useState<Record<string, string>>({});
  const [newChannelOrders, setNewChannelOrders] = useState<Record<string, string>>({});
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryOrder, setNewCategoryOrder] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [{ data: catData, error: catError }, { data: chData, error: chError }] = await Promise.all([
        supabase.from("categories").select("id, name, sort_order").order("sort_order", { ascending: true }),
        supabase
          .from("canonical_channels")
          .select("id, name, default_order, category_id, is_active")
          .order("default_order", { ascending: true }),
      ]);

      if (catError?.message) console.error("Categories error:", catError);
      if (chError?.message) console.error("Channels error:", chError);

      if (catData) setCategories(catData);
      if (chData) setChannels(chData);
      setLoading(false);
    };

    load();
  }, []);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = categoryOrderValue(a.name);
      const orderB = categoryOrderValue(b.name);
      if (orderA !== orderB) return orderA - orderB;
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    });
  }, [categories]);

  const channelsByCategory = useMemo(() => {
    const map = new Map<string, CanonicalChannel[]>();
    channels.forEach((ch) => {
      if (!ch.category_id) return;
      if (!map.has(ch.category_id)) map.set(ch.category_id, []);
      map.get(ch.category_id)!.push(ch);
    });
    sortedCategories.forEach((cat) => {
      const list = map.get(cat.id) ?? [];
      list.sort((a, b) => a.default_order - b.default_order || a.name.localeCompare(b.name));
      map.set(cat.id, list);
    });
    return map;
  }, [channels, sortedCategories]);

  const handleUpdate = async (channelId: string, fields: Partial<CanonicalChannel>) => {
    const existing = channels.find((ch) => ch.id === channelId);
    if (!existing) return;

    setSavingChannelId(channelId);
    setError(null);

    const payload = {
      name: fields.name ?? existing.name,
      default_order: fields.default_order ?? existing.default_order,
      is_active: fields.is_active ?? existing.is_active,
    };

    const { data, error: updateError } = await supabase
      .from("canonical_channels")
      .update(payload)
      .eq("id", channelId)
      .select()
      .single();

    if (updateError || !data) {
      console.error("Update channel error:", updateError);
      setError("Fout bij opslaan van kanaal.");
      setSavingChannelId(null);
      return;
    }

    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              name: data.name,
              default_order: data.default_order,
              is_active: data.is_active,
            }
          : ch
      )
    );

    setSavingChannelId(null);
  };

  const handleUpdateCategory = async (categoryId: string, fields: Partial<Category>) => {
    const existing = categories.find((c) => c.id === categoryId);
    if (!existing) return;

    setSavingCategoryId(categoryId);
    setError(null);

    const payload = {
      name: fields.name ?? existing.name,
      sort_order: fields.sort_order ?? existing.sort_order,
    };

    const { data, error: updateError } = await supabase
      .from("categories")
      .update(payload)
      .eq("id", categoryId)
      .select()
      .single();

    if (updateError || !data) {
      console.error("Update category error:", updateError);
      setError("Fout bij opslaan van categorie.");
      setSavingCategoryId(null);
      return;
    }

    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              name: data.name,
              sort_order: data.sort_order,
            }
          : c
      )
    );

    setSavingCategoryId(null);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (name === "") {
      setError("Geef een categorienaam in.");
      return;
    }
    const orderValue = newCategoryOrder !== "" && !Number.isNaN(Number(newCategoryOrder)) ? Number(newCategoryOrder) : 999;

    setSavingCategoryId("new");
    setError(null);

    const { data, error: insertError } = await supabase
      .from("categories")
      .insert({
        name,
        sort_order: orderValue,
        color: null,
      })
      .select()
      .single();

    if (insertError || !data) {
      console.error("New category error:", insertError);
      setError("Fout bij toevoegen van categorie.");
      setSavingCategoryId(null);
      return;
    }

    setCategories((prev) => [...prev, data as Category]);
    setNewCategoryName("");
    setNewCategoryOrder("");
    setSavingCategoryId(null);
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!window.confirm("Kanaal verwijderen?")) return;
    setDeletingId(channelId);
    setError(null);

    const { error: delError } = await supabase.from("canonical_channels").delete().eq("id", channelId);
    if (delError) {
      console.error("Delete channel error:", delError);
      setError("Fout bij verwijderen van kanaal.");
      setDeletingId(null);
      return;
    }

    setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
    setDeletingId(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm("Categorie en de kanalen erin verwijderen?")) return;
    setDeletingId(categoryId);
    setError(null);

    const { error: delChannelsError } = await supabase
      .from("canonical_channels")
      .delete()
      .eq("category_id", categoryId);
    if (delChannelsError) {
      console.error("Delete channels error:", delChannelsError);
      setError("Fout bij verwijderen van kanalen in deze categorie.");
      setDeletingId(null);
      return;
    }

    const { error: delCatError } = await supabase.from("categories").delete().eq("id", categoryId);
    if (delCatError) {
      console.error("Delete category error:", delCatError);
      setError("Fout bij verwijderen van categorie.");
      setDeletingId(null);
      return;
    }

    setChannels((prev) => prev.filter((ch) => ch.category_id !== categoryId));
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    setDeletingId(null);
  };

  const handleAddChannel = async (categoryId: string) => {
    const name = (newChannelNames[categoryId] ?? "").trim();
    if (name === "") {
      setError("Geef een kanaalnaam in.");
      return;
    }

    const maxOrder =
      channels.filter((c) => c.category_id === categoryId).reduce((acc, cur) => Math.max(acc, cur.default_order), 0) || 0;
    const orderInput = newChannelOrders[categoryId];
    const defaultOrder = orderInput && !Number.isNaN(Number(orderInput)) ? Number(orderInput) : maxOrder + 1;

    setSavingChannelId(categoryId);
    setError(null);

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
      setSavingChannelId(null);
      return;
    }

    setChannels((prev) => [...prev, data as CanonicalChannel]);
    setNewChannelNames((prev) => ({ ...prev, [categoryId]: "" }));
    setNewChannelOrders((prev) => ({ ...prev, [categoryId]: "" }));
    setSavingChannelId(null);
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
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

      <h1>Standaardkanalen beheren</h1>
      <p style={{ marginBottom: 16 }}>Aanpassingen gelden als basis voor de builder.</p>

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
        <h2
          style={{
            marginBottom: 8,
            borderBottom: "1px solid #444",
            paddingBottom: 4,
          }}
        >
          Nieuwe categorie toevoegen
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Categorienaam"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={{
              flex: "1 1 260px",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={savingCategoryId === "new"}
          />
          <input
            type="number"
            placeholder="Volgorde (optioneel)"
            value={newCategoryOrder}
            onChange={(e) => setNewCategoryOrder(e.target.value)}
            style={{
              width: 180,
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "#0f0f0f",
              color: "#fff",
            }}
            disabled={savingCategoryId === "new"}
          />
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={savingCategoryId === "new" || newCategoryName.trim() === ""}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #fff",
              background: savingCategoryId === "new" ? "#444" : "#111",
              cursor: savingCategoryId === "new" || newCategoryName.trim() === "" ? "not-allowed" : "pointer",
            }}
          >
            {savingCategoryId === "new" ? "Opslaan…" : "Categorie toevoegen"}
          </button>
        </div>
      </section>

      {sortedCategories.map((cat) => {
        const inCategory = channelsByCategory.get(cat.id) ?? [];
        return (
          <section key={cat.id} style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
                borderBottom: "1px solid #444",
                paddingBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                defaultValue={cat.name}
                onBlur={(e) => {
                  if (e.target.value.trim() !== cat.name) {
                    handleUpdateCategory(cat.id, { name: e.target.value.trim() });
                  }
                }}
                style={{
                  flex: "1 1 220px",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#0f0f0f",
                  color: "#fff",
                }}
                disabled={savingCategoryId === cat.id || deletingId === cat.id}
              />
              <input
                type="number"
                defaultValue={cat.sort_order}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isNaN(next) && next !== cat.sort_order) {
                    handleUpdateCategory(cat.id, { sort_order: next });
                  }
                }}
                style={{
                  width: 160,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#0f0f0f",
                  color: "#fff",
                }}
                disabled={savingCategoryId === cat.id || deletingId === cat.id}
              />
              <span style={{ fontSize: 12, color: "#888" }}>id: {cat.id.slice(0, 8)}…</span>
              <button
                type="button"
                aria-label="Categorie verwijderen"
                onClick={() => handleDeleteCategory(cat.id)}
                disabled={deletingId === cat.id}
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d9534f",
                  background: "#2a0f0f",
                  color: "#f5c6cb",
                  cursor: deletingId === cat.id ? "not-allowed" : "pointer",
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

            {inCategory.length === 0 ? (
              <p style={{ color: "#aaa" }}>Nog geen kanalen in deze categorie.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {inCategory.map((ch) => (
                  <div
                    key={ch.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 120px 120px 140px 90px",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      border: "1px solid #333",
                      borderRadius: 6,
                    }}
                  >
                    <input
                      type="text"
                      defaultValue={ch.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== ch.name) {
                          handleUpdate(ch.id, { name: e.target.value.trim() });
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 4,
                        border: "1px solid #444",
                        background: "#0f0f0f",
                        color: "#fff",
                      }}
                      disabled={savingChannelId === ch.id || deletingId === ch.id}
                    />
                    <input
                      type="number"
                      defaultValue={ch.default_order}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isNaN(next) && next !== ch.default_order) {
                          handleUpdate(ch.id, { default_order: next });
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 4,
                        border: "1px solid #444",
                        background: "#0f0f0f",
                        color: "#fff",
                      }}
                      disabled={savingChannelId === ch.id || deletingId === ch.id}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={ch.is_active}
                        onChange={(e) => handleUpdate(ch.id, { is_active: e.target.checked })}
                        disabled={savingChannelId === ch.id || deletingId === ch.id}
                      />
                      Actief
                    </label>
                    <button
                      type="button"
                      aria-label="Kanaal verwijderen"
                      onClick={() => handleDeleteChannel(ch.id)}
                      disabled={deletingId === ch.id}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #d9534f",
                        background: "#2a0f0f",
                        color: "#f5c6cb",
                        cursor: deletingId === ch.id ? "not-allowed" : "pointer",
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
                    <span style={{ fontSize: 12, color: "#888" }}>id: {ch.id.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
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
                  flex: "1 1 260px",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#0f0f0f",
                  color: "#fff",
                }}
                disabled={savingChannelId === cat.id}
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
                  width: 180,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#0f0f0f",
                  color: "#fff",
                }}
                disabled={savingChannelId === cat.id}
              />
              <button
                type="button"
                onClick={() => handleAddChannel(cat.id)}
                disabled={savingChannelId === cat.id || (newChannelNames[cat.id] ?? "").trim() === ""}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid #fff",
                  background: savingChannelId === cat.id ? "#444" : "#111",
                  cursor:
                    savingChannelId === cat.id || (newChannelNames[cat.id] ?? "").trim() === ""
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {savingChannelId === cat.id ? "Opslaan…" : "Kanaal toevoegen"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
