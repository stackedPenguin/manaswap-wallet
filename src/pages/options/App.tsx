import { useEffect, useMemo, useState } from 'react';
import { NETWORKS, type NetworkClusterId } from '../../shared/networks';
import { defaultSettings } from '../../shared/settings';
import type { DAppPermission, WalletSettings } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';
import './index.css';

interface RuntimeResponse {
  settings: WalletSettings;
}

const sanitizeHostname = (input: string) => {
  try {
    const normalized = input.trim();
    if (!normalized) return '';
    const url = normalized.includes('://') ? new URL(normalized) : new URL(`https://${normalized}`);
    return url.hostname.toLowerCase();
  } catch (error) {
    console.warn('[Manaswap] Unable to parse hostname', error);
    return '';
  }
};

export function OptionsApp() {
  const [settings, setSettings] = useState<WalletSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [hostnameInput, setHostnameInput] = useState('');
  const [overrideNetwork, setOverrideNetwork] = useState<NetworkClusterId>('solana-mainnet');
  const [permissions, setPermissions] = useState<DAppPermission[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, permissionsRes] = await Promise.all([
          sendMessage<RuntimeResponse>({ type: 'manaswap:getSettings' }),
          sendMessage<{ success: boolean; permissions?: DAppPermission[] }>({ type: 'manaswap:getPermissions' }),
        ]);
        
        setSettings(settingsRes.settings);
        setOverrideNetwork(settingsRes.settings.selectedNetwork);
        if (permissionsRes.success && permissionsRes.permissions) {
          setPermissions(permissionsRes.permissions);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('[Manaswap] Options failed to load data', error);
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  const persistSettings = (next: WalletSettings) => {
    setSettings(next);
    void sendMessage<RuntimeResponse>({ type: 'manaswap:setSettings', payload: next });
  };

  const handleOverrideSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hostname = sanitizeHostname(hostnameInput);
    if (!hostname) return;

    const next: WalletSettings = {
      ...settings,
      siteOverrides: {
        ...settings.siteOverrides,
        [hostname]: overrideNetwork,
      },
    };
    persistSettings(next);
    setHostnameInput('');
  };

  const handleRemoveOverride = (hostname: string) => {
    const next = { ...settings.siteOverrides };
    delete next[hostname];
    persistSettings({ ...settings, siteOverrides: next });
  };

  const handleRevokePermission = async (origin: string) => {
    try {
      const res = await sendMessage<{ success: boolean }>({
        type: 'manaswap:revokePermission',
        payload: { origin },
      });
      if (res.success) {
        setPermissions((prev) => prev.filter((p) => p.origin !== origin));
      }
    } catch (error) {
      console.error('[Manaswap] Failed to revoke permission', error);
    }
  };

  const overrides = useMemo(() => Object.entries(settings.siteOverrides), [settings.siteOverrides]);

  if (isLoading) {
    return <div className="options-shell">Loading settings…</div>;
  }

  return (
    <div className="options-shell">
      <section>
        <h2>Core Settings</h2>
        <div className="form-row">
          <label style={{ flexBasis: '100%' }}>Default Network</label>
          <select
            value={settings.selectedNetwork}
            onChange={(event) =>
              persistSettings({ ...settings, selectedNetwork: event.target.value as NetworkClusterId })
            }
          >
            {NETWORKS.map((network) => (
              <option key={network.id} value={network.id}>
                {network.label}
              </option>
            ))}
          </select>
        </div>

        <div className="toggle-row">
          <label htmlFor="options-auto-detect">Automatic network detection</label>
          <input
            id="options-auto-detect"
            type="checkbox"
            checked={settings.autoDetectNetworks}
            onChange={(event) => persistSettings({ ...settings, autoDetectNetworks: event.target.checked })}
          />
        </div>
        <p style={{ marginTop: 12, color: '#94a3b8' }}>
          When enabled, Manaswap will use hostname heuristics, RPC hints, and program IDs to recommend switching to
          Solana or X1 networks before transactions are signed.
        </p>
      </section>

      <section>
        <h2>Site Overrides</h2>
        <form onSubmit={handleOverrideSubmit} className="form-row">
          <input
            type="text"
            placeholder="dapp.xyz or https://bridge.x1.xyz"
            value={hostnameInput}
            onChange={(event) => setHostnameInput(event.target.value)}
          />
          <select value={overrideNetwork} onChange={(event) => setOverrideNetwork(event.target.value as NetworkClusterId)}>
            {NETWORKS.map((network) => (
              <option key={network.id} value={network.id}>
                {network.label}
              </option>
            ))}
          </select>
          <button className="primary" type="submit">
            Save override
          </button>
        </form>

        {overrides.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No overrides configured.</p>
        ) : (
          <table className="overrides-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Preferred Network</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map(([hostname, networkId]) => {
                const network = NETWORKS.find((item) => item.id === networkId);
                return (
                  <tr key={hostname}>
                    <td>{hostname}</td>
                    <td>{network?.label ?? networkId}</td>
                    <td>
                      <button type="button" onClick={() => handleRemoveOverride(hostname)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Connected dApps</h2>
        <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
          Sites that have permission to connect to your wallet and request transaction signatures.
        </p>
        
        {permissions.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No connected dApps.</p>
        ) : (
          <table className="overrides-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Network</th>
                <th>Connected</th>
                <th>Last Used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => {
                const network = NETWORKS.find((n) => n.id === permission.networkId);
                const grantedDate = new Date(permission.grantedAt);
                const lastUsedDate = new Date(permission.lastUsed);
                
                return (
                  <tr key={permission.origin}>
                    <td>
                      <div>
                        <div style={{ fontWeight: '600' }}>{permission.hostname}</div>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{permission.origin}</div>
                      </div>
                    </td>
                    <td>{network?.label ?? permission.networkId}</td>
                    <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      {grantedDate.toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      {lastUsedDate.toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleRevokePermission(permission.origin)}
                        style={{ color: '#ef4444' }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default OptionsApp;
