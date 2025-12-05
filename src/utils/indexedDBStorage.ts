// IndexedDB storage for incremental data persistence
// This allows us to flush data to disk when memory gets high

interface DomainData {
  totalCount: number;
  senders: Map<string, { count: number; earliestDate?: Date; latestDate?: Date }>;
  isPersonal: boolean;
  earliestDate?: Date;
  latestDate?: Date;
}

interface StoredDomainData {
  totalCount: number;
  senders: Record<string, { count: number; earliestDate?: number; latestDate?: number }>;
  isPersonal: boolean;
  earliestDate?: number;
  latestDate?: number;
}

export class IndexedDBStorage {
  private dbName = "mbox-processor";
  private storeName = "domains";
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "domain" });
        }
      };
    });
  }

  async flush(domains: Map<string, DomainData>): Promise<void> {
    if (!this.db) await this.init();

    // Process in batches to avoid creating huge arrays in memory
    const BATCH_SIZE = 100; // Process 100 domains at a time
    const domainEntries = Array.from(domains.entries());

    for (let i = 0; i < domainEntries.length; i += BATCH_SIZE) {
      const batch = domainEntries.slice(i, i + BATCH_SIZE);

      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      // Process batch
      const promises = batch.map(([domain, data]) => {
        // Convert Map to serializable format (only for this domain)
        const senders: Record<string, { count: number; earliestDate?: number; latestDate?: number }> = {};
        for (const [email, senderData] of data.senders.entries()) {
          senders[email] = {
            count: senderData.count,
            earliestDate: senderData.earliestDate?.getTime(),
            latestDate: senderData.latestDate?.getTime(),
          };
        }

        const item: { domain: string; data: StoredDomainData } = {
          domain,
          data: {
            totalCount: data.totalCount,
            senders,
            isPersonal: data.isPersonal,
            earliestDate: data.earliestDate?.getTime(),
            latestDate: data.latestDate?.getTime(),
          },
        };

        // Merge with existing data in IndexedDB
        return new Promise<void>((resolve, reject) => {
          const getRequest = store.get(item.domain);
          getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (existing) {
              // Merge: combine senders and update counts
              const mergedSenders: Record<string, any> = { ...existing.data.senders };
              for (const [email, senderData] of Object.entries(item.data.senders)) {
                if (mergedSenders[email]) {
                  mergedSenders[email].count += senderData.count;
                  if (
                    senderData.earliestDate &&
                    (!mergedSenders[email].earliestDate || senderData.earliestDate < mergedSenders[email].earliestDate)
                  ) {
                    mergedSenders[email].earliestDate = senderData.earliestDate;
                  }
                  if (
                    senderData.latestDate &&
                    (!mergedSenders[email].latestDate || senderData.latestDate > mergedSenders[email].latestDate)
                  ) {
                    mergedSenders[email].latestDate = senderData.latestDate;
                  }
                } else {
                  mergedSenders[email] = senderData;
                }
              }

              const mergedData: StoredDomainData = {
                totalCount: existing.data.totalCount + item.data.totalCount,
                senders: mergedSenders,
                isPersonal: item.data.isPersonal,
                earliestDate:
                  existing.data.earliestDate && item.data.earliestDate
                    ? Math.min(existing.data.earliestDate, item.data.earliestDate)
                    : existing.data.earliestDate || item.data.earliestDate,
                latestDate:
                  existing.data.latestDate && item.data.latestDate
                    ? Math.max(existing.data.latestDate, item.data.latestDate)
                    : existing.data.latestDate || item.data.latestDate,
              };

              const putRequest = store.put({ domain: item.domain, data: mergedData });
              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(putRequest.error);
            } else {
              const putRequest = store.put({ domain: item.domain, data: item.data });
              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(putRequest.error);
            }
          };
          getRequest.onerror = () => reject(getRequest.error);
        });
      });

      await Promise.all(promises);

      // Clear batch from memory after processing
      batch.length = 0;

      // Small delay between batches to allow GC
      if (i + BATCH_SIZE < domainEntries.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Clear the array reference
    domainEntries.length = 0;
  }

  async loadAll(): Promise<Map<string, DomainData>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const domains = new Map<string, DomainData>();

        for (const item of request.result) {
          const senders = new Map<string, { count: number; earliestDate?: Date; latestDate?: Date }>();
          for (const [email, senderData] of Object.entries(item.data.senders)) {
            const data = senderData as { count: number; earliestDate?: number; latestDate?: number };
            senders.set(email, {
              count: data.count,
              earliestDate: data.earliestDate ? new Date(data.earliestDate) : undefined,
              latestDate: data.latestDate ? new Date(data.latestDate) : undefined,
            });
          }

          domains.set(item.domain, {
            totalCount: item.data.totalCount,
            senders,
            isPersonal: item.data.isPersonal,
            earliestDate: item.data.earliestDate ? new Date(item.data.earliestDate) : undefined,
            latestDate: item.data.latestDate ? new Date(item.data.latestDate) : undefined,
          });
        }

        resolve(domains);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
