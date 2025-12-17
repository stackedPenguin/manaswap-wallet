import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type ISeriesApi, CandlestickSeries, AreaSeries } from 'lightweight-charts';
import { Icons, Skeleton } from '../../shared/ui';
import { fetchTokenOHLC, fetchTokenMarketData, type OHLCData, type TokenMarketData } from '../../shared/tokenHistory';
import type { UnifiedTokenBalance } from './MainWallet';

interface TokenDetailsProps {
    token: UnifiedTokenBalance;
    onBack: () => void;
    onSend: () => void;
    onReceive: () => void;
    onSwap: () => void;
}

export function TokenDetails({ token, onBack, onSend, onReceive, onSwap }: TokenDetailsProps) {
    // Note: IChartApi in v5 might not have addCandlestickSeries directly on the interface if types are strict, 
    // but the runtime object does. Let's cast or use addSeries if needed, but usually it works.
    // The error "Property 'addCandlestickSeries' does not exist" suggests IChartApi definition might be different or generic.
    // Let's check if we need to import specific series types.

    // Actually, in v4/v5, it should be there. Let's try to verify the type definition.
    // If IChartApi is generic, we might need to specify it.
    // For now, let's use 'any' for the chart ref to bypass the strict type check if it's a library version mismatch issue,
    // or better, let's try to use the correct type if possible.

    // Let's just fix the import first.

    // ...

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null); // Use any to bypass strict type checks for addCandlestickSeries
    const seriesRef = useRef<ISeriesApi<"Candlestick" | "Area"> | null>(null);

    const [chartType, setChartType] = useState<'simple' | 'ohlc'>('simple');
    const [timeframe, setTimeframe] = useState<'hour' | 'day'>('day');
    const [ohlcData, setOhlcData] = useState<OHLCData[]>([]);
    const [marketData, setMarketData] = useState<TokenMarketData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch Data
    useEffect(() => {
        let mounted = true;
        setIsLoading(true);

        console.log('[TokenDetails] Token:', token.symbol, 'networkKind:', token.networkKind, 'networkId:', token.networkId);

        const loadData = async () => {
            // For X1 networks (XNT), use hardcoded $1 price - no price APIs support it
            if (token.networkKind === 'x1') {
                console.log('[TokenDetails] Detected X1 network, using hardcoded $1 price');
                if (mounted) {
                    setOhlcData([]);
                    setMarketData({
                        priceUsd: 1.0,
                        priceChange24h: 0,
                        marketCap: 0, // Unknown for X1
                        volume24h: 0, // Unknown for X1
                    });
                    setIsLoading(false);
                }
                return;
            }

            // Only fetch from APIs for Solana networks
            const [ohlc, market] = await Promise.all([
                fetchTokenOHLC(token.mint, timeframe),
                fetchTokenMarketData(token.mint)
            ]);

            if (mounted) {
                setOhlcData(ohlc);
                setMarketData(market);
                setIsLoading(false);
            }
        };

        loadData();

        return () => { mounted = false; };
    }, [token.mint, token.networkKind, timeframe]);

    // Initialize/Update Chart
    useEffect(() => {
        if (!chartContainerRef.current || ohlcData.length === 0) return;

        // Note: Cleanup is handled by the return function of the previous effect run.
        // We do NOT need to manually check chartRef.current here because the cleanup function
        // will have already removed the chart instance.

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#a1a1aa',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 250,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                mode: 1, // PriceScaleMode.Normal
                autoScale: true,
                alignLabels: true,
                borderVisible: false,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            localization: {
                priceFormatter: (price: number) => {
                    if (price < 0.000001) return price.toExponential(4);
                    if (price < 0.01) return price.toFixed(6);
                    if (price < 1) return price.toFixed(4);
                    return price.toFixed(2);
                },
            },
        });

        if (chartType === 'ohlc') {
            const candlestickSeries = chart.addSeries(
                CandlestickSeries,
                {
                    upColor: '#4ade80',
                    downColor: '#ef4444',
                    borderVisible: false,
                    wickUpColor: '#4ade80',
                    wickDownColor: '#ef4444',
                    priceFormat: {
                        type: 'custom',
                        formatter: (price: number) => {
                            if (price < 0.000001) return price.toExponential(4);
                            if (price < 0.01) return price.toFixed(6);
                            if (price < 1) return price.toFixed(4);
                            return price.toFixed(2);
                        },
                        minMove: 0.00000001,
                    }
                }
            );
            // Cast data to any to avoid strict Time type issues (number vs UTCTimestamp)
            candlestickSeries.setData(ohlcData as any);
            seriesRef.current = candlestickSeries as any;
        } else {
            const areaSeries = chart.addSeries(
                AreaSeries,
                {
                    lineColor: '#22d3ee',
                    topColor: 'rgba(34, 211, 238, 0.4)',
                    bottomColor: 'rgba(34, 211, 238, 0.0)',
                    priceFormat: {
                        type: 'custom',
                        formatter: (price: number) => {
                            if (price < 0.000001) return price.toExponential(4);
                            if (price < 0.01) return price.toFixed(6);
                            if (price < 1) return price.toFixed(4);
                            return price.toFixed(2);
                        },
                        minMove: 0.00000001,
                    }
                }
            );
            // Map OHLC to simple line data (using close price)
            const lineData = ohlcData.map(d => ({ time: d.time, value: d.close }));
            areaSeries.setData(lineData as any);
            seriesRef.current = areaSeries as any;
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null; // Clear the ref
        };
    }, [ohlcData, chartType]);

    const formatCurrency = (val: number) => {
        if (!val) return '$0.00';
        if (val < 0.000001) return `$${val.toExponential(4)}`;
        if (val < 0.01) return `$${val.toFixed(6)}`;
        if (val < 1) return `$${val.toFixed(4)}`;

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 2
        }).format(val);
    };

    const formatCompact = (val: number) => {
        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(val);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-color)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--card-border)' }}>
                <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px', marginRight: '8px' }}>
                    <Icons.ArrowLeft size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src={token.logoURI} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>{token.symbol}</span>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        {marketData ? formatCurrency(marketData.priceUsd) : <Skeleton width={60} height={20} />}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: marketData?.priceChange24h && marketData.priceChange24h >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        {marketData ? `${marketData.priceChange24h > 0 ? '+' : ''}${marketData.priceChange24h.toFixed(2)}%` : <Skeleton width={40} height={16} />}
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {/* Chart and market data only for Solana networks */}
                {token.networkKind !== 'x1' ? (
                    <>
                        {/* Chart Controls */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '2px' }}>
                                <button
                                    onClick={() => setChartType('simple')}
                                    style={{
                                        background: chartType === 'simple' ? 'var(--card-hover)' : 'transparent',
                                        border: 'none', color: chartType === 'simple' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                                    }}
                                >
                                    Line
                                </button>
                                <button
                                    onClick={() => setChartType('ohlc')}
                                    style={{
                                        background: chartType === 'ohlc' ? 'var(--card-hover)' : 'transparent',
                                        border: 'none', color: chartType === 'ohlc' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                                    }}
                                >
                                    Candle
                                </button>
                            </div>
                            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '2px' }}>
                                <button
                                    onClick={() => setTimeframe('hour')}
                                    style={{
                                        background: timeframe === 'hour' ? 'var(--card-hover)' : 'transparent',
                                        border: 'none', color: timeframe === 'hour' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                                    }}
                                >
                                    1H
                                </button>
                                <button
                                    onClick={() => setTimeframe('day')}
                                    style={{
                                        background: timeframe === 'day' ? 'var(--card-hover)' : 'transparent',
                                        border: 'none', color: timeframe === 'day' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                                    }}
                                >
                                    1D
                                </button>
                            </div>
                        </div>

                        {/* Chart Container */}
                        <div
                            ref={chartContainerRef}
                            style={{
                                height: '250px', width: '100%', marginBottom: '24px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            {isLoading && <div className="loading-spinner" />}
                        </div>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Market Cap</div>
                                <div style={{ fontWeight: '600' }}>
                                    {marketData ? `$${formatCompact(marketData.marketCap)}` : <Skeleton width={60} height={20} />}
                                </div>
                            </div>
                            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>24h Volume</div>
                                <div style={{ fontWeight: '600' }}>
                                    {marketData ? `$${formatCompact(marketData.volume24h)}` : <Skeleton width={60} height={20} />}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* X1 network - no market data available */
                    <div style={{
                        background: 'var(--card-bg)',
                        padding: '16px',
                        borderRadius: '12px',
                        border: '1px solid var(--card-border)',
                        marginBottom: '24px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)'
                    }}>
                        <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>X1 Native Token</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>$1.00</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>Hardcoded price (no market data available)</div>
                    </div>
                )}

                {/* Your Balance */}
                <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '16px', border: '1px solid var(--card-border)', marginBottom: '24px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Your Balance</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {(Number(token.amount) / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                        </div>
                        <div style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                            {marketData ? formatCurrency((Number(token.amount) / Math.pow(10, token.decimals)) * marketData.priceUsd) : '...'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons" style={{ padding: '16px', borderTop: '1px solid var(--card-border)', background: 'var(--bg-secondary)' }}>
                <div className="action-button" onClick={onSend}>
                    <div className="action-button-icon"><Icons.Send /></div>
                    <div className="action-button-label">Send</div>
                </div>
                <div className="action-button" onClick={onReceive}>
                    <div className="action-button-icon"><Icons.Receive /></div>
                    <div className="action-button-label">Receive</div>
                </div>
                <div className="action-button" onClick={onSwap}>
                    <div className="action-button-icon"><Icons.Swap /></div>
                    <div className="action-button-label">Swap</div>
                </div>
            </div>
        </div>
    );
}
