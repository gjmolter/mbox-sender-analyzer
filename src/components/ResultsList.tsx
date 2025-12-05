import React, { useState, useMemo } from "react";
import { Mail, ArrowUpDown, ArrowUp, ArrowDown, Download, Trash2 } from "lucide-react";

import { DomainGroup } from "../utils/constants";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResultsListProps {
  groups: DomainGroup[];
  onExport: (format: "txt" | "csv" | "json" | "json_full") => void;
  filteredMessageCount: number;
  totalMessageCount: number;
  onIgnoreDomain: (domain: string) => void;
}

type SortField = "domain" | "count" | "senders" | "latestDate";
type SortDirection = "asc" | "desc";
type SenderSortField = "email" | "count" | "date";

type DomainItemProps = {
  group: DomainGroup;
  onIgnoreDomain: (domain: string) => void;
};

const DomainItem: React.FC<DomainItemProps> = ({ group, onIgnoreDomain }) => {
  const [senderSort, setSenderSort] = useState<{ field: SenderSortField; dir: SortDirection }>({
    field: "count",
    dir: "desc",
  });

  const sortedSenders = useMemo(() => {
    const sorted = [...group.senders];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (senderSort.field === "count") {
        comparison = a.count - b.count;
      } else if (senderSort.field === "email") {
        comparison = a.email.localeCompare(b.email);
      } else {
        const aDate = a.lastEmailDate?.getTime() || 0;
        const bDate = b.lastEmailDate?.getTime() || 0;
        comparison = aDate - bDate;
      }
      return senderSort.dir === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [group.senders, senderSort]);

  const handleSenderSort = (field: SenderSortField) => {
    setSenderSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <AccordionItem
      value={group.domain}
      className="border border-border/30 rounded-xl px-3 hover:border-orange/60 transition-colors"
    >
      <AccordionTrigger className="flex items-center gap-4 py-4 text-foreground hover:no-underline">
        <div className="flex-1 space-y-1 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-lg">{group.domain}</p>
            <Badge className="bg-orange/15 text-orange border border-orange/30 whitespace-nowrap">
              {group.totalCount.toLocaleString()} messages
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
            <span>{group.senders.length} unique senders</span>
            {group.latestDate && <span>Last email: {group.latestDate.toLocaleDateString()}</span>}
          </div>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Ignore ${group.domain}`}
          className="p-2 rounded-full border border-white/20 text-muted-foreground hover:text-orange hover:border-orange transition-colors"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onIgnoreDomain(group.domain);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onIgnoreDomain(group.domain);
            }
          }}
        >
          <Trash2 className="w-4 h-4" />
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="overflow-x-auto rounded-lg border border-border/30 bg-background/60">
          <Table>
            <TableHeader>
              <TableRow className="border-border/20 text-muted-foreground">
                <TableHead className="cursor-pointer" onClick={() => handleSenderSort("email")}>
                  <div className="flex items-center gap-2">
                    Sender Email
                    {senderSort.field === "email" ? (
                      senderSort.dir === "asc" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSenderSort("count")}>
                  <div className="flex items-center justify-end gap-2">
                    Count
                    {senderSort.field === "count" ? (
                      senderSort.dir === "asc" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSenderSort("date")}>
                  <div className="flex items-center justify-end gap-2">
                    Last Received
                    {senderSort.field === "date" ? (
                      senderSort.dir === "asc" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSenders.map((sender, idx) => (
                <TableRow key={`${sender.email}-${idx}`} className="border-border/10">
                  <TableCell className="font-mono text-sm">{sender.email}</TableCell>
                  <TableCell className="text-right font-semibold">{sender.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {sender.lastEmailDate?.toLocaleDateString() || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export const ResultsList: React.FC<ResultsListProps> = ({
  groups,
  onExport,
  filteredMessageCount,
  totalMessageCount,
  onIgnoreDomain,
}) => {
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedGroups = useMemo(() => {
    const sorted = [...groups];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortField === "count") {
        comparison = a.totalCount - b.totalCount;
      } else if (sortField === "domain") {
        comparison = a.domain.localeCompare(b.domain);
      } else if (sortField === "senders") {
        comparison = a.senders.length - b.senders.length;
      } else {
        const aDate = a.latestDate?.getTime() || 0;
        const bDate = b.latestDate?.getTime() || 0;
        comparison = aDate - bDate;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [groups, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 glass-card border border-border/40">
        <Mail className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">No results found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">Domains ({sortedGroups.length.toLocaleString()})</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border border-white/20">
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card border border-border/40">
              <DropdownMenuLabel>Export Format</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onExport("txt")}>TXT (Domains)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("csv")}>CSV (Domains)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("json")}>JSON (Domains)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("json_full")}>JSON (Full Data)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Sort by:</span>
          <Button variant={sortField === "count" ? "default" : "outline"} size="sm" onClick={() => handleSort("count")}>
            Count {sortField === "count" && (sortDirection === "asc" ? "↑" : "↓")}
          </Button>
          <Button
            variant={sortField === "domain" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSort("domain")}
          >
            Domain {sortField === "domain" && (sortDirection === "asc" ? "↑" : "↓")}
          </Button>
          <Button
            variant={sortField === "senders" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSort("senders")}
          >
            Senders {sortField === "senders" && (sortDirection === "asc" ? "↑" : "↓")}
          </Button>
          <Button
            variant={sortField === "latestDate" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSort("latestDate")}
          >
            Last Received {sortField === "latestDate" && (sortDirection === "asc" ? "↑" : "↓")}
          </Button>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {sortedGroups.map((group) => (
          <DomainItem key={group.domain} group={group} onIgnoreDomain={onIgnoreDomain} />
        ))}
      </Accordion>
    </div>
  );
};
