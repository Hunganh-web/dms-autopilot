export type Status = "pending" | "processing" | "success" | "error";

export type Customer = {
  index: number;
  fullName: string;
  phone: string;
  idCard: string;
  carModel: string;
  status: Status;
  message: string;
};

export type LogEntry = { message: string; level?: string; at?: string };

export type Config = {
  dmsUrl: string;
  newFormUrl?: string;
  openNewFormSelector?: string;
  selectors: Record<string, string>;
  excelColumns: Record<string, string>;
  carToResource: Record<string, string>;
  timeouts: { action: number; formClose: number; stabilize: number };
  browserChannel?: string;
};

declare global {
  interface Window {
    dms: {
      pickExcel: () => Promise<{ fileName: string; filePath: string; customers: Customer[] } | null>;
      getConfig: () => Promise<Config>;
      saveConfig: (c: Config) => Promise<Config>;
      resetConfig: () => Promise<Config>;
      openDms: () => Promise<boolean>;
      start: (c: Customer[]) => Promise<boolean>;
      testOne: (c: Customer[]) => Promise<boolean>;
      pause: () => Promise<boolean>;
      resume: () => Promise<boolean>;
      stop: () => Promise<boolean>;
      resetCheckpoint: () => Promise<boolean>;
      checkpointCount: () => Promise<number>;
      on: (channel: string, handler: (payload: any) => void) => () => void;
    };
  }
}
