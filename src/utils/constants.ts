export const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "mail.com",
  "zoho.com",
  "gmx.com",
  "gmx.de",
]);

export interface Sender {
  email: string;
  name?: string;
  count: number;
  lastEmailDate?: Date;
}

export interface DomainGroup {
  domain: string;
  totalCount: number;
  senders: Sender[];
  isPersonal: boolean;
  earliestDate?: Date;
  latestDate?: Date;
}

export interface FilterOptions {
  customExcludedDomains: string[];
  joinSubdomains: boolean;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  minMessageCount: number; // Additional filter idea
}

