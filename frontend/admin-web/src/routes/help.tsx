import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  BookOpen,
  Mail,
  X,
  Sparkles,
  Compass,
  Target,
  Users,
  BarChart2,
  ShieldCheck,
  Layers,
  Settings,
  ArrowRight,
  ArrowLeft,
  Clock,
  ChevronRight,
  LifeBuoy,
  Check,
  Share2,
} from "lucide-react";
import {
  HELP_CATEGORIES,
  HELP_GUIDES,
  type HelpGuide,
} from "../data/helpDocsData";
import { HelpReader } from "../components/help/HelpReader";

export const Route = createFileRoute("/help")({
  component: HelpPage,
  head: () => ({
    meta: [
      { title: "Help Center & User Manual — Proctora" },
      {
        name: "description",
        content:
          "Official user documentation and operational guides for recruiters and hiring managers using Proctora.",
      },
    ],
  }),
});

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Compass,
  Target,
  Users,
  BarChart2,
  ShieldCheck,
  Layers,
  Settings,
};

function HelpPage() {
  // Read initial guide from URL search params if present
  const getInitialGuide = (): string | null => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("guide");
    }
    return null;
  };

  const [activeGuideSlug, setActiveGuideSlug] = useState<string | null>(getInitialGuide);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const catalogScrollRef = useRef<HTMLDivElement>(null);

  // Synchronize browser history / URL query param
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveGuideSlug(params.get("guide"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Reset scroll position to top whenever the active guide changes
  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
    if (catalogScrollRef.current) {
      catalogScrollRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeGuideSlug]);

  const selectGuide = (slug: string | null) => {
    setActiveGuideSlug(slug);
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    const url = new URL(window.location.href);
    if (slug) {
      url.searchParams.set("guide", slug);
    } else {
      url.searchParams.delete("guide");
    }
    window.history.pushState({}, "", url.toString());
  };

  // Shortcut key: Ctrl + K or Cmd + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Find active guide object
  const activeGuide = useMemo(() => {
    if (!activeGuideSlug) return null;
    return HELP_GUIDES.find((g) => g.slug === activeGuideSlug) || null;
  }, [activeGuideSlug]);

  const handleShare = () => {
    if (!activeGuide) return;
    const url = new URL(window.location.href);
    url.searchParams.set("guide", activeGuide.slug);
    navigator.clipboard?.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Compute previous and next guides for pagination
  const { previousGuide, nextGuide } = useMemo(() => {
    if (!activeGuide) return { previousGuide: null, nextGuide: null };
    const currentIndex = HELP_GUIDES.findIndex((g) => g.id === activeGuide.id);
    const prev = currentIndex > 0 ? HELP_GUIDES[currentIndex - 1] : null;
    const next =
      currentIndex >= 0 && currentIndex < HELP_GUIDES.length - 1
        ? HELP_GUIDES[currentIndex + 1]
        : null;
    return { previousGuide: prev, nextGuide: next };
  }, [activeGuide]);

  // Filtered guides based on search query and category
  const filteredGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return HELP_GUIDES.filter((guide) => {
      const matchesCategory =
        selectedCategory === "all" || guide.categoryId === selectedCategory;

      if (!q) return matchesCategory;

      const inTitle = guide.title.toLowerCase().includes(q);
      const inSubtitle = guide.subtitle.toLowerCase().includes(q);
      const inCategory = guide.categoryLabel.toLowerCase().includes(q);
      const inSections = guide.sections.some(
        (s) =>
          s.heading.toLowerCase().includes(q) ||
          s.paragraphs.some((p) => p.toLowerCase().includes(q)) ||
          s.steps?.some(
            (st) =>
              st.title.toLowerCase().includes(q) ||
              st.description.toLowerCase().includes(q)
          )
      );

      return matchesCategory && (inTitle || inSubtitle || inCategory || inSections);
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="h-screen w-full flex flex-col bg-[#f8fafc] text-[#0d1424] font-sans antialiased selection:bg-blue-100 overflow-hidden">
      {/* --------------------------------------------------------------------- */}
      {/* Pinned Top Brand Navigation Header                                    */}
      {/* --------------------------------------------------------------------- */}
      <header className="shrink-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 shadow-2xs">
        {/* Brand & Sub-brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => selectGuide(null)}
            className="flex items-center gap-2.5 text-left group cursor-pointer !rounded-lg"
          >
            <div className="w-8 h-8 !rounded-xl bg-gradient-to-tr from-[#2f68ff] to-blue-500 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <BookOpen size={18} />
            </div>
            <div>
              <div className="text-[17px] font-extrabold tracking-tight text-[#0d1424] leading-none group-hover:text-[#2f68ff] transition-colors">
                Proctora
              </div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#2f68ff] mt-0.5">
                Help &amp; Docs
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Box (Desktop) */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help topics, guides, questions... (Ctrl + K)"
              className="w-full pl-9 pr-8 py-2 !rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2f68ff]/30 focus:border-[#2f68ff] transition"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer !rounded-md"
              >
                <X size={14} />
              </button>
            ) : (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 !rounded-md shadow-2xs pointer-events-none">
                ⌘K
              </span>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------------- */}
      {/* Pinned Top Category Filter Bar                                        */}
      {/* --------------------------------------------------------------------- */}
      <nav className="shrink-0 z-30 bg-white border-b border-slate-200/70 px-4 sm:px-8 py-2.5 overflow-x-auto no-scrollbar shadow-2xs">
        <div className="flex items-center gap-1.5 max-w-7xl mx-auto min-w-max">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              if (activeGuide) selectGuide(null);
            }}
            className={`px-3 py-1.5 !rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === "all" && !activeGuide
                ? "bg-[#2f68ff] text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>All Topics</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 !rounded-full font-bold ${
                selectedCategory === "all" && !activeGuide
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {HELP_GUIDES.length}
            </span>
          </button>

          {HELP_CATEGORIES.map((category) => {
            const IconComponent = CATEGORY_ICONS[category.iconName] || BookOpen;
            const isSelected =
              selectedCategory === category.id ||
              (activeGuide && activeGuide.categoryId === category.id);

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  if (activeGuide && activeGuide.categoryId !== category.id) {
                    selectGuide(null);
                  }
                }}
                className={`px-3 py-1.5 !rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-[#2f68ff] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <IconComponent size={13} />
                <span>{category.shortLabel}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 !rounded-full font-bold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {category.guideCount}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* --------------------------------------------------------------------- */}
      {/* Main Content Area (Scrolls Independently Below Pinned Nav)            */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden min-h-0 w-full">
        {activeGuide ? (
          /* Reader Mode: Sticky Left Sidebar + Dedicated Scroll Container with Sticky Breadcrumbs */
          <div className="flex-1 flex overflow-hidden min-h-0 w-full">
            {/* Left Nav Sidebar (Sticky on desktop, scrolls within itself if tall) */}
            <aside className="w-72 sm:w-80 shrink-0 h-full overflow-y-auto border-r border-slate-200/80 bg-white p-4 space-y-4 shadow-2xs flex flex-col justify-between">
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => selectGuide(null)}
                  className="w-full inline-flex items-center gap-2 px-3 py-2 !rounded-xl text-xs font-bold text-slate-600 hover:text-[#2f68ff] hover:bg-blue-50 transition border border-transparent hover:border-blue-100 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>All Guides &amp; Categories</span>
                </button>

                <div className="border-t border-slate-100 pt-3 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    In This Category ({activeGuide.categoryLabel})
                  </div>
                  {HELP_GUIDES.filter((g) => g.categoryId === activeGuide.categoryId).map(
                    (guide) => {
                      const isCurrent = guide.slug === activeGuide.slug;
                      return (
                        <button
                          key={guide.id}
                          type="button"
                          onClick={() => selectGuide(guide.slug)}
                          className={`w-full text-left px-3 py-2.5 !rounded-xl text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                            isCurrent
                              ? "bg-blue-50/90 text-[#2f68ff] font-bold border border-blue-200/60"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                          }`}
                        >
                          <span className="truncate pr-2">{guide.title}</span>
                          <ChevronRight
                            size={13}
                            className={isCurrent ? "text-[#2f68ff]" : "text-slate-300"}
                          />
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Need Help Box in Sidebar */}
              <div className="p-3.5 !rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0d1424]">
                  <LifeBuoy size={14} className="text-[#2f68ff]" />
                  <span>Direct Recruiter Help</span>
                </div>
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  Have an urgent question during a live drive? Contact operations:
                </p>
                <a
                  href="mailto:support@proctora.com"
                  className="inline-block text-[11px] font-bold text-[#2f68ff] hover:underline"
                >
                  support@proctora.com
                </a>
              </div>
            </aside>

            {/* Right Main Content Area: Dedicated Scroll Container */}
            <div
              ref={contentScrollRef}
              className="flex-1 h-full overflow-y-auto min-h-0 bg-white flex flex-col"
            >
              {/* Sticky Breadcrumb Navigation Bar (Always visible while scrolling) */}
              <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-6 sm:px-10 py-3.5 border-b border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2 flex-wrap text-xs font-medium text-slate-500">
                  <button
                    type="button"
                    onClick={() => selectGuide(null)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Help Center
                  </button>
                  <ChevronRight size={13} className="text-slate-300" />
                  <span className="text-slate-600 font-semibold">{activeGuide.categoryLabel}</span>
                  <ChevronRight size={13} className="text-slate-300" />
                  <span className="text-[#0d1424] font-medium truncate max-w-xs">{activeGuide.title}</span>
                </div>

                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 !rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0d1424] hover:bg-slate-50 text-xs transition shadow-2xs cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check size={13} className="text-emerald-500" />
                      <span className="text-emerald-600 font-medium">Link copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={13} />
                      <span>Share Guide</span>
                    </>
                  )}
                </button>
              </div>

              {/* Reader Document Body */}
              <div className="flex-1 p-6 sm:p-10 max-w-4xl w-full mx-auto">
                <HelpReader
                  guide={activeGuide}
                  onSelectGuide={selectGuide}
                  previousGuide={previousGuide}
                  nextGuide={nextGuide}
                  hideTopBreadcrumb={true}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Catalog Mode: Scrollable Catalog Grid with Pinned Top Nav */
          <div
            ref={catalogScrollRef}
            className="flex-1 h-full overflow-y-auto min-h-0 bg-[#f8fafc] flex flex-col justify-between"
          >
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-10">
              {/* Hero Section */}
              <div className="text-center max-w-2xl mx-auto space-y-3 pt-4 pb-2">
                <h1 className="text-3xl sm:text-4xl font-black text-[#0d1424] tracking-tight">
                  How can we help you recruit today?
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Step-by-step operational playbooks, drive setup checklists, and integrity verification guides for your entire hiring team.
                </p>

                {/* Mobile Search Bar */}
                <div className="md:hidden relative max-w-md mx-auto pt-2">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search articles and guides..."
                    className="w-full pl-9 pr-4 py-2.5 !rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2f68ff]/30 focus:border-[#2f68ff] shadow-2xs"
                  />
                </div>
              </div>

              {/* If searching or category is active: show matching guides */}
              {searchQuery ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div>
                      Found <strong className="text-slate-800">{filteredGuides.length}</strong>{" "}
                      guides matching &ldquo;{searchQuery}&rdquo;
                    </div>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-[#2f68ff] font-semibold hover:underline cursor-pointer"
                    >
                      Clear search
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredGuides.map((guide) => (
                      <GuideCard
                        key={guide.id}
                        guide={guide}
                        onSelect={() => selectGuide(guide.slug)}
                      />
                    ))}
                  </div>

                  {filteredGuides.length === 0 && (
                    <div className="p-12 text-center bg-white !rounded-2xl border border-slate-200/90 space-y-3">
                      <Search size={32} className="mx-auto text-slate-300" />
                      <h3 className="text-base font-bold text-slate-800">
                        No guides found matching &ldquo;{searchQuery}&rdquo;
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Try searching with broader terms like &ldquo;invite&rdquo;, &ldquo;drive&rdquo;, &ldquo;proctoring&rdquo;, or browse our categories below.
                      </p>
                    </div>
                  )}
                </div>
              ) : selectedCategory !== "all" ? (
                /* Specific Category Selected View */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-[#0d1424] tracking-tight">
                        {HELP_CATEGORIES.find((c) => c.id === selectedCategory)?.title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {
                          HELP_CATEGORIES.find((c) => c.id === selectedCategory)
                            ?.description
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("all")}
                      className="text-xs font-semibold text-[#2f68ff] hover:underline cursor-pointer"
                    >
                      Show all categories
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredGuides.map((guide) => (
                      <GuideCard
                        key={guide.id}
                        guide={guide}
                        onSelect={() => selectGuide(guide.slug)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* Default Notion-style Category Hub Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {HELP_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat.iconName] || BookOpen;
                    const catGuides = HELP_GUIDES.filter(
                      (g) => g.categoryId === cat.id
                    );

                    return (
                      <div
                        key={cat.id}
                        className="p-6 !rounded-2xl bg-white border border-slate-200/90 hover:border-slate-300 transition-all duration-200 shadow-2xs hover:shadow-xs flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-3">
                          <div className="w-10 h-10 !rounded-xl bg-blue-50 text-[#2f68ff] flex items-center justify-center border border-blue-100 shadow-2xs">
                            <Icon size={20} />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#0d1424] tracking-tight">
                              {cat.title}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {cat.description}
                            </p>
                          </div>
                        </div>

                        {/* Guide List for Category */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          {catGuides.map((guide) => (
                            <button
                              key={guide.id}
                              type="button"
                              onClick={() => selectGuide(guide.slug)}
                              className="w-full text-left p-2.5 !rounded-lg text-xs font-medium text-slate-700 hover:text-[#2f68ff] hover:bg-slate-50 transition flex items-center justify-between group cursor-pointer"
                            >
                              <span className="truncate pr-2">{guide.title}</span>
                              <ArrowRight
                                size={12}
                                className="text-slate-300 group-hover:text-[#2f68ff] group-hover:translate-x-0.5 transition-transform shrink-0"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Footer Help Banner */}
            <footer className="mt-16 bg-white border-t border-slate-200/80 px-6 sm:px-10 py-8 shrink-0">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-sm font-bold text-[#0d1424] flex items-center justify-center sm:justify-start gap-2">
                    <LifeBuoy size={16} className="text-[#2f68ff]" />
                    <span>Can&apos;t find what you&apos;re looking for?</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Our dedicated engineering and recruitment operations team is available 24/7.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="mailto:support@proctora.com"
                    className="inline-flex items-center gap-2 px-4 py-2.5 !rounded-xl text-xs font-semibold text-white bg-[#2f68ff] hover:bg-blue-600 transition shadow-2xs"
                  >
                    <Mail size={14} />
                    <span>Contact Operations Desk</span>
                  </a>
                </div>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Guide Card Component for Grid Displays
// ----------------------------------------------------------------------------
function GuideCard({
  guide,
  onSelect,
}: {
  guide: HelpGuide;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="p-5 !rounded-2xl bg-white border border-slate-200/90 hover:border-[#2f68ff]/40 hover:shadow-xs text-left transition group shadow-2xs flex flex-col justify-between space-y-4 cursor-pointer"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-400 uppercase tracking-wider">
            {guide.categoryLabel}
          </span>
          <span className="text-slate-400 flex items-center gap-1">
            <Clock size={11} />
            {guide.readTimeMinutes} min
          </span>
        </div>
        <h4 className="text-sm font-bold text-[#0d1424] group-hover:text-[#2f68ff] transition-colors leading-snug">
          {guide.title}
        </h4>
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {guide.subtitle}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-semibold text-[#2f68ff]">
        <span className="text-[11px] px-2 py-0.5 !rounded-md bg-blue-50 text-[#2f68ff] border border-blue-100">
          {guide.badge}
        </span>
        <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
          <span>Read manual</span>
          <ArrowRight size={13} />
        </div>
      </div>
    </button>
  );
}
