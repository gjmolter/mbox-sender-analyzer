import React, { useState, useMemo, useEffect } from "react";
import { FileDropzone } from "./components/FileDropzone";
import { FilterBar } from "./components/FilterBar";
import { ResultsList } from "./components/ResultsList";
import { MboxProcessor } from "./utils/mboxParser";
import { FilterOptions, DomainGroup, PERSONAL_DOMAINS } from "./utils/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const STORAGE_KEY = "mailboxAnalyzer:excludedDomains";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [memoryInfo, setMemoryInfo] = useState<{
    used: number;
    total: number;
    domains: number;
    senders: number;
  } | null>(null);
  const [rawResults, setRawResults] = useState<DomainGroup[]>([]);

  const [filters, setFilters] = useState<FilterOptions>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return {
              customExcludedDomains: parsed,
              joinSubdomains: true,
              dateRange: { start: null, end: null },
              minMessageCount: 0,
            };
          }
        } catch {
          // ignore
        }
      }
    }
    return {
      customExcludedDomains: Array.from(PERSONAL_DOMAINS),
      joinSubdomains: true,
      dateRange: { start: null, end: null },
      minMessageCount: 0,
    };
  });

  // Processing Logic
  useEffect(() => {
    if (!file) return;

    const processFile = async () => {
      setIsProcessing(true);
      setProgress(0);
      setMemoryInfo(null);
      setRawResults([]);

      const processor = new MboxProcessor(file, (info) => {
        setProgress(info.progress);
        if (info.memory) {
          setMemoryInfo(info.memory);
        }
      });

      try {
        const results = await processor.process();
        setRawResults(results);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file. See console for details.");
      } finally {
        setIsProcessing(false);
      }
    };

    processFile();
  }, [file]);

  // Filtering & Grouping Logic
  const filteredGroups = useMemo(() => {
    if (!rawResults.length) return [];

    // First pass: Filter individual groups/senders based on criteria
    let groups = rawResults.filter((group) => {
      // Custom Domain Filter
      if (filters.customExcludedDomains.some((d) => group.domain.includes(d.toLowerCase()))) return false;

      // Date Range Filter (if group has no dates within range, exclude)
      if (filters.dateRange.start || filters.dateRange.end) {
        const groupStart = group.earliestDate;
        const groupEnd = group.latestDate;

        if (!groupStart || !groupEnd) return false; // Or true depending on strictness

        if (filters.dateRange.start && groupEnd < filters.dateRange.start) return false;
        if (filters.dateRange.end && groupStart > filters.dateRange.end) return false;
      }

      return true;
    });

    // Subdomain Joining Logic
    if (filters.joinSubdomains) {
      const consolidated = new Map<string, DomainGroup>();

      // Two-part TLDs that need special handling (e.g., .com.br, .co.uk, .com.au)
      const twoPartTLDs = new Set(["uk", "au", "nz", "jp", "br", "mx", "ar", "co", "za", "in", "ae", "sa"]);

      // Common second-level domains in two-part TLDs
      const twoPartSLDs = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "sch"]);

      groups.forEach((group) => {
        const parts = group.domain.split(".");
        let rootDomain = group.domain;

        if (parts.length > 2) {
          const tld = parts[parts.length - 1];
          const sld = parts[parts.length - 2];

          // Check if this is a two-part TLD (e.g., .com.br, .co.uk)
          if (twoPartTLDs.has(tld) && twoPartSLDs.has(sld) && parts.length >= 3) {
            // Take last 3 parts: subdomain.com.br -> com.br, mail.example.com.br -> com.br
            rootDomain = parts.slice(-3).join(".");
          } else {
            // Regular TLD: take last 2 parts
            rootDomain = parts.slice(-2).join(".");
          }
        }

        if (!consolidated.has(rootDomain)) {
          consolidated.set(rootDomain, {
            domain: rootDomain,
            totalCount: 0,
            senders: [],
            isPersonal: PERSONAL_DOMAINS.has(rootDomain),
            earliestDate: group.earliestDate,
            latestDate: group.latestDate,
          });
        }

        const rootGroup = consolidated.get(rootDomain)!;
        rootGroup.totalCount += group.totalCount;
        rootGroup.senders.push(...group.senders);

        // Update dates
        if (group.earliestDate && (!rootGroup.earliestDate || group.earliestDate < rootGroup.earliestDate)) {
          rootGroup.earliestDate = group.earliestDate;
        }
        if (group.latestDate && (!rootGroup.latestDate || group.latestDate > rootGroup.latestDate)) {
          rootGroup.latestDate = group.latestDate;
        }
      });

      groups = Array.from(consolidated.values());
    }

    // Sort by count descending
    return groups.sort((a, b) => b.totalCount - a.totalCount);
  }, [rawResults, filters]);

  const filteredMessageCount = filteredGroups.reduce((acc, g) => acc + g.totalCount, 0);
  const totalProcessedMessages = rawResults.reduce((acc, g) => acc + g.totalCount, 0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters.customExcludedDomains));
    }
  }, [filters.customExcludedDomains]);

  const allPersonalExcluded = Array.from(PERSONAL_DOMAINS).every((domain) =>
    filters.customExcludedDomains.includes(domain)
  );
  const noPersonalExcluded = Array.from(PERSONAL_DOMAINS).every(
    (domain) => !filters.customExcludedDomains.includes(domain)
  );
  const hasExcludedDomains = filters.customExcludedDomains.length > 0;

  const handleExcludePersonalDomains = () => {
    setFilters((prev) => ({
      ...prev,
      customExcludedDomains: Array.from(new Set([...prev.customExcludedDomains, ...PERSONAL_DOMAINS])),
    }));
  };

  const handleIncludePersonalDomains = () => {
    setFilters((prev) => ({
      ...prev,
      customExcludedDomains: prev.customExcludedDomains.filter((domain) => !PERSONAL_DOMAINS.has(domain)),
    }));
  };

  const handleClearExcludedDomains = () => {
    setFilters((prev) => ({
      ...prev,
      customExcludedDomains: [],
    }));
  };

  const handleExport = (format: "txt" | "csv" | "json" | "json_full") => {
    if (!filteredGroups.length) return;
    let content = "";
    let mime = "text/plain";
    let extension = format;

    if (format === "txt") {
      content = filteredGroups.map((group) => group.domain).join("\n");
    } else if (format === "csv") {
      mime = "text/csv";
      const header = "domain";
      const rows = filteredGroups.map((group) => group.domain);
      content = [header, ...rows].join("\n");
    } else if (format === "json") {
      mime = "application/json";
      content = JSON.stringify(
        filteredGroups.map((group) => group.domain),
        null,
        2
      );
    } else if (format === "json_full") {
      mime = "application/json";
      extension = "json";
      content = JSON.stringify(filteredGroups, null, 2);
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mailbox-services.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 font-sans text-foreground">
      <div className="mx-auto space-y-6" style={{ maxWidth: "var(--boxed-width)" }}>
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-orange drop-shadow-sm">Mailbox Analyzer</h1>
          <p className="text-sm text-muted-foreground">
            Analyze your .mbox files and list out everyone who has ever emailed you.
          </p>
        </header>

        <section>
          {rawResults.length === 0 ? (
            <>
              <FileDropzone onFileSelect={setFile} isProcessing={isProcessing} />

              {isProcessing && (
                <div className="mt-4 space-y-3 glass-card border border-border/40 p-4">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="font-medium">Processing...</span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-secondary/40" />
                  {memoryInfo && (
                    <div className="text-xs text-muted-foreground flex flex-wrap justify-between gap-4">
                      <span>
                        Domains:{" "}
                        <span className="font-semibold text-foreground">{memoryInfo.domains.toLocaleString()}</span> |
                        Senders:{" "}
                        <span className="font-semibold text-foreground">{memoryInfo.senders.toLocaleString()}</span>
                      </span>
                      <span className="text-right">
                        Memory:{" "}
                        <span className="font-semibold text-foreground">
                          {(memoryInfo.used / 1024 / 1024).toFixed(1)}MB
                        </span>{" "}
                        / {(memoryInfo.total / 1024 / 1024).toFixed(1)}MB (
                        {((memoryInfo.used / memoryInfo.total) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-6 border border-border/40">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Analyzing: <span className="font-medium text-foreground">{file?.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {rawResults.reduce((acc, g) => acc + g.totalCount, 0).toLocaleString()} messages from{" "}
                  {rawResults.length.toLocaleString()} domains
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setFile(null);
                  setRawResults([]);
                  setProgress(0);
                  setMemoryInfo(null);
                }}
                className="glass-button border border-white/20"
              >
                Analyze Different File
              </Button>
            </div>
          )}
        </section>

        {/* Filters - always visible */}
        <section>
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            totalMessages={totalProcessedMessages}
            filteredCount={filteredMessageCount}
            hasResults={rawResults.length > 0}
            onExcludePersonalDomains={handleExcludePersonalDomains}
            onIncludePersonalDomains={handleIncludePersonalDomains}
            onClearExcludedDomains={handleClearExcludedDomains}
            allPersonalExcluded={allPersonalExcluded}
            noPersonalExcluded={noPersonalExcluded}
            hasExcludedDomains={hasExcludedDomains}
          />
        </section>

        {/* Results */}
        {rawResults.length > 0 && !isProcessing && (
          <section className="space-y-6">
            <div className="glass-card border border-border/40 p-4 space-y-4">
              <ResultsList
                groups={filteredGroups}
                filteredMessageCount={filteredMessageCount}
                totalMessageCount={totalProcessedMessages}
                onExport={handleExport}
                onIgnoreDomain={(domain) =>
                  setFilters((prev) =>
                    prev.customExcludedDomains.includes(domain)
                      ? prev
                      : { ...prev, customExcludedDomains: [...prev.customExcludedDomains, domain] }
                  )
                }
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
