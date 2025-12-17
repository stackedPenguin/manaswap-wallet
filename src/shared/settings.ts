import type { WalletSettings } from './types';
import { DEFAULT_NETWORK_ID } from './networks';

const STORAGE_KEY = 'manaswap:settings';

export const defaultSettings: WalletSettings = {
  autoDetectNetworks: false, // Disabled by default - don't auto-switch unless explicitly requested
  selectedNetwork: DEFAULT_NETWORK_ID,
  selectedAccountAddress: undefined,
  siteOverrides: {},
  customNetworks: [],
  autoLockMinutes: 10, // Default: lock after 10 minutes of inactivity
};

export async function readSettings(): Promise<WalletSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...defaultSettings, ...(stored[STORAGE_KEY] ?? {}) };
}

export async function writeSettings(settings: WalletSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export async function upsertSiteOverride(
  hostname: string,
  networkId: WalletSettings['selectedNetwork'],
): Promise<WalletSettings> {
  const settings = await readSettings();
  const siteOverrides = { ...settings.siteOverrides, [hostname]: networkId };
  const next = { ...settings, siteOverrides };
  await writeSettings(next);
  return next;
}

export async function removeSiteOverride(hostname: string): Promise<WalletSettings> {
  const settings = await readSettings();
  const siteOverrides = { ...settings.siteOverrides };
  delete siteOverrides[hostname];
  const next = { ...settings, siteOverrides };
  await writeSettings(next);
  return next;
}
