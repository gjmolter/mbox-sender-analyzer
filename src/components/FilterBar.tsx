import React from "react";
import { Info, Plus } from "lucide-react";
import { FilterOptions, PERSONAL_DOMAINS } from "../utils/constants";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  totalMessages: number;
  filteredCount: number;
  hasResults: boolean;
  onExcludePersonalDomains: () => void;
  onIncludePersonalDomains: () => void;
  onClearExcludedDomains: () => void;
  allPersonalExcluded: boolean;
  noPersonalExcluded: boolean;
  hasExcludedDomains: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  totalMessages,
  filteredCount,
  hasResults,
  onExcludePersonalDomains,
  onIncludePersonalDomains,
  onClearExcludedDomains,
  allPersonalExcluded,
  noPersonalExcluded,
  hasExcludedDomains,
}) => {
  const [newDomain, setNewDomain] = React.useState("");
  const personalDomainSet = React.useMemo(() => new Set(PERSONAL_DOMAINS), []);

  const updateFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const addCustomDomain = () => {
    const normalized = newDomain.trim().toLowerCase();
    if (!normalized || filters.customExcludedDomains.includes(normalized)) return;
    updateFilter("customExcludedDomains", [...filters.customExcludedDomains, normalized]);
    setNewDomain("");
  };

  const removeCustomDomain = (domain: string) => {
    updateFilter(
      "customExcludedDomains",
      filters.customExcludedDomains.filter((d) => d !== domain)
    );
  };

  return (
    <Card className="glass-card border-border/40 bg-card/70 backdrop-blur-xl shadow-2xl">
      <CardHeader>
        <CardTitle className="text-orange">Filters</CardTitle>
        {hasResults && (
          <CardDescription className="text-muted-foreground">
            Showing <span className="text-foreground font-semibold">{filteredCount.toLocaleString()}</span> of{" "}
            <span className="text-foreground font-semibold">{totalMessages.toLocaleString()}</span> messages
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Start Date</Label>
            <Input
              type="date"
              value={filters.dateRange.start ? filters.dateRange.start.toISOString().split("T")[0] : ""}
              onChange={(e) =>
                updateFilter("dateRange", {
                  ...filters.dateRange,
                  start: e.target.value ? new Date(e.target.value) : null,
                })
              }
              className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">End Date</Label>
            <Input
              type="date"
              value={filters.dateRange.end ? filters.dateRange.end.toISOString().split("T")[0] : ""}
              onChange={(e) =>
                updateFilter("dateRange", {
                  ...filters.dateRange,
                  end: e.target.value ? new Date(e.target.value) : null,
                })
              }
              className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Group Subdomains</span>
            <span className="text-xs text-muted-foreground">
              Combine subdomains (e.g. mail.acme.com + support.acme.com)
            </span>
          </div>
          <Switch
            checked={filters.joinSubdomains}
            onCheckedChange={(checked) => updateFilter("joinSubdomains", checked)}
          />
        </div>

        <Separator className="bg-border/40" />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-muted-foreground">Excluded Domains</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-orange transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">
                  Personal providers (Gmail, Yahoo, Outlook, etc.) are pre-selected. Remove any chip to include that
                  provider.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.customExcludedDomains.map((domain) => (
              <Badge
                key={domain}
                variant="secondary"
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 border text-xs",
                  personalDomainSet.has(domain)
                    ? "bg-orange/20 text-orange border-orange/40"
                    : "bg-white/10 text-foreground border-white/20"
                )}
              >
                {domain}
                <button
                  onClick={() => removeCustomDomain(domain)}
                  className="rounded-full p-0.5 hover:bg-white/20 transition-colors"
                  title="Remove domain"
                >
                  <span className="sr-only">Remove domain</span>
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
                    <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z" />
                  </svg>
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Add domain..."
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomDomain()}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button
              type="button"
              onClick={addCustomDomain}
              variant="outline"
              className="border-orange/40 text-orange hover:bg-orange/10"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onExcludePersonalDomains}
              disabled={allPersonalExcluded}
              className="border-orange/40 text-orange hover:bg-orange/10"
            >
              Ignore Personal Domains
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onIncludePersonalDomains}
              disabled={noPersonalExcluded}
              className="border-white/20 text-foreground hover:bg-white/10"
            >
              Include Personal Domains
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClearExcludedDomains}
              disabled={!hasExcludedDomains}
              className="text-muted-foreground hover:text-white"
            >
              Clear All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
