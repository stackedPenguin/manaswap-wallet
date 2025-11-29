import { QRCodeSVG } from 'qrcode.react';
import { Icons } from '../../shared/ui';
import type { NetworkClusterId } from '../../shared/networks';

interface ReceiveModalProps {
    address: string;
    networkId: NetworkClusterId;
    onClose: () => void;
}

export function ReceiveModal({ address, networkId, onClose }: ReceiveModalProps) {
    const copyAddress = () => {
        navigator.clipboard.writeText(address);
        // Ideally show toast here, but for now we rely on user clicking copy button
    };

    const networkName = networkId === 'mainnet-beta' ? 'Solana Mainnet' :
        networkId === 'devnet' ? 'Solana Devnet' :
            networkId === 'testnet' ? 'Solana Testnet' :
                networkId === 'x1-testnet' ? 'X1 Testnet' : 'Custom Network';

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-secondary)', width: '100%', maxWidth: '320px',
                borderRadius: '24px', padding: '24px', border: '1px solid var(--card-border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <Icons.Close />
                    </button>
                </div>

                <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>Receive Assets</h3>
                <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Scan to send to this address
                </p>

                <div style={{
                    background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '24px',
                    boxShadow: '0 0 20px rgba(255,255,255,0.1)'
                }}>
                    <QRCodeSVG value={address} size={180} />
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px',
                    width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', marginRight: '8px' }}>
                        {address}
                    </div>
                    <button onClick={copyAddress} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}>
                        <Icons.Copy />
                    </button>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.85rem', color: 'var(--text-secondary)',
                    background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '20px'
                }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)' }}></span>
                    Current Chain: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{networkName}</span>
                </div>
            </div>
        </div>
    );
}
