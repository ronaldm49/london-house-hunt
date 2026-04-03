"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Property } from "@/types/property";

type ImportStatus = "idle" | "loading" | "success" | "error";

interface DashboardHeaderProps {
  onImport?: (property: Property) => void;
  searchSummary?: string;
}

export default function DashboardHeader({ onImport, searchSummary }: DashboardHeaderProps) {
  const [time, setTime] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMessage, setImportMessage] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/London",
        })
      );
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showImport) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowImport(false);
        setImportStatus("idle");
        setImportMessage("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showImport]);

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImportStatus("loading");
    setImportMessage("");

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setImportStatus("error");
        setImportMessage(data.error || "Import failed");
        return;
      }

      setImportStatus("success");
      setImportMessage(data.address || "Listing imported");
      onImport?.(data as Property);

      setTimeout(() => {
        setShowImport(false);
        setImportUrl("");
        setImportStatus("idle");
        setImportMessage("");
      }, 2000);
    } catch {
      setImportStatus("error");
      setImportMessage("Network error");
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-bg-primary/80 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-text-primary tracking-tight">
            London House Hunt
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-body">
            {searchSummary ?? "London rentals"}
          </p>
        </div>
        <div className="flex items-baseline gap-4">
          {time && (
            <span suppressHydrationWarning className="text-text-muted text-xs font-body hidden sm:block">
              {time}
            </span>
          )}

          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => {
                setShowImport(!showImport);
                if (showImport) {
                  setImportStatus("idle");
                  setImportMessage("");
                }
              }}
              className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body"
            >
              Import
            </button>

            {showImport && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-bg-card border border-border rounded-xl shadow-lg p-4 z-50">
                <div className="absolute -top-1.5 right-4 w-3 h-3 bg-bg-card border-l border-t border-border rotate-45" />
                <p className="text-text-secondary text-xs font-body mb-3">
                  Paste a Rightmove or OnTheMarket listing URL
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && importStatus !== "loading") handleImport();
                    }}
                    placeholder="https://..."
                    disabled={importStatus === "loading" || importStatus === "success"}
                    className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                  />
                  <button
                    onClick={handleImport}
                    disabled={importStatus === "loading" || importStatus === "success" || !importUrl.trim()}
                    className="bg-accent hover:bg-accent-hover text-white rounded-lg px-4 py-2 text-sm font-body font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {importStatus === "loading" ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                          <polyline points="21 3 21 9 15 9" />
                        </svg>
                        Importing
                      </>
                    ) : (
                      "Import"
                    )}
                  </button>
                </div>

                {importStatus === "success" && (
                  <p className="mt-2 text-xs font-body text-accent-green flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {importMessage}
                  </p>
                )}
                {importStatus === "error" && (
                  <p className="mt-2 text-xs font-body text-accent-red">
                    {importMessage}
                  </p>
                )}
              </div>
            )}
          </div>

          <Link
            href="/settings"
            className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body hidden sm:block"
          >
            Settings
          </Link>

          <Link
            href="/about"
            className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body hidden sm:block"
            title="How it works"
          >
            How it works
          </Link>
        </div>
      </div>
    </header>
  );
}
