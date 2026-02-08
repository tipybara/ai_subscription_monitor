import { ManualConfig } from '../config.js';

export interface SubscriptionInfo {
  name: string;
  usage_text: string;
  reset_time: string;
  limit_note: string;
  dashboard_url: string;
  error?: string;
}

export abstract class ProviderBase {
  abstract name: string;
  abstract dashboard_url: string;
  abstract cli_name: string;
  
  protected manual: ManualConfig;

  constructor(manual: ManualConfig) {
    this.manual = manual || {};
  }

  abstract fetch(): Promise<SubscriptionInfo>;
  
  /**
   * Automatically run login flow when authentication fails
   * @returns Promise<boolean> - true if login succeeded, false otherwise
   */
  abstract autoLogin(): Promise<boolean>;
}
