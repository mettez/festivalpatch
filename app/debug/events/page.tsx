"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  name: string;
  event_date: string | null;
  location: string | null;
};

type Band = {
  id: string;
  event_id: string;
  name: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
};

export default function EventsDebugPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: evData, error: evError }, { data: bandData, error: bandError }] =
        await Promise.all([
          supabase
            .from("events")
            .select("id, name, event_date, location")
            .order("event_date", { ascending: true }),
          supabase
            .from("bands")
            .select("id, event_id, name, sort_order, start_time, end_time")
            .order("sort_order", { ascending: true }),
        ]);

      if (evError) console.error("Events error:", evError);
      if (bandError) console.error("Bands error:", bandError);

      setEvents(evData ?? []);
      setBands(bandData ?? []);
      setLoading(false);
    };

    load();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Events debug</h1>

      {events.length === 0 && <p>Geen events gevonden.</p>}

      {events.map((ev) => {
        const eventBands = bands.filter((b) => b.event_id === ev.id);

        return (
          <div key={ev.id} style={{ marginBottom: 24 }}>
            <h2>{ev.name}</h2>
            <p>
              Datum: {ev.event_date ?? "n/a"} – Locatie: {ev.location ?? "n/a"}
            </p>

            {eventBands.length === 0 ? (
              <p>Geen bands voor dit event.</p>
            ) : (
              <ul>
                {eventBands.map((b) => (
                  <li key={b.id}>
                    {b.sort_order}. {b.name}{" "}
                    {b.start_time && b.end_time
                      ? `(${b.start_time}–${b.end_time})`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}