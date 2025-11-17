import React, { useState } from 'react';
import Head from 'next/head';
import Header from '../components/Header';

const PnlCard = () => {
  const [transactionInput, setTransactionInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pnlData, setPnlData] = useState(null);
  const [error, setError] = useState(null);

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
      
      // TODO: Implement actual PNL calculation logic
      // For now, simulate with mock data
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock PNL data - replace with actual API call
      const mockPnlData = {
        transactionId: txId,
        positionType: 'DLMM',
        entryPrice: 0.000123,
        exitPrice: 0.000145,
        profitLoss: '+17.89%',
        profitLossAmount: '+0.0234 SOL',
        timestamp: new Date().toISOString(),
      };
      
      setPnlData(mockPnlData);
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

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-3 bg-red-900/20 border border-red-500 rounded-md text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isGenerating && (
            <div className="mb-3 text-center text-gray-400 text-xs">
              Generating PNL card...
            </div>
          )}

          {/* PNL Card Display */}
          {pnlData && (
            <div className="mt-4 p-4 bg-gray-900 border border-gray-700 rounded-md">
              <h3 className="text-lg font-semibold mb-3 text-orange-500">PNL Card</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Transaction ID:</span>
                  <span className="text-white font-mono text-xs">{pnlData.transactionId.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Position Type:</span>
                  <span className="text-white">{pnlData.positionType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Entry Price:</span>
                  <span className="text-white">{pnlData.entryPrice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Exit Price:</span>
                  <span className="text-white">{pnlData.exitPrice}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-gray-400">Profit/Loss:</span>
                  <span className="text-green-400 font-semibold">{pnlData.profitLoss}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="text-green-400 font-semibold">{pnlData.profitLossAmount}</span>
                </div>
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

