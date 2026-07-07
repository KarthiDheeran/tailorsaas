"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { searchCustomers } from "@/lib/data/stub-data";
import type { Customer } from "@/lib/types";

function SuggestionDropdown({
  customers,
  query,
  onSelect,
}: {
  customers: Customer[];
  query: string;
  onSelect: (customer: Customer) => void;
}) {
  if (!query) return null;

  if (customers.length === 0) {
    return (
      <div className="absolute z-10 mt-2 w-full rounded-lg border border-border-soft bg-white px-4 py-3 text-sm text-ink-muted shadow-soft">
        No matching customers
      </div>
    );
  }

  return (
    <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
      {customers.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onMouseDown={() => onSelect(c)}
            className="block w-full px-4 py-3 text-left text-sm hover:bg-surface"
          >
            <span className="font-medium text-ink">{c.name}</span>
            <span className="text-ink-muted"> — {c.phone}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CustomerSearch({
  onSelect,
}: {
  onSelect: (customer: Customer) => void;
}) {
  const [query, setQuery] = useState("");

  const suggestions = searchCustomers(query);

  function handleSelect(customer: Customer) {
    setQuery("");
    onSelect(customer);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer by phone or name..."
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
        <SuggestionDropdown
          customers={suggestions}
          query={query}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
