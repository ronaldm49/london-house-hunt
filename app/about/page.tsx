import Link from "next/link";

export const metadata = {
  title: "How It Works | London House Hunt",
};

const SOURCES = [
  {
    name: "Rightmove",
    url: "https://www.rightmove.co.uk",
    status: "active",
    description: "Primary source. Largest UK property portal with the most comprehensive listings.",
  },
  {
    name: "OnTheMarket",
    url: "https://www.onthemarket.com",
    status: "active",
    description: "Secondary source. Some listings appear here before or exclusively vs Rightmove.",
  },
  {
    name: "Zoopla",
    url: "https://www.zoopla.co.uk",
    status: "blocked",
    description: "Blocked by Cloudflare protection. Planned for future integration via proxy.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Scrape",
    text: "A GitHub Actions cron job runs every 4 hours, fetching rental listings from Rightmove and OnTheMarket for your configured areas and price range.",
  },
  {
    num: "02",
    title: "Deduplicate",
    text: "Properties appearing on multiple sites are matched by normalised address. Rightmove is preferred when duplicates exist. Already-triaged listings are excluded from the new feed.",
  },
  {
    num: "03",
    title: "Store",
    text: "Listings are upserted into a Supabase (PostgreSQL) database, keyed on source + listing ID. Price changes and listing updates are tracked over time.",
  },
  {
    num: "04",
    title: "Notify",
    text: "When new listings are found, an email notification is sent via Resend so you never miss a fresh property.",
  },
  {
    num: "05",
    title: "Triage",
    text: "The dashboard lets you quickly sort listings into Wish List, Called, or Bin. Notes are saved per property. Everything persists across sessions.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen relative z-10">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-bg-primary/80 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors text-sm font-body"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight leading-tight">
            How It Works
          </h1>
          <p className="text-text-secondary font-body text-lg mt-4 max-w-2xl leading-relaxed">
            An automated rental tracker that scrapes property portals, deduplicates
            cross-site listings, and surfaces new flats in one place.
          </p>
        </div>

        {/* Pipeline steps */}
        <section className="mb-16">
          <h2 className="font-display text-2xl text-text-primary mb-8">The Pipeline</h2>
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative flex gap-6 pb-10 last:pb-0">
                {/* Vertical connector line */}
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border" />
                )}
                {/* Step number circle */}
                <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-bg-card border border-border flex items-center justify-center">
                  <span className="text-xs font-body font-semibold text-text-muted">{step.num}</span>
                </div>
                {/* Content */}
                <div className="pt-1.5">
                  <h3 className="font-display text-xl text-text-primary">{step.title}</h3>
                  <p className="text-text-secondary font-body text-sm mt-1.5 leading-relaxed max-w-lg">
                    {step.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section className="mb-16">
          <h2 className="font-display text-2xl text-text-primary mb-6">Sources</h2>
          <div className="grid gap-3">
            {SOURCES.map((source) => (
              <div
                key={source.name}
                className="bg-bg-card rounded-lg border border-border p-5 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-body font-semibold text-text-primary text-sm">
                      {source.name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        source.status === "active"
                          ? "bg-accent-green/15 text-accent-green"
                          : "bg-bg-secondary text-text-muted"
                      }`}
                    >
                      {source.status === "active" ? "Live" : "Planned"}
                    </span>
                  </div>
                  <p className="text-text-secondary font-body text-sm mt-1 leading-relaxed">
                    {source.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-16">
          <h2 className="font-display text-2xl text-text-primary mb-6">Stack</h2>
          <div className="bg-bg-card rounded-lg border border-border overflow-hidden">
            {[
              ["Frontend", "Next.js 14, TypeScript, Tailwind CSS"],
              ["Database", "Supabase (PostgreSQL)"],
              ["Scraper", "Python, httpx, GitHub Actions cron"],
              ["Notifications", "Resend email API"],
              ["Hosting", "Vercel"],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={`flex items-baseline gap-4 px-5 py-3.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="text-text-muted font-body text-xs uppercase tracking-wider w-28 flex-shrink-0">
                  {label}
                </span>
                <span className="text-text-primary font-body text-sm">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Search criteria */}
        <section>
          <h2 className="font-display text-2xl text-text-primary mb-6">Search Criteria</h2>
          <div className="bg-bg-card rounded-lg border border-border p-5">
            <div className="grid grid-cols-2 gap-y-3 gap-x-8 font-body text-sm">
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Area</span>
                <span className="text-text-primary">Configurable via Settings</span>
              </div>
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Type</span>
                <span className="text-text-primary">Rentals</span>
              </div>
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Price</span>
                <span className="text-text-primary">Configurable via Settings</span>
              </div>
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Window</span>
                <span className="text-text-primary">Last 24 hours</span>
              </div>
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Frequency</span>
                <span className="text-text-primary">Every 4 hours (5x daily)</span>
              </div>
              <div>
                <span className="text-text-muted text-xs uppercase tracking-wider block mb-1">Dedup</span>
                <span className="text-text-primary">By normalised address</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
