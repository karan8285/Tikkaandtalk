import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, type CountryCode } from "../lib/countryCodes";

interface CountryCodeSelectProps {
  value: string; // e.g. "+62"
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CountryCodeSelect({ value, onChange, disabled, className }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRY_CODES.find((cc) => cc.code === value) || DEFAULT_COUNTRY_CODE;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected into view when opened
  useEffect(() => {
    if (open && listRef.current) {
      const selectedEl = listRef.current.querySelector('[data-selected="true"]');
      if (selectedEl) {
        setTimeout(() => selectedEl.scrollIntoView({ block: "center" }), 80);
      }
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return COUNTRY_CODES;
    const q = search.toLowerCase();
    return COUNTRY_CODES.filter(
      (cc) =>
        cc.country.toLowerCase().includes(q) ||
        cc.code.includes(q) ||
        cc.dial.includes(q.replace("+", "")) ||
        cc.flag.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      {/* Trigger button — shows flag + code */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-10 px-2.5 border border-input rounded-l-md bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium min-w-[100px] disabled:opacity-50"
      >
        <span className="text-xl leading-none">{selected.emoji}</span>
        <span className="text-gray-700">{selected.code}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-72 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search country or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 bg-gray-50"
              />
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="overflow-y-auto max-h-56">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-400">
                No countries found
              </div>
            ) : (
              filtered.map((cc, idx) => {
                const isSelected = cc.code === value && cc.flag === selected.flag;
                return (
                  <button
                    key={`${cc.flag}-${cc.code}-${idx}`}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => {
                      onChange(cc.code);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/8 border-l-2 border-primary"
                        : "hover:bg-gray-50 border-l-2 border-transparent"
                    }`}
                  >
                    <span className="text-xl leading-none flex-shrink-0">{cc.emoji}</span>
                    <span className={`flex-1 text-left truncate ${isSelected ? "font-semibold text-primary" : "text-gray-700"}`}>
                      {cc.country}
                    </span>
                    <span className={`tabular-nums text-xs flex-shrink-0 ${isSelected ? "text-primary font-semibold" : "text-gray-400"}`}>
                      {cc.code}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
