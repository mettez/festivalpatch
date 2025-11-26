"use client";

import { useEffect, useState } from "react";
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

export default function ChannelsDebugPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<CanonicalChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: catData, error: catError }, { data: chData, error: chError }] =
        await Promise.all([
          supabase
            .from("categories")
            .select("id, name, sort_order")
            .order("sort_order", { ascending: true }),
          supabase
            .from("canonical_channels")
            .select("id, name, default_order, category_id")
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

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Canonical channels debug</h1>

      {categories.map((cat) => {
        const inCategory = channels.filter((ch) => ch.category_id === cat.id);
        if (inCategory.length === 0) return null;

        return (
          <div key={cat.id} style={{ marginBottom: 16 }}>
            <h2>{cat.name}</h2>
            <ul>
              {inCategory.map((ch) => (
                <li key={ch.id}>
                  {ch.default_order}. {ch.name}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}