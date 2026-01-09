import { QRCodeSVG } from 'qrcode.react';
import { Icons } from '../../shared/ui';
import type { NetworkClusterId } from '../../shared/networks';

interface ReceivePageProps {
    address: string;
    networkId: NetworkClusterId;
    onBack: () => void;
}

export function ReceivePage({ address, networkId, onBack }: ReceivePageProps) {
    const copyAddress = () => {
        navigator.clipboard.writeText(address);
        // Ideally show toast here
    };

    const networkName = networkId === 'mainnet-beta' ? 'Solana Mainnet' :
        networkId === 'devnet' ? 'Solana Devnet' :
            networkId === 'testnet' ? 'Solana Testnet' :
                networkId === 'x1-testnet' ? 'X1 Testnet' : 'Custom Network';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
            {/* Standard Header */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--card-border)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icons.ArrowLeft />
                </button>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Receive Assets</h2>
            </div>

            <div style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '24px'
            }}>
                <p style={{ margin: '0 0 32px', fontSize: '0.95rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Scan to send to this address
                </p>

                <div style={{
                    background: 'white', padding: '20px', borderRadius: '24px', marginBottom: '32px',
                    boxShadow: '0 0 20px rgba(0,0,0,0.3)'
                }}>
                    <QRCodeSVG value={address} size={200} />
                </div>

                <div style={{
                    background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--card-border)',
                    width: '100%', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem', marginRight: '12px' }}>
                        {address}
                    </div>
                    <button onClick={copyAddress} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}>
                        <Icons.Copy size={20} />
                    </button>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.9rem', color: 'var(--text-secondary)',
                    background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '20px'
                }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)' }}></span>
                    Current Chain: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{networkName}</span>
                </div>
            </div>
        </div>
    );
}
