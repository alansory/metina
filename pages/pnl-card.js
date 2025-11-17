import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import html2canvas from 'html2canvas';

const HELIUS_RPC_URL =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_HELIUS_RPC ||
  'https://mainnet.helius-rpc.com/?api-key=6a74938d-a838-4cd5-9fa9-c0af927c6bda';
const METEORA_API_BASE = 'https://dlmm-api.meteora.ag';
const JUPITER_TOKEN_SEARCH = 'https://lite-api.jup.ag/tokens/v2/search?query=';
const DLMM_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const LAMPORTS_PER_SOL = 1_000_000_000;

const PnlCard = () => {
  const [transactionInput, setTransactionInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pnlData, setPnlData] = useState(null);
  const [error, setError] = useState(null);
  const [customBackgroundDataUrl, setCustomBackgroundDataUrl] = useState('');
  const [backgroundError, setBackgroundError] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cachedUpload = window.localStorage.getItem('metina-pnl-bg-upload');

    if (cachedUpload) {
      setCustomBackgroundDataUrl(cachedUpload);
    }
  }, []);

  const handleBackgroundUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBackgroundError('Please select a valid image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setBackgroundError('Image size must be 5MB or less.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;

      if (typeof result === 'string') {
        setCustomBackgroundDataUrl(result);
        setBackgroundError(null);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem('metina-pnl-bg-upload', result);
        }
      }
    };

    reader.onerror = () => {
      setBackgroundError('Failed to read image file.');
    };

    reader.readAsDataURL(file);
  };

  const clearCustomBackground = () => {
    setCustomBackgroundDataUrl('');
    setBackgroundError(null);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('metina-pnl-bg-upload');
    }
  };

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const calculateDuration = (openTime, closeTime) => {
    if (!openTime || !closeTime) return '00:00:00';
    const open = new Date(openTime).getTime();
    const close = new Date(closeTime).getTime();
    const durationSeconds = Math.floor((close - open) / 1000);
    return formatDuration(durationSeconds);
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '$0';

    const numericValue = Number(String(value).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(numericValue)) return '$0';

    const roundedValue = numericValue >= 0 ? Math.ceil(numericValue) : Math.floor(numericValue);
    const absoluteValue = Math.abs(roundedValue);

    return roundedValue < 0 ? `-$${absoluteValue}` : `$${absoluteValue}`;
  };

  const isProfit = (pnlData) => {
    if (!pnlData) return false;
    const profitLossUSD = pnlData.profitLossUSD || pnlData.profitLossAmount || '0';
    const profitLossPercent = pnlData.profitLoss || '0%';
    // Check if USD value is positive or percentage doesn't start with '-'
    const usdValue = String(profitLossUSD).replace(/[^0-9.-]/g, '');
    const percentValue = String(profitLossPercent);
    return !usdValue.startsWith('-') && !percentValue.startsWith('-') && 
           (parseFloat(usdValue) > 0 || parseFloat(percentValue.replace('%', '')) > 0);
  };

  const extractTxId = (input) => {
    // Extract transaction ID from various formats
    // Solscan: https://solscan.io/tx/{txId}
    // SolBeach: https://solbeach.io/tx/{txId}
    // SolExplorer: https://explorer.solana.com/tx/{txId}
    // SolanaFM: https://solana.fm/tx/{txId}
    // OKLink: https://www.oklink.com/sol/tx/{txId}
    
    const patterns = [
      /solscan\.io\/tx\/([A-Za-z0-9]+)/,
      /solbeach\.io\/tx\/([A-Za-z0-9]+)/,
      /explorer\.solana\.com\/tx\/([A-Za-z0-9]+)/,
      /solana\.fm\/tx\/([A-Za-z0-9]+)/,
      /oklink\.com\/sol\/tx\/([A-Za-z0-9]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1];
    }
    
    // If no URL pattern matches, assume it's a direct tx ID
    return input.trim();
  };

  const getCoinName = (pnlData) => {
    // Try to get coin name from various possible fields
    const coinName = pnlData?.coinName || pnlData?.symbol || pnlData?.coin || pnlData?.tokenSymbol;
    
    if (coinName) {
      // Clean the coin name for filename (remove special characters)
      return coinName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }
    
    return 'COIN';
  };

  const fetchJson = async (url, { defaultValue = undefined, ...options } = {}) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.warn(`Failed to fetch ${url}:`, err.message);
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw err;
    }
  };

  const fetchHeliusTransaction = async (txId) => {
    const body = {
      jsonrpc: '2.0',
      id: 'metina-pnl',
      method: 'getTransaction',
      params: [
        txId,
        {
          maxSupportedTransactionVersion: 0,
          encoding: 'jsonParsed',
        },
      ],
    };

    return fetchJson(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const extractPositionAddress = (heliusTx) => {
    const instructions = heliusTx?.transaction?.message?.instructions || [];
    for (let idx = instructions.length - 1; idx >= 0; idx -= 1) {
      const instruction = instructions[idx];
      if (
        instruction?.programId === DLMM_PROGRAM_ID &&
        Array.isArray(instruction.accounts) &&
        instruction.accounts.length > 0
      ) {
        return instruction.accounts[0];
      }
    }

    const innerInstructions = heliusTx?.meta?.innerInstructions || [];
    for (const inner of innerInstructions) {
      for (const instruction of inner.instructions || []) {
        if (
          instruction?.programId === DLMM_PROGRAM_ID &&
          Array.isArray(instruction.accounts) &&
          instruction.accounts.length > 0
        ) {
          return instruction.accounts[0];
        }
      }
    }

    return null;
  };

  const sumUsd = (items = []) =>
    items.reduce(
      (total, item) =>
        total +
        Number(item?.token_x_usd_amount || 0) +
        Number(item?.token_y_usd_amount || 0),
      0
    );

  const sumTokenAmount = (items = [], field) =>
    items.reduce((total, item) => total + Number(item?.[field] || 0), 0);

  const getTimestampRange = (items = []) => {
    if (!items.length) {
      return { earliest: null, latest: null };
    }

    let earliest = Number.MAX_SAFE_INTEGER;
    let latest = 0;

    items.forEach((item) => {
      const ts = Number(item?.onchain_timestamp);
      if (!Number.isFinite(ts)) return;
      earliest = Math.min(earliest, ts);
      latest = Math.max(latest, ts);
    });

    return {
      earliest: earliest === Number.MAX_SAFE_INTEGER ? null : earliest,
      latest: latest === 0 ? null : latest,
    };
  };

  const buildPnlPayload = ({
    txId,
    heliusTx,
    position,
    deposits,
    withdraws,
    claimRewards,
    claimFees,
    pairInfo,
    tokenInfo,
  }) => {
    const totalDepositUsd = sumUsd(deposits);
    const totalWithdrawUsd = sumUsd(withdraws);
    const totalFeeUsd = sumUsd(claimFees);
    const totalRewardUsd = sumUsd(claimRewards);

    const depositSol = sumTokenAmount(deposits, 'token_y_amount') / LAMPORTS_PER_SOL;
    const withdrawSol = sumTokenAmount(withdraws, 'token_y_amount') / LAMPORTS_PER_SOL;
    const feeSol = sumTokenAmount(claimFees, 'token_y_amount') / LAMPORTS_PER_SOL;

    const profitLossUSD = totalWithdrawUsd + totalFeeUsd + totalRewardUsd - totalDepositUsd;
    const profitLossPercent =
      totalDepositUsd > 0
        ? `${((profitLossUSD / totalDepositUsd) * 100).toFixed(2)}%`
        : '0%';
    const profitLossAmountSOL = withdrawSol + feeSol - depositSol;

    const depositTimestamps = getTimestampRange(deposits);
    const withdrawTimestamps = getTimestampRange(withdraws);

    const openTimestamp =
      depositTimestamps.earliest ||
      heliusTx?.blockTime ||
      depositTimestamps.latest ||
      null;
    const closeTimestamp =
      withdrawTimestamps.latest ||
      heliusTx?.blockTime ||
      depositTimestamps.latest ||
      openTimestamp;

    const entryPrice = deposits?.[0]?.price || null;
    const exitPrice = withdraws?.[withdraws.length - 1]?.price || null;

    const coinName =
      tokenInfo?.symbol ||
      tokenInfo?.name ||
      pairInfo?.name?.split('-')?.[0] ||
      position?.pair_address ||
      'DLMM';
    const pairName = pairInfo?.name || 'DLMM';

    // TVL shown on card should reflect the user's total capital deposited
    const tvl = totalDepositUsd.toFixed(2);

    const openTimeISO = openTimestamp ? new Date(openTimestamp * 1000).toISOString() : null;
    const closeTimeISO = closeTimestamp ? new Date(closeTimestamp * 1000).toISOString() : null;

    return {
      transactionId: txId,
      positionAddress: position?.address,
      positionType: 'DLMM',
      coinName,
      entryPrice: entryPrice ? Number(entryPrice).toFixed(9) : null,
      exitPrice: exitPrice ? Number(exitPrice).toFixed(9) : null,
      profitLoss: profitLossPercent,
      profitLossAmount: profitLossUSD.toFixed(2),
      profitLossAmountSOL: profitLossAmountSOL.toFixed(3),
      profitLossUSD: profitLossUSD.toFixed(2),
      pairName,
      openTime: openTimeISO,
      closeTime: closeTimeISO,
      duration:
        openTimeISO && closeTimeISO
          ? calculateDuration(openTimeISO, closeTimeISO)
          : null,
      binStep: pairInfo?.bin_step,
      baseFee: pairInfo?.base_fee_percentage
        ? `${pairInfo.base_fee_percentage}%`
        : null,
      tvl: Number(tvl).toLocaleString(undefined, { maximumFractionDigits: 0 }),
      owner: position?.owner,
      pairAddress: position?.pair_address,
      totalDepositUsd: totalDepositUsd.toFixed(2),
      totalWithdrawUsd: totalWithdrawUsd.toFixed(2),
      totalFeeUsd: totalFeeUsd.toFixed(4),
      totalRewardUsd: totalRewardUsd.toFixed(4),
      raw: {
        position,
        deposits,
        withdraws,
        claimRewards,
        claimFees,
        pairInfo,
        tokenInfo,
        heliusTx,
      },
    };
  };

  const handleCopyImage = async () => {
    try {
      if (!cardRef.current) return;

      const cardElement = cardRef.current.querySelector('[data-pnl-card]');
      if (!cardElement) return;

      // Use html2canvas to capture the entire card with overlay text
      const canvas = await html2canvas(cardElement, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
        } catch (err) {
          console.error('Failed to copy image:', err);
        }
      });
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  const handleDownloadImage = async () => {
    try {
      if (!cardRef.current) return;

      const cardElement = cardRef.current.querySelector('[data-pnl-card]');
      if (!cardElement) return;

      // Use html2canvas to capture the entire card with overlay text
      const canvas = await html2canvas(cardElement, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const coinName = getCoinName(pnlData);
        link.download = `${coinName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      console.error('Failed to download image:', err);
    }
  };

  const handleGeneratePnl = async () => {
    if (!transactionInput.trim()) {
      setError('Please enter a transaction ID or link');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setPnlData(null);

    try {
      const txId = extractTxId(transactionInput);

      const heliusResponse = await fetchHeliusTransaction(txId);
      const heliusTx = heliusResponse?.result;

      if (!heliusTx) {
        throw new Error('Transaction not found on Helius');
      }

      const positionAddress = extractPositionAddress(heliusTx);
      if (!positionAddress) {
        throw new Error('Unable to detect DLMM position from transaction');
      }

      const positionUrl = `${METEORA_API_BASE}/position/${positionAddress}`;
      const [position, deposits, claimRewards, claimFees, withdraws] = await Promise.all([
        fetchJson(positionUrl),
        fetchJson(`${positionUrl}/deposits`, { defaultValue: [] }),
        fetchJson(`${positionUrl}/claim_rewards`, { defaultValue: [] }),
        fetchJson(`${positionUrl}/claim_fees`, { defaultValue: [] }),
        fetchJson(`${positionUrl}/withdraws`, { defaultValue: [] }),
      ]);

      const pairInfo = await fetchJson(
        `${METEORA_API_BASE}/pair/${position?.pair_address}`,
        { defaultValue: null }
      );

      const tokenSearch = position?.pair_address && pairInfo?.mint_x
        ? await fetchJson(`${JUPITER_TOKEN_SEARCH}${pairInfo.mint_x}`, { defaultValue: [] })
        : [];

      const tokenInfo = Array.isArray(tokenSearch) ? tokenSearch[0] : null;

      const payload = buildPnlPayload({
        txId,
        heliusTx,
        position,
        deposits,
        withdraws,
        claimRewards,
        claimFees,
        pairInfo,
        tokenInfo,
      });

      setPnlData(payload);
    } catch (err) {
      setError(err.message || 'Failed to generate PNL card');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Metina | PNL Card</title>
        <link rel="icon" href="/img/logo-gram.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-black text-white">
        <Header />

        <div className="w-full max-w-2xl mx-auto px-4 py-6">
          {/* Tab */}
          <div className="flex justify-center mb-4">
            <button className="px-4 py-1.5 rounded-md font-medium text-xs text-white bg-gray-900 border border-orange-500">
              DLMM
            </button>
          </div>

          {/* Input Field */}
          <div className="relative mb-3">
            <input
              type="text"
              value={transactionInput}
              onChange={(e) => setTransactionInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGeneratePnl()}
              placeholder="Put your transaction here"
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
            />
            <button
              onClick={handleGeneratePnl}
              disabled={isGenerating}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-gray-400 hover:text-orange-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Generate PNL card"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </button>
          </div>

          {/* Custom Background Field */}
          <div className="flex justify-center mb-4 space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Upload background image (cached in browser, max 5MB)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="block w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-orange-500/10 file:text-orange-400 hover:file:bg-orange-500/20"
              />
            </div>

            {customBackgroundDataUrl && (
              <button
                type="button"
                onClick={clearCustomBackground}
                className="text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2"
              >
                Clear custom background
              </button>
            )}

            {backgroundError && (
              <p className="text-xs text-red-400">{backgroundError}</p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-3 bg-red-900/20 border border-red-500 rounded-md text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isGenerating && (
            <div className="mb-3 flex flex-col items-center gap-2 text-center">
              <svg
                className="w-8 h-8 text-orange-500 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
              <div className="text-gray-400 text-xs">
                Generating PNL card...
              </div>
            </div>
          )}

          {/* PNL Card Display with Image */}
          {pnlData && (
            <div className="mt-4" ref={cardRef}>
              <div className="overflow-x-auto">
                <div className="relative w-[720px] md:w-full" data-pnl-card>
                  <img
                    src={
                      customBackgroundDataUrl ||
                      (isProfit(pnlData) ? '/img/win-v4.png' : '/img/loss-v4.png')
                    }
                    alt="PNL Card"
                    className="w-full h-auto rounded-md"
                  />

                  {/* Overlay Text */}
                  <div className="absolute inset-0 p-6">
                    {/* Top Left - Time */}
                    <div className="absolute top-6 left-6">
                      <div className="text-gray-400 text-sm font-medium mb-1">TIME</div>
                      <div className="text-white text-2xl font-bold font-mono tracking-wider">
                        {pnlData.duration || '00:00:00'}
                      </div>
                    </div>

                    {/* Left Side - DLMM and Profit/Loss */}
                    <div className="absolute top-24 left-6">
                      <div className="text-gray-400 text-sm font-medium mb-1">
                        DLMM
                      </div>
                      <div className="text-white text-2xl font-bold mb-4">
                       {pnlData.pairName}
                      </div>
                      <div className="text-gray-400 text-sm font-medium mb-1">
                        {isProfit(pnlData) ? 'PROFIT (USD)' : 'LOSS (USD)'}
                      </div>
                      <div className={`text-5xl font-bold ${isProfit(pnlData) ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(pnlData.profitLossUSD || pnlData.profitLossAmount || '-271')}
                      </div>
                    </div>

                    {/* Top Center - Hashtag */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2">
                      <div className="text-gray-400 text-base font-medium">
                        {isProfit(pnlData) ? '#GUDFEETEK' : '#SKILLISSUE'}
                      </div>
                    </div>

                    {/* Bottom Left - Links */}
                    {/* <div className="absolute bottom-20 left-6 space-y-1 text-white text-xs leading-tight">
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-white shrink-0"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        <span>X.COM/METINAID</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-white shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="2" y1="12" x2="22" y2="12"></line>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        <span>WWW.METINA.ID</span>
                      </div>
                    </div> */}

                    {/* Top Right - Links */}
                    <div className="absolute top-6 right-6 space-y-1 text-white text-xs leading-tight text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span>X.COM/METINAID</span>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <span>WWW.METINA.ID</span>
                      </div>
                    </div>


                    {/* Bottom Row - TVL, BIN STEP, BASE FEE, PNL (sejajar horizontal) */}
                    <div className="absolute bottom-2 left-6 right-6">
                      <div className="flex justify-between items-end">
                        {/* TVL */}
                        <div>
                          <div className="text-gray-400 text-xs mb-0.5">TVL</div>
                          <div className="text-white text-base font-medium">${pnlData.tvl || '277'}</div>
                        </div>

                        {/* BIN STEP */}
                        <div className="text-center">
                          <div className="text-gray-400 text-xs mb-0.5">BIN STEP</div>
                          <div className="text-white text-base font-medium">{pnlData.binStep || '80'}</div>
                        </div>

                        {/* BASE FEE */}
                        <div className="text-center">
                          <div className="text-gray-400 text-xs mb-0.5">BASE FEE</div>
                          <div className="text-white text-base font-medium">{pnlData.baseFee || '2%'}</div>
                        </div>

                        {/* PNL */}
                        <div className="text-right">
                          <div className="text-gray-400 text-xs mb-0.5">PNL</div>
                          <div className={`text-base font-medium ${isProfit(pnlData) ? 'text-green-500' : 'text-red-500'}`}>
                            {pnlData.profitLoss || '-97.85%'}
                          </div>
                        </div>
                      </div>
                      {/* <div className="flex justify-center">
                        <div className="text-gray-400 text-xs mb-0.5">DEV YANMAN & DESIGN NAOJ</div>
                      </div> */}
                      <div className="flex justify-center">
                        <div className="text-gray-400 text-xs mb-0.5">
                        {customBackgroundDataUrl ? 'DEV YANMAN' : 'DEV YANMAN & DESIGN NAOJ'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Copy and Download Buttons */}
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={handleCopyImage}
                  className="p-2 bg-gray-900 border border-gray-700 rounded-md hover:border-orange-500 transition text-white"
                  aria-label="Copy image"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button
                  onClick={handleDownloadImage}
                  className="p-2 bg-gray-900 border border-gray-700 rounded-md hover-border-orange-500 transition text-white"
                  aria-label="Download image"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Instructional Text */}
          <p className="text-gray-400 text-xs text-center mt-4">
            Paste a DLMM tx For opening, claiming, or closing a position. Supports links (Solscan, SolBeach, SolExplorer, SolanaFM, OKLink) and tx IDs
          </p>
        </div>
      </div>
    </>
  );
};

export default PnlCard;

