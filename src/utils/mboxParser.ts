import { PERSONAL_DOMAINS, DomainGroup, Sender } from "./constants";
import { IndexedDBStorage } from "./indexedDBStorage";

interface ProgressInfo {
  progress: number;
  memory?: {
    used: number;
    total: number;
    domains: number;
    senders: number;
  };
}

type DomainData = {
  totalCount: number;
  senders: Map<string, { count: number; earliestDate?: Date; latestDate?: Date }>;
  isPersonal: boolean;
  earliestDate?: Date;
  latestDate?: Date;
};

export class MboxProcessor {
  private file: File;
  private onProgress: (info: ProgressInfo) => void;
  private abortController: AbortController;
  private messageCount = 0;
  private BATCH_SIZE = 50 * 1024 * 1024; // Process 50MB at a time
  private storage: IndexedDBStorage;
  private MAX_ACCUMULATED_DOMAINS = 500; // Flush accumulated when we hit this many domains
  private MAX_ACCUMULATED_SENDERS = 5000; // Or this many senders

  constructor(file: File, onProgress: (info: ProgressInfo) => void) {
    this.file = file;
    this.onProgress = onProgress;
    this.abortController = new AbortController();
    this.storage = new IndexedDBStorage();
  }

  // Get memory usage if available (Chrome/Edge)
  private getMemoryInfo(): { used: number; total: number } | null {
    if ("memory" in performance) {
      const mem = (performance as any).memory;
      return {
        used: mem.usedJSHeapSize,
        total: mem.jsHeapSizeLimit,
      };
    }
    return null;
  }

  cancel() {
    this.abortController.abort();
  }

  async process(): Promise<DomainGroup[]> {
    // Initialize IndexedDB
    console.log("🔧 Initializing IndexedDB...");
    try {
      await this.storage.init();
      await this.storage.clear();
      console.log("✅ IndexedDB ready");
    } catch (error) {
      console.error("❌ IndexedDB initialization failed:", error);
      throw new Error("Failed to initialize IndexedDB. Please check browser permissions.");
    }

    const totalBytes = this.file.size;
    let processedBytes = 0;

    // Accumulated results - flush to IndexedDB when they get too large
    const accumulatedDomains = new Map<string, DomainData>();

    console.log(`📦 Processing file in batches of ${(this.BATCH_SIZE / 1024 / 1024).toFixed(0)}MB...`);

    try {
      // Process file in batches
      let batchStart = 0;
      let batchNumber = 0;

      while (batchStart < totalBytes) {
        if (this.abortController.signal.aborted) throw new Error("Cancelled");

        batchNumber++;
        const batchEnd = Math.min(batchStart + this.BATCH_SIZE, totalBytes);

        console.log(
          `📊 Batch ${batchNumber}: Processing bytes ${batchStart.toLocaleString()} - ${batchEnd.toLocaleString()} (${(
            (batchEnd / totalBytes) *
            100
          ).toFixed(1)}%)`
        );

        // Process this batch
        const batchResults = await this.processBatch(batchStart, batchEnd);

        // Merge batch results into accumulated results
        this.mergeResults(accumulatedDomains, batchResults);

        // Clear batch results to free memory
        batchResults.clear();

        // Check if accumulated results are getting too large - flush to IndexedDB
        const accumulatedDomainsCount = accumulatedDomains.size;
        const accumulatedSendersCount = Array.from(accumulatedDomains.values()).reduce(
          (sum, d) => sum + d.senders.size,
          0
        );

        if (
          accumulatedDomainsCount >= this.MAX_ACCUMULATED_DOMAINS ||
          accumulatedSendersCount >= this.MAX_ACCUMULATED_SENDERS
        ) {
          console.log(
            `💾 Flushing accumulated results to IndexedDB (domains: ${accumulatedDomainsCount}, senders: ${accumulatedSendersCount})`
          );
          try {
            await this.storage.flush(accumulatedDomains);
            accumulatedDomains.clear();
            console.log(`   ✅ Flushed! Memory freed.`);
          } catch (flushError) {
            console.error("❌ Error flushing to IndexedDB:", flushError);
            // Continue anyway - might be able to finish
          }
        }

        processedBytes = batchEnd;
        const memInfo = this.getMemoryInfo();
        this.onProgress({
          progress: (processedBytes / totalBytes) * 100,
          memory: memInfo
            ? {
                used: memInfo.used,
                total: memInfo.total,
                domains: accumulatedDomains.size,
                senders: accumulatedSendersCount,
              }
            : undefined,
        });

        batchStart = batchEnd;

        // Small delay between batches to allow GC
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Flush any remaining accumulated results
      if (accumulatedDomains.size > 0) {
        console.log(`💾 Final flush of accumulated results (${accumulatedDomains.size} domains)`);
        await this.storage.flush(accumulatedDomains);
        accumulatedDomains.clear();
      }

      // Load all results from IndexedDB
      console.log(`📦 Loading final results from IndexedDB...`);
      const finalDomains = await this.storage.loadAll();

      // Final memory check
      const finalMem = this.getMemoryInfo();
      if (finalMem) {
        console.log(`✅ Processing complete: ${this.messageCount} messages processed`);
        console.log(
          `   Memory: ${(finalMem.used / 1024 / 1024).toFixed(1)}MB / ${(finalMem.total / 1024 / 1024).toFixed(1)}MB`
        );
        console.log(
          `   Domains: ${finalDomains.size}, Total senders: ${Array.from(finalDomains.values()).reduce(
            (sum, d) => sum + d.senders.size,
            0
          )}`
        );
      }

      // Clean up
      await this.storage.clear();

      return this.convertToDomainGroups(finalDomains);
    } catch (err) {
      if (err instanceof Error && err.message === "Cancelled") {
        return [];
      }

      // Enhanced error reporting
      const memInfo = this.getMemoryInfo();
      console.error("❌ Processing error:", err);
      console.error(`   Progress: ${((processedBytes / totalBytes) * 100).toFixed(1)}%`);
      console.error(`   Messages processed: ${this.messageCount}`);
      if (memInfo) {
        console.error(
          `   Memory: ${(memInfo.used / 1024 / 1024).toFixed(1)}MB / ${(memInfo.total / 1024 / 1024).toFixed(1)}MB (${(
            (memInfo.used / memInfo.total) *
            100
          ).toFixed(1)}%)`
        );
      }
      throw err;
    }
  }

  // Process a specific byte range of the file
  private async processBatch(startByte: number, endByte: number): Promise<Map<string, DomainData>> {
    const blob = this.file.slice(startByte, endByte);
    const stream = blob.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const domains = new Map<string, DomainData>();
    let buffer = "";
    let currentFrom: string | null = null;
    let currentDate: Date | null = null;
    let inHeaders = false;

    try {
      while (true) {
        if (this.abortController.signal.aborted) throw new Error("Cancelled");

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process lines in buffer
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trimEnd();
          buffer = buffer.slice(newlineIndex + 1);

          this.processLine(
            line,
            (email, date) => {
              if (currentFrom) {
                this.addRecord(domains, currentFrom, currentDate);
                this.messageCount++;
              }
              currentFrom = null;
              currentDate = null;
              inHeaders = true;
            },
            (email) => {
              currentFrom = email;
            },
            (date) => {
              if (!currentDate) currentDate = date;
            },
            () => {
              inHeaders = false;
            },
            inHeaders
          );
        }
      }

      // Process remaining buffer
      if (buffer.length > 0) {
        this.processLine(
          buffer,
          () => {},
          (email) => {
            currentFrom = email;
          },
          (date) => {
            if (!currentDate) currentDate = date;
          },
          () => {},
          inHeaders
        );
      }

      // Add last message
      if (currentFrom) {
        this.addRecord(domains, currentFrom, currentDate);
        this.messageCount++;
      }
    } finally {
      reader.releaseLock();
    }

    return domains;
  }

  // Merge batch results into accumulated results
  private mergeResults(accumulated: Map<string, DomainData>, batch: Map<string, DomainData>): void {
    for (const [domain, batchData] of batch.entries()) {
      if (!accumulated.has(domain)) {
        accumulated.set(domain, {
          totalCount: 0,
          senders: new Map(),
          isPersonal: batchData.isPersonal,
        });
      }

      const accData = accumulated.get(domain)!;

      // Merge senders
      for (const [email, senderData] of batchData.senders.entries()) {
        if (!accData.senders.has(email)) {
          accData.senders.set(email, { count: 0 });
        }

        const accSender = accData.senders.get(email)!;
        accSender.count += senderData.count;

        // Update dates (min/max)
        if (senderData.earliestDate) {
          if (!accSender.earliestDate || senderData.earliestDate < accSender.earliestDate) {
            accSender.earliestDate = senderData.earliestDate;
          }
        }
        if (senderData.latestDate) {
          if (!accSender.latestDate || senderData.latestDate > accSender.latestDate) {
            accSender.latestDate = senderData.latestDate;
          }
        }
      }

      // Update domain totals and dates
      accData.totalCount += batchData.totalCount;

      if (batchData.earliestDate) {
        if (!accData.earliestDate || batchData.earliestDate < accData.earliestDate) {
          accData.earliestDate = batchData.earliestDate;
        }
      }
      if (batchData.latestDate) {
        if (!accData.latestDate || batchData.latestDate > accData.latestDate) {
          accData.latestDate = batchData.latestDate;
        }
      }
    }
  }

  private processLine(
    line: string,
    onNewMessage: (email: string | null, date: Date | null) => void,
    onFromFound: (email: string) => void,
    onDateFound: (date: Date) => void,
    onHeadersEnd: () => void,
    inHeaders: boolean
  ) {
    // New message delimiter
    if (line.startsWith("From ")) {
      onNewMessage(null, null);
      return;
    }

    if (inHeaders) {
      if (line.startsWith("From:")) {
        const fromMatch = line.match(/From:\s*(.+)/i);
        if (fromMatch) {
          let fromValue = fromMatch[1].trim();
          const emailMatch = fromValue.match(/<([^>]+)>/);
          if (emailMatch) {
            onFromFound(emailMatch[1].trim());
          } else {
            onFromFound(fromValue.replace(/^["']|["']$/g, "").trim());
          }
        }
      } else if (line.startsWith("Date:")) {
        const dateMatch = line.match(/Date:\s*(.+)/i);
        if (dateMatch) {
          const date = new Date(dateMatch[1].trim());
          if (!isNaN(date.getTime())) {
            onDateFound(date);
          }
        }
      } else if (line === "") {
        onHeadersEnd();
      }
    }
  }

  private addRecord(domains: Map<string, DomainData>, email: string, date: Date | null) {
    // Extract domain
    const domainMatch = email.match(/@([^\s>]+)/);
    if (!domainMatch) return;

    const fullDomain = domainMatch[1].toLowerCase();

    // Get or create domain group
    if (!domains.has(fullDomain)) {
      domains.set(fullDomain, {
        totalCount: 0,
        senders: new Map(),
        isPersonal: PERSONAL_DOMAINS.has(fullDomain),
      });
    }

    const domainGroup = domains.get(fullDomain)!;

    // Get or create sender entry
    if (!domainGroup.senders.has(email)) {
      domainGroup.senders.set(email, { count: 0 });
    }

    const senderEntry = domainGroup.senders.get(email)!;
    senderEntry.count++;
    domainGroup.totalCount++;

    // Update dates (only min/max per sender)
    if (date) {
      if (!senderEntry.earliestDate || date < senderEntry.earliestDate) {
        senderEntry.earliestDate = date;
      }
      if (!senderEntry.latestDate || date > senderEntry.latestDate) {
        senderEntry.latestDate = date;
      }

      // Update domain-level dates
      if (!domainGroup.earliestDate || date < domainGroup.earliestDate) {
        domainGroup.earliestDate = date;
      }
      if (!domainGroup.latestDate || date > domainGroup.latestDate) {
        domainGroup.latestDate = date;
      }
    }
  }

  // Convert internal structure to final DomainGroup format
  private convertToDomainGroups(domains: Map<string, DomainData>): DomainGroup[] {
    const result: DomainGroup[] = [];

    for (const [domain, data] of domains.entries()) {
      // Convert sender Map to array
      const senders: Sender[] = Array.from(data.senders.entries()).map(([email, senderData]) => ({
        email,
        count: senderData.count,
        lastEmailDate: senderData.latestDate,
      }));

      // Sort senders by count (descending)
      senders.sort((a, b) => b.count - a.count);

      result.push({
        domain,
        totalCount: data.totalCount,
        senders,
        isPersonal: data.isPersonal,
        earliestDate: data.earliestDate,
        latestDate: data.latestDate,
      });
    }

    // Sort domains by total count (descending)
    return result.sort((a, b) => b.totalCount - a.totalCount);
  }
}
