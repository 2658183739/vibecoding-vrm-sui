export interface BrowserCommandResult {
  method: string;
  opened?: boolean;
  action?: "open" | "click" | "type";
  target?: string;
  currentUrl?: string | null;
}

export interface BrowserAdapter {
  open(url: string): Promise<BrowserCommandResult>;
  click(target: string): Promise<BrowserCommandResult>;
  type(target: string, text: string): Promise<BrowserCommandResult>;
  getActiveUrl(): Promise<string | null>;
}
