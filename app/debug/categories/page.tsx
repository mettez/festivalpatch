"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Category = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
};

export default function CategoriesDebugPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Supabase error:", error);
      } else {
        setCategories(data ?? []);
      }
      setLoading(false);
    };

    load();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Categories debug</h1>
      {categories.length === 0 && <p>Geen categories gevonden.</p>}
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            {c.sort_order}. {c.name} {c.color && <span>({c.color})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}