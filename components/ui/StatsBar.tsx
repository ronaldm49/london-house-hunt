"use client";

import { useEffect, useState } from "react";

interface StatsBarProps {
  newCount: number;
  wishlistCount: number;
  calledCount: number;
  lastScraped: string | null;
}

type ScrapeStatus = "idle" | "loading" | "success" | "error";

export default function StatsBar({
  newCount,
  wishlistCount,
  calledCount,
  lastScraped,
}: StatsBarProps) {
  const [mounted, setMounted] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  useEffect(() => setMounted(true), []);

  const lastScrapedStr = mounted && lastScraped
    ? new Date(lastScraped).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : lastScraped
    ? "..."
    : "Never";

  const triggerScrape = async () => {
    setScrapeStatus("loading");
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      if (!res.ok) throw new Error();
      setScrapeStatus("success");
    } catch {
      setScrapeStatus("error");
    }
    setTimeout(() => setScrapeStatus("idle"), 3000);
  };

  return (
    <div className="flex items-center gap-5 px-4 py-2.5 bg-bg-card rounded-lg border border-border text-sm font-body">
      <span>
        <span className="font-semibold text-accent-green">{newCount}</span>
        <span className="text-text-muted ml-1.5">new</span>
      </span>
      <span className="text-border select-none">·</span>
      <span>
        <span className="font-semibold text-accent-gold">{wishlistCount}</span>
        <span className="text-text-muted ml-1.5">wish list</span>
      </span>
      <span className="text-border select-none">·</span>
      <span>
        <span className="font-semibold text-accent-blue">{calledCount}</span>
        <span className="text-text-muted ml-1.5">called</span>
      </span>
      <span className="ml-auto flex items-center gap-2 text-text-muted text-xs hidden sm:flex">
        <span>Scraped {lastScrapedStr}</span>
        <button
          onClick={triggerScrape}
          disabled={scrapeStatus === "loading"}
          title={scrapeStatus === "success" ? "Scrape triggered" : scrapeStatus === "error" ? "Scrape failed" : "Run scraper"}
          className="p-1 rounded hover:bg-bg-secondary transition-colors disabled:opacity-50"
        >
          {scrapeStatus === "success" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-green">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : scrapeStatus === "error" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-red">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={scrapeStatus === "loading" ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          )}
        </button>
      </span>
    </div>
  );
}
