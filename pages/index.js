import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { BiSortAlt2 } from 'react-icons/bi';
import { FiRefreshCw } from 'react-icons/fi';
import Header from '../components/Header';

// Time ago function
const timeAgo = (timestamp) => {
  const now = Date.now() / 1000; // Current time in seconds
  const diff = now - timestamp;
  if (diff < 60) return `${Math.floor(diff)} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const Scan = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('DLMM'); // Track active tab
  const [sortOption, setSortOption] = useState('created_at_desc');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Map sortOption to API parameters for DAMM V2 and DLMM
  const getApiSortParams = (option, tab) => {
    if (tab === 'DAMM V2') {
      switch (option) {
        case 'tvl_asc':
          return { order_by: 'tvl', order: 'asc' };
        case 'tvl_desc':
          return { order_by: 'tvl', order: 'desc' };
        case 'created_at_asc':
          return { order_by: 'created_at_slot_timestamp', order: 'asc' };
        case 'created_at_desc':
          return { order_by: 'created_at_slot_timestamp', order: 'desc' };
        default:
          return { order_by: 'created_at_slot_timestamp', order: 'desc' };
      }
    } else if (tab === 'DLMM') {
      switch (option) {
        case 'tvl_asc':
          return { sort_key: 'tvl', order_by: 'asc' };
        case 'tvl_desc':
          return { sort_key: 'tvl', order_by: 'desc' };
        case 'volume_asc':
          return { sort_key: 'volume', order_by: 'asc' };
        case 'volume_desc':
          return { sort_key: 'volume', order_by: 'desc' };
        case 'volume30m_asc':
          return { sort_key: 'volume30m', order_by: 'asc' };
        case 'volume30m_desc':
          return { sort_key: 'volume30m', order_by: 'desc' };
        case 'volume1h_asc':
          return { sort_key: 'volume1h', order_by: 'asc' };
        case 'volume1h_desc':
          return { sort_key: 'volume1h', order_by: 'desc' };
        case 'volume2h_asc':
          return { sort_key: 'volume2h', order_by: 'asc' };
        case 'volume2h_desc':
          return { sort_key: 'volume2h', order_by: 'desc' };
        case 'volume4h_asc':
          return { sort_key: 'volume4h', order_by: 'asc' };
        case 'volume4h_desc':
          return { sort_key: 'volume4h', order_by: 'desc' };
        case 'volume12h_asc':
          return { sort_key: 'volume12h', order_by: 'asc' };
        case 'volume12h_desc':
          return { sort_key: 'volume12h', order_by: 'desc' };
        case 'feetvlratio_asc':
          return { sort_key: 'feetvlratio', order_by: 'asc' };
        case 'feetvlratio_desc':
          return { sort_key: 'feetvlratio', order_by: 'desc' };
        case 'feetvlratio30m_asc':
          return { sort_key: 'feetvlratio30m', order_by: 'asc' };
        case 'feetvlratio30m_desc':
          return { sort_key: 'feetvlratio30m', order_by: 'desc' };
        case 'feetvlratio1h_asc':
          return { sort_key: 'feetvlratio1h', order_by: 'asc' };
        case 'feetvlratio1h_desc':
          return { sort_key: 'feetvlratio1h', order_by: 'desc' };
        case 'feetvlratio2h_asc':
          return { sort_key: 'feetvlratio2h', order_by: 'asc' };
        case 'feetvlratio2h_desc':
          return { sort_key: 'feetvlratio2h', order_by: 'desc' };
        case 'feetvlratio4h_asc':
          return { sort_key: 'feetvlratio4h', order_by: 'asc' };
        case 'feetvlratio4h_desc':
          return { sort_key: 'feetvlratio4h', order_by: 'desc' };
        case 'feetvlratio12h_asc':
          return { sort_key: 'feetvlratio12h', order_by: 'asc' };
        case 'feetvlratio12h_desc':
          return { sort_key: 'feetvlratio12h', order_by: 'desc' };
        case 'lm_asc':
          return { sort_key: 'lm', order_by: 'asc' };
        case 'lm_desc':
          return { sort_key: 'lm', order_by: 'desc' };
        default:
          return { sort_key: 'volume', order_by: 'desc' };
      }
    }
    return { order_by: 'volume1h', order: 'asc' };
  };

  // Fetch data for DAMM V2 tab
  const fetchDammV2Tokens = async (search) => {
    try {
      setLoading(true);
      const { order_by, order } = getApiSortParams(sortOption, 'DAMM V2');
      const url = new URL(`https://dammv2-api.meteora.ag/pools`);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', '50'); // default limit for DAMM V2 pools
      url.searchParams.set('offset', '0'); // default offset for DAMM V2 pools
      url.searchParams.set('order_by', order_by);
      url.searchParams.set('order', order);

      if (search) {
        const trimmed = search.trim();
        const isPossibleMint = /^[-_a-zA-Z0-9]{32,44}$/.test(trimmed); // kira-kira pattern base58
        if (isPossibleMint) {
          url.searchParams.set('token_a_mint', trimmed);
        } else {
          url.searchParams.set('token_a_symbol', trimmed.toUpperCase());
        }
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch DAMM V2 data');
      const { data } = await response.json();

      const mappedTokens = data.map((pool, index) => {
        const baseFeeValue = Number(pool.base_fee);
        const dynamicFeeValue = Number(pool.dynamic_fee);

        return {
          id: index + 1,
          symbol: pool.token_a_symbol,
          poolName: pool.pool_name,
          poolAddress: pool.pool_address,
          contract: pool.token_a_mint,
          imageUri: 'https://prod-tensor-creators-s3.s3.us-east-1.amazonaws.com/image/adf0c9f9-8438-4ed3-862a-b82d8f380495',
          TVL: Number(pool.tvl) || 0, // Ensure TVL is a number
          '24Fee': Number(pool.fee24h) || 0, // Ensure fee is a number
          createdAt: timeAgo(pool.created_at_slot_timestamp),
          timestamp: pool.created_at_slot_timestamp,
          binStep: null,
          baseFee: Number.isFinite(baseFeeValue) ? baseFeeValue : null,
          dynamicFee: Number.isFinite(dynamicFeeValue) ? dynamicFeeValue : null,
        };
      });

      const uniqueTokens = Array.from(
        new Map(mappedTokens.map((token) => [token.poolName, token])).values()
      );

      setTokens(uniqueTokens);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError('Error fetching DAMM V2 token data. Please try again later.');
    }
  };

  // Fetch data for DLMM tab
  const fetchDlmmTokens = async (search) => {
    try {
      setLoading(true);
      const { sort_key, order_by } = getApiSortParams(sortOption, 'DLMM');
      const url = new URL(`https://dlmm-api.meteora.ag/pair/all_by_groups`);
      url.searchParams.set('page', '0');
      url.searchParams.set('limit', '5');
      // url.searchParams.set('hide_low_apr', true);
      url.searchParams.set('sort_key', sort_key);
      url.searchParams.set('order_by', order_by);

      if (search) {
        const trimmed = search.trim();
        url.searchParams.set('search_term', trimmed);
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch DLMM data');
      const data = await response.json();

      const groups = Array.isArray(data.groups) ? data.groups : [];
      const flattenedPairs = groups.flatMap((group) => group.pairs || []);

      const mappedTokens = flattenedPairs.map((pair, index) => {
        const poolName = `${pair.name || 'Unknown'}`;
        const timestamp = Math.floor(Date.now() / 1000); // Placeholder since created_at is not available

        // Normalize TVL and fees to two decimal places for consistent USD formatting
        const tvl = Number(pair.liquidity) ? Number(Number(pair.liquidity).toFixed(2)) : 0;
        const fees = Number(pair.fees_24h) ? Number(Number(pair.fees_24h).toFixed(2)) : 0;
        const symbol = pair.name ? pair.name.split('-')[0] : 'Unknown';
        const baseFeeValue = Number(pair.base_fee_percentage);
        const binStepValue = Number(pair.bin_step);

        return {
          id: index + 1,
          symbol,
          poolName,
          poolAddress: pair.address,
          contract: pair.mint_x || '',
          imageUri: 'https://prod-tensor-creators-s3.s3.us-east-1.amazonaws.com/image/adf0c9f9-8438-4ed3-862a-b82d8f380495',
          TVL: tvl,
          '24Fee': fees,
          createdAt: '-',
          timestamp,
          binStep: Number.isFinite(binStepValue) ? binStepValue : null,
          baseFee: Number.isFinite(baseFeeValue) ? baseFeeValue : null,
        };
      });

      setTokens(mappedTokens);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      console.error('Error in fetchDlmmTokens:', err);
      setError('Error fetching DLMM token data. Please try again later.');
    }
  };

  // Handle tab switch
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setTokens([]); // Clear tokens when switching tabs
    if (tab === 'DAMM V2') {
      fetchDammV2Tokens(searchTerm);
    } else if (tab === 'DLMM') {
      fetchDlmmTokens(searchTerm);
    }
  };

  // Handle sort option selection
  const handleSortSelect = (option) => {
    setSortOption(option);        // ini akan trigger useEffect
    setIsDropdownOpen(false);
    setTokens([]);                // kosongkan data lama
    setLoading(true);
  };

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setIsAutoRefresh(!isAutoRefresh);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch data on component mount and set up auto-refresh
  useEffect(() => {
    if (activeTab === 'DAMM V2') {
      fetchDammV2Tokens(searchTerm);
    } else if (activeTab === 'DLMM') {
      fetchDlmmTokens(searchTerm);
    }

    let intervalId = null;
    if (isAutoRefresh) {
      intervalId = setInterval(() => {
        if (activeTab === 'DAMM V2') {
          fetchDammV2Tokens(searchTerm);
        } else if (activeTab === 'DLMM') {
          fetchDlmmTokens(searchTerm);
        }
      }, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutoRefresh, activeTab, sortOption, searchTerm]);

  const pageTitle = "Metina | Dive Deep into Solana's Liquidity";
  const pageDescription =
    "Monitor Meteora DLMM and DAMM V2 liquidity pools in real time. Compare TVL, fees, and volume across Solana markets with smart filters and auto-refresh.";
  const pageUrl = "https://metina.id/";
  const previewImage = `${pageUrl}img/logo.svg`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="title" content={pageTitle} />
        <meta name="description" content={pageDescription} />
        <meta
          name="keywords"
          content="Metina, Solana, DLMM, DAMM V2, liquidity pools, DeFi analytics, TVL tracker, fees, volume, crypto scanner"
        />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Metina" />
        <link rel="canonical" href={pageUrl} />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={previewImage} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={previewImage} />
      </Head>

      <div className="min-h-screen bg-black text-white">
      <Header />

      <div className="w-full max-w-full md:max-w-[1320px] mx-auto px-4 md:px-6">
        {/* Title Section */}
        <div className="text-center py-4 mt-7">
          <h1 className="text-2xl md:text-3xl font-mono mb-2">Dive Deep into Solana's Liquidity</h1>
          <p className="text-gray-400 text-xs md:text-base">
            Scan Fast • Deepest Liquidity • Trade Smart
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col md:flex-row items-center justify-between py-3 text-base gap-4">
          <div className="w-full md:w-auto flex flex-wrap justify-center md:justify-start gap-4 md:gap-6 items-center">
          <button
            className={`text-xs sm:text-sm hover:opacity-80 ${activeTab === 'DLMM' ? 'text-orange-500' : 'text-gray-400'}`}
            onClick={() => handleTabSwitch('DLMM')}
          >
            DLMM
          </button>
          <button
            className={`text-xs sm:text-sm hover:opacity-80 ${activeTab === 'DAMM V2' ? 'text-orange-500' : 'text-gray-400'}`}
            onClick={() => handleTabSwitch('DAMM V2')}
          >
            DAMM V2
          </button>
        </div>

        <div className="w-full md:flex-1 md:mx-6">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by contract address, name, or symbol"
            className="w-full bg-black border border-gray-700 rounded text-gray-400 px-4 py-2 text-xs sm:text-sm hover:border-orange-500 focus:outline-none focus:text-white focus:border-orange-500"
          />
        </div>

        <div className="w-full md:w-auto flex justify-center md:justify-end space-x-6">
          <button
            className={`text-xs sm:text-sm hover:opacity-80 flex items-center gap-2 ${
              isAutoRefresh ? 'text-orange-500' : 'text-gray-400'
            }`}
            onClick={toggleAutoRefresh}
            title={isAutoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            <FiRefreshCw className="text-lg" /> Auto-Refresh
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              className="text-gray-400 text-xs sm:text-sm hover:opacity-80 flex items-center gap-2"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <BiSortAlt2 className="text-lg" /> Sort By
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 border border-gray-700 bg-[#18181a] rounded-md shadow-lg z-10">
                <button
                  className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                    sortOption === 'tvl_asc'
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={() => handleSortSelect('tvl_asc')}
                >
                  TVL Asc
                </button>
                <button
                  className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                    sortOption === 'tvl_desc'
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={() => handleSortSelect('tvl_desc')}
                >
                  TVL Desc
                </button>

                {activeTab === 'DAMM V2' && (
                  <>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'created_at_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('created_at_asc')}
                    >
                      Created At Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'created_at_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('created_at_desc')}
                    >
                      Created At Desc
                    </button>
                  </>
                )}

                {activeTab === 'DLMM' && (
                  <>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume_asc')}
                    >
                      Volume Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume_desc')}
                    >
                      Volume Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume30m_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume30m_asc')}
                    >
                      Volume 30m Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume30m_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume30m_desc')}
                    >
                      Volume 30m Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume1h_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume1h_asc')}
                    >
                      Volume 1h Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume1h_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume1h_desc')}
                    >
                      Volume 1h Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume2h_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume2h_asc')}
                    >
                      Volume 2h Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume2h_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume2h_desc')}
                    >
                      Volume 2h Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume4h_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume4h_asc')}
                    >
                      Volume 4h Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume4h_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume4h_desc')}
                    >
                      Volume 4h Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume12h_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume12h_asc')}
                    >
                      Volume 12h Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'volume12h_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('volume12h_desc')}
                    >
                      Volume 12h Desc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'lm_asc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('lm_asc')}
                    >
                      LM Asc
                    </button>
                    <button
                      className={`block w-full text-left px-4 py-2 text-xs sm:text-sm ${
                        sortOption === 'lm_desc'
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSortSelect('lm_desc')}
                    >
                      LM Desc
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Loading and Error States */}
      {loading && (
        <div className="text-center py-10">
          <p className="text-gray-400">Loading {activeTab} token data...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-10">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="px-2 md:px-6 overflow-x-auto w-full max-w-full md:max-w-[1320px] mx-auto">
          <div className="min-w-[720px] md:min-w-[1200px]">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800">
                  <th className="text-left py-3 px-2 font-normal w-[50px]">★</th>
                  <th className="text-left px-2 font-normal w-[150px] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Token
                      <svg
                        stroke="currentColor"
                        fill="currentColor"
                        strokeWidth="0"
                        viewBox="0 0 16 16"
                        focusable="false"
                        className="chakra-icon css-4b5shc"
                        height="1em"
                        width="1em"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M5.5 9.511c.076.954.83 1.697 2.182 1.785V12h.6v-.709c1.4-.098 2.218-.846 2.218-1.932 0-.987-.626-1.496-1.745-1.76l-.473-.112V5.57c.6.068.982.396 1.074.85h1.052c-.076-.919-.864-1.638-2.126-1.716V4h-.6v.719c-1.195.117-2.01.836-2.01 1.853 0 .9.606 1.472 1.613 1.707l.397.098v2.034c-.615-.093-1.022-.43-1.114-.9H5.5zm2.177-2.166c-.59-.137-.91-.416-.91-.836 0-.47.345-.822.915-.925v1.76h-.005zm.692 1.193c.717.166 1.048.435 1.048.91 0 .542-.412.914-1.135.982V8.518l.087.02z"></path>
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                        <path d="M8 13.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm0 .5A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"></path>
                      </svg>
                    </span>
                  </th>
                  <th className="text-right px-2 font-normal w-[100px] whitespace-nowrap">Pool Name</th>
                  {activeTab === 'DAMM V2' && (
                    <>
                      <th className="text-right px-2 font-normal w-[120px] whitespace-nowrap">Base Fee</th>
                      <th className="text-right px-2 font-normal w-[120px] whitespace-nowrap">Dynamic Fee</th>
                    </>
                  )}
                  {activeTab === 'DLMM' && (
                    <>
                      <th className="text-right px-2 font-normal w-[120px] whitespace-nowrap">Bin Step</th>
                      <th className="text-right px-2 font-normal w-[120px] whitespace-nowrap">Base Fee</th>
                    </>
                  )}
                  <th className="text-right px-2 font-normal w-[100px] whitespace-nowrap">TVL</th>
                  <th className="text-right px-2 font-normal w-[100px] whitespace-nowrap">24H Fee</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="border-b border-gray-800/50 hover:bg-[#1e2025]">
                    <td className="py-4 px-2 whitespace-nowrap">☆ {token.id}</td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="text-white text-xs sm:text-sm truncate">{token.poolName}</div>
                          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 text-xs overflow-x-auto">
                            {/* <span className="text-gray-400">{token.symbol}</span> */}
                            <a
                              href={`https://www.jup.ag/tokens/${token.contract}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-500 hover:underline whitespace-nowrap"
                            >
                              Jupiter
                            </a>
                            <a
                              href={`https://www.meteora.ag/${activeTab === 'DLMM' ? 'dlmm' : 'dammv2'}/${token.poolAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-500 hover:underline whitespace-nowrap"
                            >
                              Meteora
                            </a>
                            <a
                              href={`https://www.gmgn.ai/sol/token/${token.contract}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-500 hover:underline whitespace-nowrap"
                            >
                              GMGN
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-2 whitespace-nowrap">{token.poolName}</td>
                    {activeTab === 'DAMM V2' && (
                      <>
                        <td className="text-right px-2 whitespace-nowrap">
                          {token.baseFee !== null ? `${token.baseFee.toFixed(2)}%` : '-'}
                        </td>
                        <td className="text-right px-2 whitespace-nowrap">
                          {token.dynamicFee !== null ? `${token.dynamicFee.toFixed(2)}%` : '-'}
                        </td>
                      </>
                    )}
                    {activeTab === 'DLMM' && (
                      <>
                        <td className="text-right px-2 whitespace-nowrap">
                          {token.binStep !== null ? token.binStep : '-'}
                        </td>
                        <td className="text-right px-2 whitespace-nowrap">
                          {token.baseFee !== null ? `${token.baseFee.toFixed(2)}%` : '-'}
                        </td>
                      </>
                    )}
                    <td className="text-right px-2 whitespace-nowrap">
                      {token.TVL.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-right px-2 whitespace-nowrap">
                      {token['24Fee'].toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </>
  );
};

export default Scan;
