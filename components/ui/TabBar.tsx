"use client";

export type TabId = "new" | "wishlist" | "called" | "offered" | "bin";

interface Tab {
  id: TabId;
  label: string;
  count: number;
}

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabs: Tab[];
}

export default function TabBar({ activeTab, onTabChange, tabs }: TabBarProps) {
  return (
    <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 border border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative flex-1 px-4 py-2.5 rounded-md text-sm font-body font-medium
              transition-all duration-200
              ${
                isActive
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }
            `}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`
                  ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                  rounded-full text-xs font-medium
                  ${
                    isActive
                      ? tab.id === "new"
                        ? "bg-accent-green/20 text-accent-green"
                        : tab.id === "wishlist"
                        ? "bg-accent-gold/20 text-accent-gold"
                        : tab.id === "called"
                        ? "bg-accent-blue/20 text-accent-blue"
                        : tab.id === "offered"
                        ? "bg-accent-purple/20 text-accent-purple"
                        : "bg-accent-red/20 text-accent-red"
                      : "bg-bg-input text-text-muted"
                  }
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
