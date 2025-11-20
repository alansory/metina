import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Connection, PublicKey } from '@solana/web3.js';

// Dynamically import SDK to avoid SSR issues
let DLMM;
let getUnClaimLpFee; // Function to calculate unclaimed fees
if (typeof window !== 'undefined') {
  import('@meteora-ag/dlmm').then((module) => {
    // Import default export as DLMM
    DLMM = module.default || module;
    // Import getUnClaimLpFee as named export
    if (module.getUnClaimLpFee && typeof module.getUnClaimLpFee === 'function') {
      getUnClaimLpFee = module.getUnClaimLpFee;
      console.log('[SDK Import] ✓ Found getUnClaimLpFee as named export');
    } else {
      console.warn('[SDK Import] getUnClaimLpFee not found as named export. Available exports:', Object.keys(module));
    }
  });
}

const HELIUS_RPC_URL =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_HELIUS_RPC ||
  'https://mainnet.helius-rpc.com/?api-key=6a74938d-a838-4cd5-9fa9-c0af927c6bda';
const METEORA_API_BASE = 'https://dlmm-api.meteora.ag';
const DLMM_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_EXCHANGE_RATES = { USD: 1, IDR: 16_700, SOL: 150 };
const CURRENCY_OPTIONS = ['USD', 'IDR', 'SOL'];
const SOL_MINTS = [
  'So11111111111111111111111111111111111111112', // Wrapped SOL
  '11111111111111111111111111111111', // Native SOL mint
];
const JUPITER_API_BASE = 'https://lite-api.jup.ag/swap/v1';

const Portfolio = () => {
  const [addressInput, setAddressInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState(null);
  const [currency, setCurrency] = useState('USD');
  const [exchangeRates, setExchangeRates] = useState(DEFAULT_EXCHANGE_RATES);
  const [useRealtime, setUseRealtime] = useState(true); // Toggle for realtime vs API
  const [lastUpdate, setLastUpdate] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchRates = async () => {
      try {
        const response = await fetchJson('https://open.er-api.com/v6/latest/USD', {
          defaultValue: null,
        });

        const idrRate = response?.rates?.IDR;
        if (isMounted && idrRate) {
          setExchangeRates((prev) => ({
            ...prev,
            IDR: idrRate,
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch currency rates:', err?.message);
      }

      // Fetch SOL price using Next.js API route (proxy to avoid CORS issues)
      try {
        const solPriceResponse = await fetch('/api/sol-price', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (solPriceResponse.ok) {
          const solPriceData = await solPriceResponse.json();
          const solPrice = solPriceData?.price;

          if (isMounted && solPrice) {
            setExchangeRates((prev) => ({
              ...prev,
              SOL: solPrice,
            }));
            console.log(`SOL price fetched from ${solPriceData?.source || 'API'}:`, solPrice);
          }
        } else {
          throw new Error(`SOL price API returned status ${solPriceResponse.status}`);
        }
      } catch (err) {
        console.warn('Failed to fetch SOL price:', err?.message);
        // Keep default value from DEFAULT_EXCHANGE_RATES
      }
    };

    fetchRates();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load search history from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedHistory = localStorage.getItem('portfolio_search_history');
        if (savedHistory) {
          const history = JSON.parse(savedHistory);
          setSearchHistory(Array.isArray(history) ? history : []);
        }
      } catch (err) {
        console.warn('Failed to load search history:', err);
      }
    }
  }, []);

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

  // Get quote from Jupiter API to swap meme coin to SOL
  const getJupiterQuote = async (inputMint, outputMint, amount, slippageBps = 500) => {
    try {
      const url = new URL(`${JUPITER_API_BASE}/quote`);
      url.searchParams.append('inputMint', inputMint);
      url.searchParams.append('outputMint', outputMint);
      url.searchParams.append('amount', amount.toString());
      url.searchParams.append('slippageBps', slippageBps.toString());
      url.searchParams.append('restrictIntermediateTokens', 'true');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Jupiter API error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('Error fetching Jupiter quote:', error);
      return null;
    }
  };

  // Convert meme coin amount to SOL using Jupiter API
  const convertMemeCoinToSol = async (memeCoinMint, memeCoinAmount, decimals = 6) => {
    try {
      // Skip if amount is too small (less than 0.000001)
      if (memeCoinAmount < 0.000001) {
        console.warn(`[convertMemeCoinToSol] Amount too small: ${memeCoinAmount}`);
        return 0;
      }

      // Convert amount to raw format (with decimals)
      const rawAmount = Math.floor(memeCoinAmount * Math.pow(10, decimals));
      
      // Skip if raw amount is 0 or too small
      if (rawAmount === 0) {
        console.warn(`[convertMemeCoinToSol] Raw amount is 0 for ${memeCoinAmount} with ${decimals} decimals`);
        return 0;
      }
      
      // Get quote from Jupiter: meme coin -> SOL
      const quote = await getJupiterQuote(
        memeCoinMint,
        'So11111111111111111111111111111111111111112', // SOL mint
        rawAmount,
        500 // 5% slippage
      );

      if (!quote || !quote.outAmount) {
        console.warn(`[convertMemeCoinToSol] No quote received for ${memeCoinMint}, amount: ${memeCoinAmount} (raw: ${rawAmount})`);
        return 0;
      }

      // outAmount is in lamports, convert to SOL
      const solAmount = Number(quote.outAmount) / LAMPORTS_PER_SOL;
      console.log(`[convertMemeCoinToSol] Converted ${memeCoinAmount} meme coins (${rawAmount} raw) to ${solAmount} SOL via Jupiter`);
      
      return solAmount;
    } catch (error) {
      console.warn(`[convertMemeCoinToSol] Failed to convert meme coin to SOL:`, error.message);
      return 0;
    }
  };

  const fetchHeliusRPC = async (method, params) => {
    const body = {
      jsonrpc: '2.0',
      id: 'metina-portfolio',
      method,
      params,
    };

    // Ensure API key is included in URL
    let rpcUrl = HELIUS_RPC_URL;
    if (!rpcUrl.includes('api-key=')) {
      // Add API key if not present
      const apiKey = '6a74938d-a838-4cd5-9fa9-c0af927c6bda';
      const separator = rpcUrl.includes('?') ? '&' : '?';
      rpcUrl = `${rpcUrl}${separator}api-key=${apiKey}`;
    }

    return fetchJson(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  // Create Solana connection for SDK
  // Ensure API key is always included in RPC calls
  const getConnection = () => {
    // Extract base URL and API key from HELIUS_RPC_URL
    let baseUrl = HELIUS_RPC_URL;
    let apiKey = '6a74938d-a838-4cd5-9fa9-c0af927c6bda';
    
    // If URL already has API key, extract it
    if (baseUrl.includes('api-key=')) {
      const urlMatch = baseUrl.match(/^(.*?)([?&]api-key=)([^&]+)/);
      if (urlMatch) {
        baseUrl = urlMatch[1];
        apiKey = urlMatch[3];
      }
    }
    
    // Remove trailing ? or & from base URL
    baseUrl = baseUrl.replace(/[?&]$/, '');
    
    // Create custom fetch function that always includes API key
    const customFetch = async (url, options) => {
      // Add API key to URL
      const separator = url.includes('?') ? '&' : '?';
      const urlWithKey = `${url}${separator}api-key=${apiKey}`;
      return fetch(urlWithKey, options);
    };
    
    // Use Connection with custom fetch to ensure API key is always included
    return new Connection(baseUrl, {
      commitment: 'confirmed',
      fetch: customFetch,
    });
  };

  // Use SDK to get positions (realtime data) using getAllLbPairPositionsByUser
  const findDLMMPositionsWithSDK = async (ownerAddress) => {
    if (!DLMM || typeof window === 'undefined') {
      console.warn('[findDLMMPositionsWithSDK] SDK not available, falling back to RPC');
      return null;
    }

    try {
      console.log('[findDLMMPositionsWithSDK] Using SDK getAllLbPairPositionsByUser to get positions...');
      const connection = getConnection();
      const ownerPubkey = new PublicKey(ownerAddress);
      
      // Use SDK method getAllLbPairPositionsByUser to get all positions for this user
      // This method gets all positions across all pairs for a user
      const positionAddresses = [];
      
      // Try multiple ways to access getAllLbPairPositionsByUser method
      // Method might be at DLMM.getAllLbPairPositionsByUser or DLMM.utils.getAllLbPairPositionsByUser
      let getAllLbPairPositionsByUser = null;
      
      if (typeof DLMM.getAllLbPairPositionsByUser === 'function') {
        getAllLbPairPositionsByUser = DLMM.getAllLbPairPositionsByUser;
      } else if (DLMM.utils && typeof DLMM.utils.getAllLbPairPositionsByUser === 'function') {
        getAllLbPairPositionsByUser = DLMM.utils.getAllLbPairPositionsByUser;
      } else if (DLMM.DLMM && typeof DLMM.DLMM.getAllLbPairPositionsByUser === 'function') {
        getAllLbPairPositionsByUser = DLMM.DLMM.getAllLbPairPositionsByUser;
      }
      
      if (getAllLbPairPositionsByUser) {
        try {
          console.log('[findDLMMPositionsWithSDK] Calling getAllLbPairPositionsByUser...');
          const allPositions = await getAllLbPairPositionsByUser(connection, ownerPubkey);
          
          console.log(`[findDLMMPositionsWithSDK] SDK returned:`, allPositions);
          console.log(`[findDLMMPositionsWithSDK] Type: ${typeof allPositions}, IsArray: ${Array.isArray(allPositions)}, IsMap: ${allPositions instanceof Map}`);
          
          // SDK returns Map<pairAddress, positions[]> where positions is array of position objects
          if (allPositions instanceof Map) {
            console.log(`[findDLMMPositionsWithSDK] SDK returned Map with ${allPositions.size} pairs`);
            
            // Iterate through Map entries (each entry is a pair with its positions)
            for (const [pairAddress, positions] of allPositions.entries()) {
              console.log(`[findDLMMPositionsWithSDK] Processing pair ${pairAddress}`);
              console.log(`[findDLMMPositionsWithSDK] Positions value type: ${typeof positions}, IsArray: ${Array.isArray(positions)}, Keys:`, positions ? Object.keys(positions) : 'null');
              console.log(`[findDLMMPositionsWithSDK] Positions value:`, positions);
              
              // Positions can be an array, an object with positions property, or a single position object
              let positionsArray = [];
              
              if (Array.isArray(positions)) {
                positionsArray = positions;
              } else if (positions && typeof positions === 'object') {
                // SDK structure: { publicKey, lbPair, tokenX, tokenY, lbPairPositionsData: [...] }
                // The actual positions are in lbPairPositionsData array
                if (Array.isArray(positions.lbPairPositionsData)) {
                  positionsArray = positions.lbPairPositionsData;
                  console.log(`[findDLMMPositionsWithSDK] Found ${positionsArray.length} positions in lbPairPositionsData`);
                } else if (Array.isArray(positions.positions)) {
                  positionsArray = positions.positions;
                } else if (positions.position) {
                  positionsArray = [positions.position];
                } else {
                  // Try to find any array property (could be nested)
                  for (const key in positions) {
                    const value = positions[key];
                    if (Array.isArray(value)) {
                      // Check if this array contains position objects
                      // Skip if it's token data or other non-position arrays
                      if (key.toLowerCase().includes('position') || 
                          (value.length > 0 && (value[0]?.publicKey || value[0]?.position))) {
                        positionsArray = value;
                        console.log(`[findDLMMPositionsWithSDK] Found positions array in property: ${key}`);
                        break;
                      }
                    } else if (value && typeof value === 'object' && Array.isArray(value.positions)) {
                      positionsArray = value.positions;
                      console.log(`[findDLMMPositionsWithSDK] Found positions array in nested property: ${key}.positions`);
                      break;
                    }
                  }
                  
                  // If still no array found, check if the object itself might be a position
                  // (check for common position properties, but NOT if it has lbPair - that's a pair object)
                  if (positionsArray.length === 0 && !positions.lbPair && (positions.publicKey || positions.address || positions.owner)) {
                    positionsArray = [positions];
                    console.log(`[findDLMMPositionsWithSDK] Treating value as single position object`);
                  }
                }
              }
              
              console.log(`[findDLMMPositionsWithSDK] Extracted ${positionsArray.length} positions from pair ${pairAddress}`);
              
              for (let i = 0; i < positionsArray.length; i++) {
                const pos = positionsArray[i];
                try {
                  console.log(`[findDLMMPositionsWithSDK] Processing position ${i + 1}/${positionsArray.length}:`, pos);
                  console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} type: ${typeof pos}, IsPublicKey: ${pos instanceof PublicKey}, Keys:`, pos && typeof pos === 'object' ? Object.keys(pos) : 'N/A');
                  
                  // Position might be an object with publicKey, or just a PublicKey, or have different structure
                  let positionAddress = null;
                  
                  if (pos instanceof PublicKey) {
                    positionAddress = pos.toString();
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} is PublicKey: ${positionAddress}`);
                  } else if (pos?.publicKey) {
                    positionAddress = pos.publicKey.toString();
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} has publicKey property: ${positionAddress}`);
                  } else if (pos?.position?.publicKey) {
                    positionAddress = pos.position.publicKey.toString();
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} has nested position.publicKey: ${positionAddress}`);
                  } else if (pos?.address) {
                    positionAddress = pos.address.toString();
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} has address property: ${positionAddress}`);
                  } else if (typeof pos === 'string') {
                    positionAddress = pos;
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} is string: ${positionAddress}`);
                  } else if (pos?.toString && typeof pos.toString === 'function') {
                    positionAddress = pos.toString();
                    console.log(`[findDLMMPositionsWithSDK] Position ${i + 1} toString(): ${positionAddress}`);
                  }
                  
                  if (positionAddress && typeof positionAddress === 'string') {
                    // Avoid duplicates
                    if (!positionAddresses.includes(positionAddress)) {
                      positionAddresses.push(positionAddress);
                      console.log(`[findDLMMPositionsWithSDK] ✓ Added position: ${positionAddress} (from pair ${pairAddress})`);
                    } else {
                      console.log(`[findDLMMPositionsWithSDK] ⊗ Skipped duplicate position: ${positionAddress}`);
                    }
                  } else {
                    console.warn(`[findDLMMPositionsWithSDK] ✗ Could not extract address from position ${i + 1}:`, pos);
                    // Log full structure for debugging
                    if (pos && typeof pos === 'object') {
                      console.warn(`[findDLMMPositionsWithSDK] Position ${i + 1} structure:`, Object.keys(pos));
                      // Try to log all properties that might contain address
                      for (const key in pos) {
                        const value = pos[key];
                        if (value instanceof PublicKey || (typeof value === 'string' && value.length > 30)) {
                          console.warn(`[findDLMMPositionsWithSDK] Position ${i + 1}.${key}:`, value.toString ? value.toString() : value);
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.warn(`[findDLMMPositionsWithSDK] Failed to extract position address ${i + 1}:`, e.message, pos);
                }
              }
            }
            
            if (positionAddresses.length > 0) {
              console.log(`[findDLMMPositionsWithSDK] Successfully found ${positionAddresses.length} positions via SDK getAllLbPairPositionsByUser`);
              return positionAddresses;
            } else {
              console.warn(`[findDLMMPositionsWithSDK] Map has entries but no position addresses extracted`);
            }
          } else if (Array.isArray(allPositions) && allPositions.length > 0) {
            // Handle array response (fallback)
            console.log(`[findDLMMPositionsWithSDK] SDK returned array with ${allPositions.length} items`);
            // Extract position addresses from SDK response
            for (const pos of allPositions) {
              try {
                // Position might be an object with publicKey, or just a PublicKey, or have different structure
                let positionAddress = null;
                
                if (pos instanceof PublicKey) {
                  positionAddress = pos.toString();
                } else if (pos?.publicKey) {
                  positionAddress = pos.publicKey.toString();
                } else if (pos?.position?.publicKey) {
                  positionAddress = pos.position.publicKey.toString();
                } else if (pos?.address) {
                  positionAddress = pos.address.toString();
                } else if (typeof pos === 'string') {
                  positionAddress = pos;
                } else if (pos?.toString && typeof pos.toString === 'function') {
                  positionAddress = pos.toString();
                }
                
                if (positionAddress && typeof positionAddress === 'string') {
                  positionAddresses.push(positionAddress);
                  console.log(`[findDLMMPositionsWithSDK] Found position: ${positionAddress}`);
                } else {
                  console.warn(`[findDLMMPositionsWithSDK] Could not extract address from position:`, pos);
                }
              } catch (e) {
                console.warn(`[findDLMMPositionsWithSDK] Failed to extract position address:`, e.message, pos);
              }
            }
            
            if (positionAddresses.length > 0) {
              console.log(`[findDLMMPositionsWithSDK] Successfully found ${positionAddresses.length} positions via SDK getAllLbPairPositionsByUser`);
              return positionAddresses;
            }
          } else {
            console.log('[findDLMMPositionsWithSDK] SDK returned empty array, null, or unknown type');
          }
        } catch (sdkErr) {
          console.error('[findDLMMPositionsWithSDK] SDK getAllLbPairPositionsByUser failed:', sdkErr);
          console.error('[findDLMMPositionsWithSDK] Error details:', sdkErr.message, sdkErr.stack);
        }
      } else {
        console.warn('[findDLMMPositionsWithSDK] SDK does not have getAllLbPairPositionsByUser method');
        console.warn('[findDLMMPositionsWithSDK] Available DLMM methods:', Object.keys(DLMM));
        if (DLMM.utils) {
          console.warn('[findDLMMPositionsWithSDK] Available DLMM.utils methods:', Object.keys(DLMM.utils));
        }
      }
      
      // Fallback: Use getProgramAccounts if SDK method doesn't exist or fails
      console.log('[findDLMMPositionsWithSDK] Falling back to getProgramAccounts...');
      
      // Solana RPC accepts base58 string directly for memcmp bytes field
      const response = await fetchHeliusRPC('getProgramAccounts', [
        DLMM_PROGRAM_ID,
        {
          encoding: 'base64',
          filters: [
            {
              memcmp: {
                offset: 8, // Owner starts at offset 8 (after 8-byte discriminator)
                bytes: ownerAddress, // Base58 string - RPC will handle conversion
              },
            },
          ],
        },
      ]);

      const accounts = response?.result || [];
      console.log(`[findDLMMPositionsWithSDK] Found ${accounts.length} positions via RPC fallback`);
      
      // Use SDK to parse position data for realtime info
      for (const acc of accounts) {
        try {
          const positionPubkey = new PublicKey(acc.pubkey);
          // SDK can parse position account data
          // For now, just collect addresses and we'll fetch details with SDK later
          positionAddresses.push(acc.pubkey);
        } catch (e) {
          console.warn(`[findDLMMPositionsWithSDK] Failed to parse position ${acc.pubkey}:`, e.message);
        }
      }
      
      if (positionAddresses.length > 0) {
        console.log(`[findDLMMPositionsWithSDK] Returning ${positionAddresses.length} positions from RPC fallback`);
        return positionAddresses;
      }
      
      return null;
    } catch (err) {
      console.error('[findDLMMPositionsWithSDK] SDK method failed:', err);
      return null;
    }
  };

  const findDLMMPositions = async (ownerAddress) => {
    console.log(`[findDLMMPositions] Step 1: Getting position addresses for owner: ${ownerAddress}`);
    
    // Try SDK first for realtime data
    const sdkPositions = await findDLMMPositionsWithSDK(ownerAddress);
    if (sdkPositions && sdkPositions.length > 0) {
      console.log(`[findDLMMPositions] Found ${sdkPositions.length} positions via SDK`);
      return sdkPositions;
    }
    
    // Fallback to RPC method
    // STEP 1: Get position_address using RPC (similar to SDK functions: getAllLbPairPositionsByUser)
    // DLMM Position account structure:
    // - 8 bytes: discriminator
    // - 32 bytes: owner (PublicKey)
    // So owner starts at offset 8
    
    const positionAddresses = [];
    
    try {
      console.log('[findDLMMPositions] Using getProgramAccounts with memcmp filter on owner...');
      
      // For memcmp, we need owner address as base58 encoded bytes
      // Solana RPC accepts base58 string directly for memcmp bytes field
      const response = await fetchHeliusRPC('getProgramAccounts', [
        DLMM_PROGRAM_ID,
        {
          encoding: 'base64', // We need base64 to properly filter, but can also use jsonParsed
          filters: [
            {
              memcmp: {
                offset: 8, // Owner starts at offset 8 (after 8-byte discriminator)
                bytes: ownerAddress, // Owner address as base58 string
              },
            },
          ],
        },
      ]);

      const accounts = response?.result || [];
      console.log(`[findDLMMPositions] Found ${accounts.length} candidate accounts via memcmp filter`);
      
      if (accounts.length > 0) {
        // Extract position addresses (pubkeys)
        const addresses = accounts.map((acc) => acc.pubkey).filter(Boolean);
        console.log(`[findDLMMPositions] Extracted ${addresses.length} position addresses`);
        
        // Since memcmp filter already validates owner, we can trust these addresses
        // API validation is optional and might fail for valid positions (API might be stale)
        // So we'll add all addresses found by memcmp, and let TVL check filter out closed positions later
        for (const addr of addresses) {
          positionAddresses.push(addr);
          console.log(`[findDLMMPositions] Added position from memcmp filter: ${addr}`);
        }
        
        // Optional: Quick validation via API (non-blocking, don't skip if API fails)
        // This is just for logging, not for filtering
        for (const addr of addresses.slice(0, 10)) { // Only check first 10 to avoid rate limiting
          try {
            const position = await fetchJson(
              `${METEORA_API_BASE}/position/${addr}`,
              { defaultValue: null }
            );
            
            if (position && position.owner?.toLowerCase() === ownerAddress.toLowerCase()) {
              console.log(`[findDLMMPositions] API validated position: ${addr}`);
            } else if (position) {
              console.warn(`[findDLMMPositions] API owner mismatch for ${addr}: ${position.owner} vs ${ownerAddress}`);
            }
          } catch (e) {
            // API validation failed, but that's OK - memcmp filter is more reliable
            console.log(`[findDLMMPositions] API validation skipped for ${addr} (will use memcmp result):`, e.message);
          }
        }
        
        if (positionAddresses.length > 0) {
          console.log(`[findDLMMPositions] Step 1 complete: Found ${positionAddresses.length} position addresses (from memcmp filter)`);
          return positionAddresses;
        }
      }
    } catch (err) {
      console.error('[findDLMMPositions] RPC memcmp method failed:', err);
    }

    // Fallback: Try with jsonParsed encoding (might work better with some RPCs)
    try {
      console.log('[findDLMMPositions] Trying with jsonParsed encoding...');
      
      const response = await fetchHeliusRPC('getProgramAccounts', [
        DLMM_PROGRAM_ID,
        {
          encoding: 'jsonParsed',
          filters: [
            {
              memcmp: {
                offset: 8,
                bytes: ownerAddress,
              },
            },
          ],
        },
      ]);

      const accounts = response?.result || [];
      console.log(`[findDLMMPositions] Found ${accounts.length} accounts via jsonParsed`);
      
      if (accounts.length > 0) {
        const addresses = accounts.map((acc) => acc.pubkey).filter(Boolean);
        console.log(`[findDLMMPositions] Found ${addresses.length} position addresses`);
        return addresses;
      }
    } catch (err) {
      console.warn('[findDLMMPositions] jsonParsed method failed:', err.message);
    }

    // Last resort: Transaction history method
    try {
      console.log('[findDLMMPositions] Fallback: Using transaction history...');
      
      const sigResponse = await fetchHeliusRPC('getSignaturesForAddress', [
        ownerAddress,
        { limit: 50 },
      ]);

      const signatures = sigResponse?.result || [];
      console.log(`[findDLMMPositions] Found ${signatures.length} transactions`);
      
      const candidateAddresses = new Set();
      
      // Check transactions that involve DLMM program
      for (let i = 0; i < Math.min(20, signatures.length); i++) {
        try {
          const sig = signatures[i].signature;
          const txResponse = await fetchHeliusRPC('getTransaction', [
            sig,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ]);

          const tx = txResponse?.result;
          if (!tx) continue;

          // Look for accounts that might be position addresses
          const accountKeys = tx.transaction?.message?.accountKeys || [];
          for (const acc of accountKeys) {
            const pubkey = typeof acc === 'string' ? acc : (acc.pubkey || acc);
            if (pubkey && typeof pubkey === 'string' && pubkey !== ownerAddress) {
              candidateAddresses.add(pubkey);
            }
          }
        } catch (e) {
          continue;
        }
      }

      // Validate candidates by calling API
      console.log(`[findDLMMPositions] Validating ${candidateAddresses.size} candidates...`);
      for (const addr of Array.from(candidateAddresses).slice(0, 50)) {
        try {
          const position = await fetchJson(
            `${METEORA_API_BASE}/position/${addr}`,
            { defaultValue: null }
          );
          
          if (position && position.owner?.toLowerCase() === ownerAddress.toLowerCase()) {
            positionAddresses.push(addr);
          }
        } catch (e) {
          continue;
        }
      }

      if (positionAddresses.length > 0) {
        console.log(`[findDLMMPositions] Found ${positionAddresses.length} positions via transaction history`);
        return positionAddresses;
      }
    } catch (err) {
      console.warn('[findDLMMPositions] Transaction history method failed:', err.message);
    }

    console.log('[findDLMMPositions] No position addresses found');
    return [];
  };

  const validatePosition = async (positionAddress, ownerAddress) => {
    try {
      const position = await fetchJson(
        `${METEORA_API_BASE}/position/${positionAddress}`,
        { defaultValue: null }
      );
      
      if (!position) {
        console.log(`Position ${positionAddress} not found in API`);
        return false;
      }
      
      // Check if the position owner matches
      const ownerMatches = position?.owner?.toLowerCase() === ownerAddress.toLowerCase();
      if (!ownerMatches) {
        console.log(`Position ${positionAddress} owner mismatch: ${position?.owner} vs ${ownerAddress}`);
        return false;
      }

      // Check if position has deposits (is open) by checking deposits endpoint
      try {
        const deposits = await fetchJson(
          `${METEORA_API_BASE}/position/${positionAddress}/deposits`,
          { defaultValue: [] }
        );
        
        // Position is valid if it has deposits
        if (Array.isArray(deposits) && deposits.length > 0) {
          console.log(`Position ${positionAddress} validated: has ${deposits.length} deposits`);
          return true;
        }
        
          // Also check if position has any liquidity value - try multiple field names
          const hasValue = 
            Number(position?.token_x_usd_amount || 
                   position?.token_x_amount_usd ||
                   position?.x_amount_usd || 0) > 0 ||
            Number(position?.token_y_usd_amount || 
                   position?.token_y_amount_usd ||
                   position?.y_amount_usd || 0) > 0 ||
            Number(position?.liquidity || 
                   position?.total_liquidity || 0) > 0;
        
        if (hasValue) {
          console.log(`Position ${positionAddress} validated: has liquidity value`);
          return true;
        }
        
        console.log(`Position ${positionAddress} has no deposits or liquidity`);
        return false;
      } catch (depositErr) {
        // If deposits endpoint fails, still accept if owner matches
        // The position might still be valid
        console.warn(`Could not check deposits for ${positionAddress}:`, depositErr.message);
        return true; // Accept if owner matches, even if we can't verify deposits
      }
    } catch (err) {
      console.error(`Error validating position ${positionAddress}:`, err.message);
      return false;
    }
  };

  const calculateUPNL = (currentTvlUsd, netDepositUsd, solPriceUsd, unclaimedFeesUsd = 0, claimedFeesUsd = 0) => {
    // UPNL = (Current TVL + Unclaimed Fees + Claimed Fees) - Net Deposits
    // This includes all profit/loss from the position including fees earned
    // - TVL = Current value of liquidity position
    // - Unclaimed Fees = Fees earned but not yet claimed
    // - Claimed Fees = Fees already claimed
    // - Net Deposits = total deposits - total withdraws (your actual investment)
    const totalValueUsd = currentTvlUsd + unclaimedFeesUsd + claimedFeesUsd;
    const upnlUsd = totalValueUsd - netDepositUsd;
    
    // Calculate percentage - handle division by zero
    // Use net deposits (actual investment) for percentage calculation
    let upnlPercent = 0;
    if (netDepositUsd > 0) {
      upnlPercent = (upnlUsd / netDepositUsd) * 100;
    } else if (netDepositUsd === 0 && totalValueUsd > 0) {
      // If no net deposits but has value (including fees), it's infinite gain (show as 100%)
      upnlPercent = 100;
    } else if (netDepositUsd === 0 && totalValueUsd === 0) {
      // No net deposits and no value
      upnlPercent = 0;
    } else if (netDepositUsd === 0 && totalValueUsd < 0) {
      // Negative value with no net deposits (shouldn't happen, but handle it)
      upnlPercent = -100;
    } else if (netDepositUsd < 0) {
      // If net deposits is negative (more withdraws than deposits), calculate percentage differently
      // This can happen if user withdrew more than deposited
      upnlPercent = netDepositUsd !== 0 ? (upnlUsd / Math.abs(netDepositUsd)) * 100 : 0;
    }

    // Convert to SOL
    const effectiveSolPrice = solPriceUsd || DEFAULT_EXCHANGE_RATES.SOL;
    const upnlSol = effectiveSolPrice > 0 ? upnlUsd / effectiveSolPrice : 0;

    return {
      usd: upnlUsd,
      sol: upnlSol,
      percent: upnlPercent,
    };
  };

  const sumUsd = (items = []) =>
    items.reduce(
      (total, item) =>
        total +
        Number(item?.token_x_usd_amount || 0) +
        Number(item?.token_y_usd_amount || 0),
      0
    );

  const formatCurrency = (
    value,
    { currency = 'USD', exchangeRates = DEFAULT_EXCHANGE_RATES } = {}
  ) => {
    if (value === null || value === undefined || value === '') {
      return currency === 'SOL' ? '0 SOL' : '$0';
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      return currency === 'SOL' ? '0 SOL' : '$0';
    }

    if (currency === 'SOL') {
      const abs = Math.abs(numericValue);
      if (abs < 0.001) {
        return `${numericValue < 0 ? '-' : ''}<0.001 SOL`;
      }
      return `${numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })} SOL`;
    }

    if (currency === 'USD') {
      // Round to 2 decimal places for better readability
      const rounded = Math.round(numericValue * 100) / 100;
      
      // Format with 2 decimals but remove trailing zeros
      const formatted = rounded.toFixed(2).replace(/\.?0+$/, '');
      return `$${formatted}`;
    }

    const rate = exchangeRates.IDR || DEFAULT_EXCHANGE_RATES.IDR;
    const valueInIdr = numericValue * rate;
    const abs = Math.abs(valueInIdr);

    let formatted;
    let suffix = '';

    if (abs >= 1_000_000_000) {
      formatted = (abs / 1_000_000_000).toFixed(1).replace('.0', '');
      suffix = 'M';
    } else if (abs >= 1_000_000) {
      formatted = (abs / 1_000_000).toFixed(1).replace('.0', '');
      suffix = 'JT';
    } else if (abs >= 1_000) {
      formatted = Math.round(abs / 1_000);
      suffix = 'K';
    } else {
      formatted = Math.round(abs).toString();
    }

    const result = `Rp${Number(formatted).toLocaleString('id-ID')}${suffix}`;
    return valueInIdr < 0 ? `-${result}` : result;
  };

  // Save address to search history
  const saveToHistory = (address) => {
    if (!address || typeof window === 'undefined') return;
    
    try {
      const trimmedAddress = address.trim();
      if (!trimmedAddress) return;

      setSearchHistory((prevHistory) => {
        // Remove if already exists and add to beginning (most recent first)
        const filtered = prevHistory.filter((item) => item !== trimmedAddress);
        const newHistory = [trimmedAddress, ...filtered].slice(0, 10); // Keep max 10 items
        
        // Save to localStorage
        localStorage.setItem('portfolio_search_history', JSON.stringify(newHistory));
        
        return newHistory;
      });
    } catch (err) {
      console.warn('Failed to save search history:', err);
    }
  };

  const handleFetchPositions = async (providedAddress = null) => {
    const addressToUse = providedAddress || addressInput.trim();
    
    if (!addressToUse) {
      setError('Please enter a Solana address');
      return;
    }

    // Basic address validation
    const address = addressToUse.trim();
    if (address.length < 32 || address.length > 44) {
      setError('Invalid Solana address format');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPositions([]);

    try {
      // STEP 1: Get position_address (like SDK functions: getAllLbPairPositionsByUser)
      console.log(`[handleFetchPositions] Step 1: Getting position addresses for: ${address}`);
      const positionAddresses = await findDLMMPositions(address);
      console.log(`[handleFetchPositions] Step 1 complete: Found ${positionAddresses.length} position addresses`);

      if (positionAddresses.length === 0) {
        setError('No DLMM positions found for this address. Make sure you have open positions on Meteora DLMM.');
        setIsLoading(false);
        return;
      }

      // STEP 2: Fetch position details (use RPC for realtime data, API as fallback)
      console.log(`[handleFetchPositions] Step 2: Fetching details for ${positionAddresses.length} positions...`);
      const positionPromises = positionAddresses.map(async (positionAddress, idx) => {
        try {
          // Add small delay to avoid rate limiting
          if (idx > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * idx));
          }
          
          // Try to get realtime data from SDK first, then fallback to API
          let position = null;
          let deposits = [];
          let claimFees = [];
          let withdraws = [];
          let sdkPosition = null; // SDK position object with realtime data
          let dlmmPool = null; // Store dlmmPool for later use to get fees
          let positionPubkey = null; // Store positionPubkey for later use
          
          // Option 1: Use SDK getPosition() for realtime data from blockchain
          if (DLMM && typeof window !== 'undefined') {
            try {
              const connection = getConnection();
              positionPubkey = new PublicKey(positionAddress);
              
              // Get pair address first (we need it to create DLMM instance)
              // Try to get from API first, or we can get it from position account
              const tempPosition = await fetchJson(
                `${METEORA_API_BASE}/position/${positionAddress}`,
                { defaultValue: null }
              );
              
              if (tempPosition?.pair_address) {
                const pairPubkey = new PublicKey(tempPosition.pair_address);
                dlmmPool = await DLMM.create(connection, pairPubkey);
                
                // Use SDK getPosition() to get realtime position data
                sdkPosition = await dlmmPool.getPosition(positionPubkey);
                
                if (sdkPosition) {
                  // SDK position has realtime data including feeX and feeY (unclaimed fees)
                  // We'll use this for unclaimed fees calculation
                }
              }
            } catch (sdkErr) {
              console.warn(`[handleFetchPositions] SDK getPosition() failed for ${positionAddress}, using API:`, sdkErr.message);
            }
          }
          
          // Option 2: Use API (might not be realtime, but has structured data)
          const positionUrl = `${METEORA_API_BASE}/position/${positionAddress}`;
          const [apiPosition, apiDeposits, apiClaimFees, apiWithdraws] = await Promise.all([
            fetchJson(positionUrl, { defaultValue: null }),
            fetchJson(`${positionUrl}/deposits`, { defaultValue: [] }),
            fetchJson(`${positionUrl}/claim_fees`, { defaultValue: [] }),
            fetchJson(`${positionUrl}/withdraws`, { defaultValue: [] }),
          ]);
          
          // Use API data as base, SDK data for realtime unclaimed fees
          position = apiPosition;
          deposits = apiDeposits;
          claimFees = apiClaimFees;
          withdraws = apiWithdraws;
          
          // Note: /claim_fees endpoint might return unclaimed fees, not claimed fees
          // Let's check both interpretations

          // Validate position data from API response
          if (!position) {
            console.warn(`[handleFetchPositions] Position ${positionAddress} not found in API`);
            return null;
          }
          
          // Double-check owner (should already be validated, but just to be sure)
          if (position.owner?.toLowerCase() !== address.toLowerCase()) {
            console.warn(`[handleFetchPositions] Owner mismatch for ${positionAddress}`);
            return null;
          }
          
          // Check if position has deposits or liquidity
          const hasDeposits = Array.isArray(deposits) && deposits.length > 0;
          
          // Check if position has liquidity from SDK (realtime check) - for logging only
          let hasLiquidity = false;
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            const totalXAmount = posData.totalXAmount ? Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount) : 0;
            const totalYAmount = posData.totalYAmount ? Number(posData.totalYAmount.toString ? posData.totalYAmount.toString() : posData.totalYAmount) : 0;
            hasLiquidity = totalXAmount > 0 || totalYAmount > 0;
            console.log(`[handleFetchPositions] Position ${positionAddress} liquidity check (SDK): totalXAmount=${totalXAmount}, totalYAmount=${totalYAmount}, hasLiquidity=${hasLiquidity}`);
          }
          
          // Position validation: If it has deposits from API, consider it valid and proceed to TVL calculation
          // Don't skip based on SDK liquidity check alone - SDK might not always read correctly
          // We'll use TVL threshold as the final validation (see below)
          if (!hasDeposits && !hasLiquidity) {
            console.log(`[handleFetchPositions] Position ${positionAddress} has no deposits and no liquidity (closed or empty) - SKIPPING`);
            return null; // Skip this position
          }
          
          // Note: We removed the strict SDK liquidity check here because:
          // 1. SDK might not always read data correctly
          // 2. API deposits are a reliable indicator of position existence
          // 3. TVL threshold check (below) will filter out truly closed positions

          const pairInfo = await fetchJson(
            `${METEORA_API_BASE}/pair/${position?.pair_address}`,
            { defaultValue: null }
          );

          // Fetch wallet earning data for this wallet and pair
          // This gives us claimed fees and rewards
          let walletEarning = null;
          try {
            const earningResponse = await fetchJson(
              `${METEORA_API_BASE}/wallet/${address}/${position?.pair_address}/earning`,
              { defaultValue: null }
            );
            // Response is an array, get first item or use the array itself
            walletEarning = Array.isArray(earningResponse) && earningResponse.length > 0 
              ? earningResponse[0] 
              : earningResponse;
            console.log(`[handleFetchPositions] Wallet earning for ${positionAddress}:`, walletEarning);
          } catch (err) {
            console.warn(`[handleFetchPositions] Failed to fetch wallet earning:`, err.message);
          }

          // Calculate total deposits in USD
          const totalDepositUsd = sumUsd(deposits);
          
          // Calculate total withdraws in USD  
          const totalWithdrawUsd = sumUsd(withdraws);
          
          // TVL = Current value of position (current balance)
          // Priority: Always use SDK positionData for realtime data from blockchain
          let tvlUsd = 0;
          let tokenXUsd = 0;
          let tokenYUsd = 0;
          // Store prices for fee calculation (will be calculated during TVL calculation)
          let tvlXPrice = 0;
          let tvlYPrice = 0;
          // Store current balance amounts
          let currentBalanceX = 0;
          let currentBalanceY = 0;
          
          // Priority 1: Use SDK positionData (realtime from blockchain) - ALWAYS if available
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            
            const totalXAmount = posData.totalXAmount ? Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount) : 0;
            const totalYAmount = posData.totalYAmount ? Number(posData.totalYAmount.toString ? posData.totalYAmount.toString() : posData.totalYAmount) : 0;
            
            // Store current balance for display
            currentBalanceX = totalXAmount;
            currentBalanceY = totalYAmount;
            
            // Convert to USD using realtime prices from pair reserves
            let xPrice = 0;
            let yPrice = 0;
            const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
            
            // Priority 1a: SDK pool reserves (most realtime)
            if (dlmmPool && pairInfo && solPrice > 0) {
              try {
                const lbPair = dlmmPool.lbPair;
                if (lbPair) {
                  const reserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                  const reserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                  
                  if (reserveX && reserveY) {
                    const finalReserveX = Number(reserveX.toString ? reserveX.toString() : reserveX);
                    const finalReserveY = Number(reserveY.toString ? reserveY.toString() : reserveY);
                    
                    if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && finalReserveX > 0 && finalReserveY > 0) {
                      xPrice = (finalReserveY * solPrice) / finalReserveX;
                      yPrice = solPrice;
                    }
                  }
                }
              } catch (e) {
                console.warn(`[handleFetchPositions] Could not get reserves from SDK pool:`, e.message);
              }
            }
            
            // Priority 1b: API pair reserves (realtime from API)
            if ((xPrice === 0 || yPrice === 0) && pairInfo && solPrice > 0) {
              const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
              const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
              
              if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                if (xPrice === 0) {
                  xPrice = (reserveY * solPrice) / reserveX;
                  tvlXPrice = xPrice;
                }
                if (yPrice === 0) {
                  yPrice = solPrice;
                  tvlYPrice = yPrice;
                }
              }
            }
            
            // Method 2: Fallback to deposits if reserves not available
            if ((xPrice === 0 || yPrice === 0) && deposits.length > 0) {
              const latestDeposit = deposits[deposits.length - 1];
              const latestXAmount = Number(latestDeposit.token_x_amount || 0);
              const latestYAmount = Number(latestDeposit.token_y_amount || 0);
              const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
              const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
              
              if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                xPrice = latestXUsd / latestXAmount;
                tvlXPrice = xPrice;
              }
              if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                yPrice = latestYUsd / latestYAmount;
                tvlYPrice = yPrice;
              }
              
              if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                yPrice = solPrice;
                tvlYPrice = yPrice;
              }
            }
            
            // Calculate TVL from realtime amounts and prices
            if (totalXAmount > 0 && xPrice > 0) {
              tokenXUsd = totalXAmount * xPrice;
            }
            if (totalYAmount > 0 && yPrice > 0) {
              tokenYUsd = totalYAmount * yPrice;
            }
            
            tvlUsd = tokenXUsd + tokenYUsd;
          }
          
          // Fallback: Try to get current token amounts from API position response
          if (tokenXUsd === 0 && tokenYUsd === 0 && !sdkPosition && position) {
            tokenXUsd = 
              Number(position?.token_x_usd_amount || 
                     position?.token_x_amount_usd ||
                     position?.x_amount_usd ||
                     0);
            tokenYUsd = 
              Number(position?.token_y_usd_amount || 
                     position?.token_y_amount_usd ||
                     position?.y_amount_usd ||
                     0);
            
            if (tokenXUsd === 0 && tokenYUsd === 0) {
              let tokenXAmount = Number(position?.token_x_amount || position?.x_amount || 0);
              let tokenYAmount = Number(position?.token_y_amount || position?.y_amount || 0);
              
              if ((tokenXAmount > 0 || tokenYAmount > 0) && pairInfo) {
                let xPrice = 0;
                let yPrice = 0;
                const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
                
                if (pairInfo && solPrice > 0) {
                  const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                  const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                  
                  if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                    xPrice = (reserveY * solPrice) / reserveX;
                    yPrice = solPrice;
                  }
                }
                
                if ((xPrice === 0 || yPrice === 0) && deposits.length > 0) {
                  const latestDeposit = deposits[deposits.length - 1];
                  const latestXAmount = Number(latestDeposit.token_x_amount || 0);
                  const latestYAmount = Number(latestDeposit.token_y_amount || 0);
                  const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
                  const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
                  
                  if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                    xPrice = latestXUsd / latestXAmount;
                  }
                  if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                    yPrice = latestYUsd / latestYAmount;
                  }
                  
                  if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                    yPrice = solPrice;
                  }
                }
                
                if (tokenXAmount > 0 && xPrice > 0) {
                  tokenXUsd = tokenXAmount * xPrice;
                }
                if (tokenYAmount > 0 && yPrice > 0) {
                  tokenYUsd = tokenYAmount * yPrice;
                }
              }
            }
            
            tvlUsd = tokenXUsd + tokenYUsd;
            
            if (tvlUsd === 0 && deposits.length > 0) {
              const latestDeposit = deposits[deposits.length - 1];
              if (latestDeposit) {
                const latestXPrice = latestDeposit.token_x_usd_amount / (Number(latestDeposit.token_x_amount) || 1);
                const latestYPrice = latestDeposit.token_y_usd_amount / (Number(latestDeposit.token_y_amount) || 1);
                
                let tokenXAmount = Number(position?.token_x_amount || position?.x_amount || 0);
                let tokenYAmount = Number(position?.token_y_amount || position?.y_amount || 0);
                
                if (tokenXAmount > 0 || tokenYAmount > 0) {
                  tvlUsd = (tokenXAmount * latestXPrice) + (tokenYAmount * latestYPrice);
                } else {
                  tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
                }
              } else {
                tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
              }
            } else if (tvlUsd === 0) {
              tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
            }
          } else {
            tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
          }
          
          // Calculate claimed fees (fees that have been claimed) - PER POSITION
          // IMPORTANT: Use total_fee_usd_claimed from API response (most accurate, already calculated by API)
          let totalClaimedFeeUsd = 0;
          
          // Priority 1: Get claimed fees directly from API position response
          // API provides total_fee_usd_claimed which is already calculated with historical prices
          if (position && position.total_fee_usd_claimed !== undefined && position.total_fee_usd_claimed !== null) {
            totalClaimedFeeUsd = Number(position.total_fee_usd_claimed) || 0;
            console.log(`[handleFetchPositions] Using total_fee_usd_claimed from API: $${totalClaimedFeeUsd}`);
          }
          
          // Store claimed fee amounts from SDK for unclaimed fees calculation (to subtract from total fees)
          // We still need this to calculate unclaimed fees correctly
          let claimedFeeXRaw = 0;
          let claimedFeeYRaw = 0;
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            if (posData.totalClaimedFeeXAmount) {
              claimedFeeXRaw = Number(posData.totalClaimedFeeXAmount.toString());
            }
            if (posData.totalClaimedFeeYAmount) {
              claimedFeeYRaw = Number(posData.totalClaimedFeeYAmount.toString());
            }
          }
          
          // Unclaimed fees: Fees that can be claimed but haven't been claimed yet
          // Priority: Use getUnClaimLpFee() from SDK (most accurate method)
          let unclaimedFeeXUsd = 0;
          let unclaimedFeeYUsd = 0;
          let totalUnclaimedFeeUsd = 0;
          
          // Track which method we use to get fees - some methods return unclaimed only, others return total
          let feeXRaw = 0;
          let feeYRaw = 0;
          let usingUnclaimedMethod = false; // Track if we used a method that already returns unclaimed fees
          
          // Option 1: Use SDK getUnClaimLpFee() - most accurate method for unclaimed fees
          // This method uses getPoolState() and getPositionState() to calculate unclaimed fees
          if (dlmmPool && positionPubkey) {
            try {
              // Import getUnClaimLpFee directly as named export (dynamic import at runtime)
              let getUnClaimLpFeeFunc = null;
              
              if (typeof window !== 'undefined') {
                try {
                  // Dynamic import to get getUnClaimLpFee as named export
                  const dlmmModule = await import('@meteora-ag/dlmm');
                  if (dlmmModule.getUnClaimLpFee && typeof dlmmModule.getUnClaimLpFee === 'function') {
                    getUnClaimLpFeeFunc = dlmmModule.getUnClaimLpFee;
                    console.log(`[handleFetchPositions] ✓ Found getUnClaimLpFee as named export`);
                  } else {
                    console.warn(`[handleFetchPositions] getUnClaimLpFee not found. Available exports:`, Object.keys(dlmmModule));
                  }
                } catch (importErr) {
                  console.warn(`[handleFetchPositions] Dynamic import failed:`, importErr.message);
                }
              }
              
              if (getUnClaimLpFeeFunc) {
                // Get pool state and position state
                const poolState = await dlmmPool.getPoolState();
                const positionState = await dlmmPool.getPositionState(positionPubkey);
                
                // Calculate unclaimed fees using getUnClaimLpFee
                const unclaimed = getUnClaimLpFeeFunc(poolState, positionState);
                
                if (unclaimed) {
                  feeXRaw = Number(unclaimed.feeTokenA?.toString() || unclaimed.feeX?.toString() || 0);
                  feeYRaw = Number(unclaimed.feeTokenB?.toString() || unclaimed.feeY?.toString() || 0);
                  usingUnclaimedMethod = true;
                  console.log(`[handleFetchPositions] ✓ Using getUnClaimLpFee() - unclaimed fees: feeTokenA=${feeXRaw}, feeTokenB=${feeYRaw}`);
                }
              } else {
                console.warn(`[handleFetchPositions] getUnClaimLpFee() not found in SDK, trying fallback methods...`);
              }
            } catch (e) {
              console.warn(`[handleFetchPositions] getUnClaimLpFee() failed:`, e.message, e.stack);
            }
          }
          
          // Option 2: Use SDK getPosition() data - fallback if getUnClaimLpFee not available
          if ((feeXRaw === 0 && feeYRaw === 0) && sdkPosition && sdkPosition.positionData) {
            try {
              // SDK position structure: {publicKey, positionData, version}
              // Unclaimed fees might be in positionData or need to be calculated
              const posData = sdkPosition.positionData;
              
              // Priority 2a: Use SDK methods that explicitly return unclaimed fees
              if (typeof sdkPosition.getUnclaimedFees === 'function') {
                try {
                  const fees = await sdkPosition.getUnclaimedFees();
                  if (fees) {
                    feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || 0);
                    feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || 0);
                    usingUnclaimedMethod = true;
                    console.log(`[handleFetchPositions] Using getUnclaimedFees() - already unclaimed: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                  }
                } catch (e) {
                  console.warn(`[handleFetchPositions] SDK getUnclaimedFees() failed:`, e.message);
                }
              }
              
              // Priority 2b: Use pool methods that return claimable fees
              if ((feeXRaw === 0 && feeYRaw === 0) && dlmmPool && positionPubkey) {
                try {
                  if (typeof dlmmPool.getClaimableFees === 'function') {
                    const fees = await dlmmPool.getClaimableFees(positionPubkey);
                    if (fees) {
                      feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || fees.xFee?.toString() || 0);
                      feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || fees.yFee?.toString() || 0);
                      usingUnclaimedMethod = true;
                      console.log(`[handleFetchPositions] Using getClaimableFees() - already unclaimed: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                    }
                  } else if (typeof dlmmPool.getPositionFees === 'function') {
                    // getPositionFees might return total fees, so we'll need to subtract claimed
                    const fees = await dlmmPool.getPositionFees(positionPubkey);
                    if (fees) {
                      feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || fees.xFee?.toString() || 0);
                      feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || fees.yFee?.toString() || 0);
                      usingUnclaimedMethod = false; // Might be total fees
                      console.log(`[handleFetchPositions] Using getPositionFees() - might be total fees: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                    }
                  }
                } catch (e) {
                  console.warn(`[handleFetchPositions] SDK pool fee methods failed:`, e.message);
                }
              }
              
              // Priority 3: Direct access to feeX and feeY from positionData (might be total fees)
              if (feeXRaw === 0 && feeYRaw === 0) {
                if (posData.feeX) {
                  try {
                    feeXRaw = Number(posData.feeX.toString());
                    usingUnclaimedMethod = false; // feeX/feeY might be total fees
                    console.log(`[handleFetchPositions] Using posData.feeX directly - might be total fees: ${feeXRaw}`);
                  } catch (e) {
                    console.warn(`[handleFetchPositions] Error reading feeX:`, e.message);
                  }
                }
                
                if (posData.feeY) {
                  try {
                    feeYRaw = Number(posData.feeY.toString());
                    usingUnclaimedMethod = false; // feeX/feeY might be total fees
                    console.log(`[handleFetchPositions] Using posData.feeY directly - might be total fees: ${feeYRaw}`);
                  } catch (e) {
                    console.warn(`[handleFetchPositions] Error reading feeY:`, e.message);
                  }
                }
              }
              
              // Priority 4: Calculate fees from positionBinData if available (might be total fees)
              if (feeXRaw === 0 && feeYRaw === 0 && posData.positionBinData && Array.isArray(posData.positionBinData)) {
                try {
                  let totalFeeX = 0;
                  let totalFeeY = 0;
                  
                  for (const bin of posData.positionBinData) {
                    if (bin && typeof bin === 'object') {
                      for (const binKey in bin) {
                        const lowerBinKey = binKey.toLowerCase();
                        if (lowerBinKey.includes('fee')) {
                          const binValue = bin[binKey];
                          let binValueStr = '';
                          if (binValue && typeof binValue === 'object' && 'toString' in binValue) {
                            binValueStr = binValue.toString();
                          } else {
                            binValueStr = String(binValue);
                          }
                          
                          if (lowerBinKey.includes('x') || binKey.includes('X')) {
                            totalFeeX += Number(binValueStr) || 0;
                          }
                          if (lowerBinKey.includes('y') || binKey.includes('Y')) {
                            totalFeeY += Number(binValueStr) || 0;
                          }
                        }
                      }
                    }
                  }
                  
                  if (totalFeeX > 0 || totalFeeY > 0) {
                    feeXRaw = totalFeeX;
                    feeYRaw = totalFeeY;
                    usingUnclaimedMethod = false; // positionBinData might contain total fees
                    console.log(`[handleFetchPositions] Using positionBinData - might be total fees: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                  }
                } catch (binErr) {
                  console.warn(`[handleFetchPositions] Error calculating fees from positionBinData:`, binErr.message);
                }
              }
              
              // IMPORTANT: Only subtract claimed fees if we didn't use a method that already returns unclaimed fees
              // Methods like getUnclaimedFees() and getClaimableFees() already return unclaimed fees only
              // But feeX/feeY directly or getPositionFees() might return total fees
              if (!usingUnclaimedMethod && (claimedFeeXRaw > 0 || claimedFeeYRaw > 0)) {
                if (claimedFeeXRaw > 0 && feeXRaw >= claimedFeeXRaw) {
                  const beforeFeeX = feeXRaw;
                  feeXRaw = feeXRaw - claimedFeeXRaw;
                  console.log(`[handleFetchPositions] Subtracted claimed feeX from total feeX: ${beforeFeeX} - ${claimedFeeXRaw} = ${feeXRaw} (unclaimed)`);
                } else if (claimedFeeXRaw > 0 && feeXRaw > 0) {
                  console.warn(`[handleFetchPositions] Warning: feeXRaw (${feeXRaw}) < claimedFeeXRaw (${claimedFeeXRaw}), skipping subtraction`);
                }
                if (claimedFeeYRaw > 0 && feeYRaw >= claimedFeeYRaw) {
                  const beforeFeeY = feeYRaw;
                  feeYRaw = feeYRaw - claimedFeeYRaw;
                  console.log(`[handleFetchPositions] Subtracted claimed feeY from total feeY: ${beforeFeeY} - ${claimedFeeYRaw} = ${feeYRaw} (unclaimed)`);
                } else if (claimedFeeYRaw > 0 && feeYRaw > 0) {
                  console.warn(`[handleFetchPositions] Warning: feeYRaw (${feeYRaw}) < claimedFeeYRaw (${claimedFeeYRaw}), skipping subtraction`);
                }
              } else if (usingUnclaimedMethod) {
                console.log(`[handleFetchPositions] Using unclaimed method - skipping subtraction of claimed fees`);
              }
              
              // Convert raw amounts to USD using REALTIME token prices
              if (feeXRaw > 0 || feeYRaw > 0) {
                let xPrice = 0;
                let yPrice = 0;
                const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
                
                // Priority 1: SDK pool reserves (most realtime)
                if ((xPrice === 0 || yPrice === 0) && dlmmPool && pairInfo && solPrice > 0) {
                  try {
                    const lbPair = dlmmPool.lbPair;
                    if (lbPair) {
                      const reserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                      const reserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                      
                      if (reserveX && reserveY) {
                        const finalReserveX = Number(reserveX.toString ? reserveX.toString() : reserveX);
                        const finalReserveY = Number(reserveY.toString ? reserveY.toString() : reserveY);
                        
                        if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && finalReserveX > 0 && finalReserveY > 0) {
                          if (xPrice === 0) {
                            xPrice = (finalReserveY * solPrice) / finalReserveX;
                          }
                          if (yPrice === 0) {
                            yPrice = solPrice;
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`[handleFetchPositions] Could not get reserves from SDK pool for fees:`, e.message);
                  }
                }
                
                // Priority 2: API pair reserves
                if ((xPrice === 0 || yPrice === 0) && pairInfo && solPrice > 0) {
                  const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                  const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                  
                  if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                    if (xPrice === 0) {
                      xPrice = (reserveY * solPrice) / reserveX;
                    }
                    if (yPrice === 0) {
                      yPrice = solPrice;
                    }
                  }
                }
                
                // Method 2: Fallback to deposits
                if ((xPrice === 0 && feeXRaw > 0) || (yPrice === 0 && feeYRaw > 0)) {
                  if (deposits.length > 0) {
                    const latestDeposit = deposits[deposits.length - 1];
                    const latestXAmount = Number(latestDeposit.token_x_amount || 0);
                    const latestYAmount = Number(latestDeposit.token_y_amount || 0);
                    const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
                    const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
                    
                    if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                      xPrice = latestXUsd / latestXAmount;
                    }
                    if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                      yPrice = latestYUsd / latestYAmount;
                    }
                    
                    if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                      yPrice = solPrice;
                    }
                  }
                }
                
                // Convert to USD
                // IMPORTANT: Fee calculation harus mengikuti pergerakan harga:
                // 1. Fee meme coin (feeX) -> swap ke SOL menggunakan harga saat ini (reserves) -> kemudian ke USD
                // 2. Fee SOL (feeY) -> langsung ke USD
                
                if (feeXRaw > 0) {
                  // IMPORTANT: feeXRaw is in raw format, need to convert using decimals
                  let tokenXDecimals = 6; // Default to 6 decimals
                  if (posData.totalXAmount) {
                    const totalXAmount = Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount);
                    if (totalXAmount > 0 && totalXAmount < 1e12 && feeXRaw > totalXAmount) {
                      const ratio = feeXRaw / totalXAmount;
                      if (ratio > 1e5 && ratio < 1e7) {
                        tokenXDecimals = 6;
                      } else if (ratio > 1e8 && ratio < 1e10) {
                        tokenXDecimals = 9;
                      } else {
                        const logRatio = Math.log10(ratio);
                        tokenXDecimals = Math.round(logRatio);
                      }
                    }
                  }
                  const feeXAmount = feeXRaw / Math.pow(10, tokenXDecimals);
                  
                  // Step 1: Swap feeX (meme coin) ke SOL menggunakan Jupiter API (realtime price)
                  let feeXInSol = 0;
                  
                  // Priority 1: Use Jupiter API to get realtime swap rate
                  if (pairInfo && pairInfo.mint_x) {
                    try {
                      feeXInSol = await convertMemeCoinToSol(pairInfo.mint_x, feeXAmount, tokenXDecimals);
                      if (feeXInSol > 0) {
                        console.log(`[handleFetchPositions] ✓ Swapped feeX to SOL via Jupiter: ${feeXAmount} meme coins -> ${feeXInSol} SOL`);
                      }
                    } catch (jupiterErr) {
                      console.warn(`[handleFetchPositions] Jupiter API failed for feeX, falling back to reserves:`, jupiterErr.message);
                    }
                  }
                  
                  // Priority 2: Fallback to reserves if Jupiter API fails
                  if (feeXInSol === 0) {
                    let reserveX = 0;
                    let reserveY = 0;
                    
                    // Get reserves from SDK pool (most realtime)
                    if (dlmmPool && pairInfo) {
                      try {
                        const lbPair = dlmmPool.lbPair;
                        if (lbPair) {
                          const sdkReserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                          const sdkReserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                          
                          if (sdkReserveX && sdkReserveY) {
                            reserveX = Number(sdkReserveX.toString ? sdkReserveX.toString() : sdkReserveX);
                            reserveY = Number(sdkReserveY.toString ? sdkReserveY.toString() : sdkReserveY);
                            if (reserveY > 1e9) {
                              reserveY = reserveY / LAMPORTS_PER_SOL; // Convert to SOL
                            }
                          }
                        }
                      } catch (e) {
                        console.warn(`[handleFetchPositions] Could not get reserves from SDK pool:`, e.message);
                      }
                    }
                    
                    // Get reserves from API
                    if ((reserveX === 0 || reserveY === 0) && pairInfo) {
                      reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                      reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                      if (reserveY > 1e9) {
                        reserveY = reserveY / LAMPORTS_PER_SOL; // Convert to SOL
                      }
                    }
                    
                    // Swap feeX (meme coin) ke SOL menggunakan reserves saat ini
                    if (reserveX > 0 && reserveY > 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y)) {
                      feeXInSol = (feeXAmount * reserveY) / reserveX;
                      console.log(`[handleFetchPositions] ⚠ Fallback: Swapped feeX to SOL using reserves: ${feeXAmount} meme coins -> ${feeXInSol} SOL`);
                    } else {
                      // Fallback: Use price from TVL calculation
                      const effectiveXPrice = tvlXPrice > 0 ? tvlXPrice : xPrice;
                      if (effectiveXPrice > 0 && solPrice > 0) {
                        const xPriceInSol = effectiveXPrice / solPrice;
                        feeXInSol = feeXAmount * xPriceInSol;
                        console.log(`[handleFetchPositions] ⚠ Fallback: Using TVL price to calculate swap: ${feeXAmount} * (${effectiveXPrice} USD/token / ${solPrice} USD/SOL) = ${feeXInSol} SOL`);
                      }
                    }
                  }
                  
                  // Step 2: Convert feeXInSol ke USD
                  if (feeXInSol > 0 && solPrice > 0) {
                    unclaimedFeeXUsd = feeXInSol * solPrice;
                  }
                }
                
                // FeeY (SOL) langsung ke USD
                // IMPORTANT: feeYRaw is in lamports, need to convert to SOL first
                if (feeYRaw > 0) {
                  const feeYInSol = feeYRaw / LAMPORTS_PER_SOL;
                  if (solPrice > 0) {
                    unclaimedFeeYUsd = feeYInSol * solPrice;
                  }
                }
                
                // Claimed fees are already calculated from API (total_fee_usd_claimed)
                // No need to calculate from SDK - we use API value directly
              } else {
                // If we can't get prices, use raw amounts as fallback (will show in token units)
                unclaimedFeeXUsd = feeXRaw;
                unclaimedFeeYUsd = feeYRaw;
              }
            } catch (sdkFeeErr) {
              console.warn(`[handleFetchPositions] Failed to get fees from SDK position:`, sdkFeeErr.message);
            }
          }
          
          // Option 2: Fallback to API position response if SDK not available
          // Only use API if SDK is not available (SDK has priority for realtime data)
          if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0 && !sdkPosition && position) {
            // Try multiple possible field names for unclaimed/claimable fees in position response
            unclaimedFeeXUsd = 
              Number(position?.fee_x_amount_usd || 
                     position?.unclaimed_fee_x_usd || 
                     position?.claimable_fee_x_usd ||
                     position?.fee_x_usd ||
                     position?.fee_x_amount ||
                     position?.fee_x ||
                     position?.x_fee_amount_usd ||
                     position?.x_fee_usd ||
                     position?.pending_fee_x_usd ||
                     position?.swap_fee_x_usd ||
                     0);
            unclaimedFeeYUsd = 
              Number(position?.fee_y_amount_usd || 
                     position?.unclaimed_fee_y_usd || 
                     position?.claimable_fee_y_usd ||
                     position?.fee_y_usd ||
                     position?.fee_y_amount ||
                     position?.fee_y ||
                     position?.y_fee_amount_usd ||
                     position?.y_fee_usd ||
                     position?.pending_fee_y_usd ||
                     position?.swap_fee_y_usd ||
                     0);
          }
          
          // Option 3: Fallback to /claim_fees endpoint if still not found
          if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0 && Array.isArray(claimFees) && claimFees.length > 0) {
            // Check if these are unclaimed fees (fees available to claim)
            unclaimedFeeXUsd = sumUsd(claimFees.filter(f => 
              f.token === 'x' || 
              f.token_x || 
              f.token_x_amount ||
              (f.token_x_usd_amount && !f.claimed)
            ));
            unclaimedFeeYUsd = sumUsd(claimFees.filter(f => 
              f.token === 'y' || 
              f.token_y || 
              f.token_y_amount ||
              (f.token_y_usd_amount && !f.claimed)
            ));
            
            // If filtering didn't work, try to sum all
            if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0) {
              claimFees.forEach(fee => {
                if (fee.token_x_usd_amount) unclaimedFeeXUsd += Number(fee.token_x_usd_amount || 0);
                if (fee.token_y_usd_amount) unclaimedFeeYUsd += Number(fee.token_y_usd_amount || 0);
              });
            }
          }
          
          // Calculate total unclaimed fees: SOL fees + Meme coin fees
          totalUnclaimedFeeUsd = unclaimedFeeXUsd + unclaimedFeeYUsd;
          
          // Calculate UPNL: (Current TVL + Unclaimed Fees + Claimed Fees) - Net deposits
          const netDepositUsd = totalDepositUsd - totalWithdrawUsd;
          const upnl = calculateUPNL(tvlUsd, netDepositUsd, exchangeRates.SOL, totalUnclaimedFeeUsd, totalClaimedFeeUsd);

          // Final validation: Skip position if TVL is 0 or very small
          const MIN_TVL_THRESHOLD = 0.01;
          if (tvlUsd < MIN_TVL_THRESHOLD) {
            return null;
          }

          // Get token decimals for proper display
          let tokenXDecimals = pairInfo?.token_x?.decimals || 6;
          let tokenYDecimals = pairInfo?.token_y?.decimals || 9;
          const isYSol = pairInfo?.mint_y && SOL_MINTS.includes(pairInfo.mint_y);
          if (isYSol) {
            tokenYDecimals = 9; // SOL has 9 decimals
          }

          // Format balance amounts (convert from raw if needed)
          let balanceX = currentBalanceX;
          let balanceY = currentBalanceY;
          
          // Check if balances are in raw format and convert
          // For SOL (9 decimals), if balance > 1, it's likely in lamports (raw format)
          if (isYSol && balanceY > 1) {
            balanceY = balanceY / LAMPORTS_PER_SOL;
            console.log(`[handleFetchPositions] Converted SOL balance from lamports: ${currentBalanceY} -> ${balanceY} SOL`);
          } else if (balanceY > 1e12) {
            balanceY = balanceY / Math.pow(10, tokenYDecimals);
          }
          
          // For token X, check if it's in raw format (very large numbers)
          if (balanceX > 1e12) {
            balanceX = balanceX / Math.pow(10, tokenXDecimals);
          }
          
          // Fallback: Get balance from API if SDK not available
          if (balanceX === 0 && balanceY === 0 && position) {
            balanceX = Number(position?.token_x_amount || position?.x_amount || 0);
            balanceY = Number(position?.token_y_amount || position?.y_amount || 0);
            // If from API and Y is SOL, might still be in lamports
            if (isYSol && balanceY > 1) {
              balanceY = balanceY / LAMPORTS_PER_SOL;
            }
          }

          // Calculate token prices for balance USD conversion
          let tokenXPriceUsd = 0;
          let tokenYPriceUsd = 0;
          const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
          
          if (pairInfo && solPrice > 0) {
            const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
            const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
            
            // If Y is SOL, calculate X price from reserves
            if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
              // Convert reserveY from lamports to SOL if needed
              const reserveYInSol = reserveY > 1e9 ? reserveY / LAMPORTS_PER_SOL : reserveY;
              tokenXPriceUsd = (reserveYInSol * solPrice) / reserveX;
              tokenYPriceUsd = solPrice;
            }
          }
          
          // Use tvlXPrice and tvlYPrice if available (from TVL calculation)
          if (tvlXPrice > 0) tokenXPriceUsd = tvlXPrice;
          if (tvlYPrice > 0) tokenYPriceUsd = tvlYPrice;

          // Extract token symbols from pairInfo with multiple fallbacks
          let tokenXSymbol = pairInfo?.token_x?.symbol || 
                            pairInfo?.token_x?.name || 
                            pairInfo?.tokenX?.symbol ||
                            pairInfo?.tokenX?.name ||
                            pairInfo?.x_token?.symbol ||
                            pairInfo?.xToken?.symbol;
          
          let tokenYSymbol = pairInfo?.token_y?.symbol || 
                            pairInfo?.token_y?.name || 
                            pairInfo?.tokenY?.symbol ||
                            pairInfo?.tokenY?.name ||
                            pairInfo?.y_token?.symbol ||
                            pairInfo?.yToken?.symbol;

          // Fallback: Try to extract from pairName (e.g., "Frieren-SOL" or "Frieren/SOL" -> "Frieren" and "SOL")
          if (!tokenXSymbol || !tokenYSymbol) {
            const pairName = pairInfo?.name || '';
            if (pairName) {
              const parts = pairName.split(/[-/]/);
              if (parts.length >= 2) {
                if (!tokenXSymbol) tokenXSymbol = parts[0].trim();
                if (!tokenYSymbol) tokenYSymbol = parts[1].trim();
              }
            }
          }

          // Final fallback
          if (!tokenXSymbol) tokenXSymbol = 'X';
          if (!tokenYSymbol) tokenYSymbol = 'Y';

          // Debug logging
          if (tokenXSymbol === 'X' || tokenYSymbol === 'Y') {
            console.log(`[handleFetchPositions] Token symbols for ${positionAddress}:`, {
              tokenXSymbol,
              tokenYSymbol,
              pairInfoKeys: pairInfo ? Object.keys(pairInfo) : null,
              token_x: pairInfo?.token_x,
              token_y: pairInfo?.token_y,
              pairName: pairInfo?.name
            });
          }

          return {
            address: positionAddress,
            position,
            deposits,
            withdraws, // Store withdraws for net deposits calculation
            pairInfo,
            pairName: pairInfo?.name || pairInfo?.token_x?.symbol + '/' + pairInfo?.token_y?.symbol || 'Unknown',
            pairAddress: position?.pair_address,
            claimedFeeUsd: totalClaimedFeeUsd,
            unclaimedFeeUsd: totalUnclaimedFeeUsd,
            upnl,
            tvlUsd,
            balanceX, // Current balance of Token X
            balanceY, // Current balance of Token Y
            tokenXSymbol,
            tokenYSymbol,
            tokenXPriceUsd, // Token X price in USD for balance conversion
            tokenYPriceUsd, // Token Y price in USD for balance conversion
          };
        } catch (err) {
          console.error(`Failed to fetch position ${positionAddress}:`, err);
          return null;
        }
      });

      const fetchedPositions = await Promise.all(positionPromises);
      const validPositions = fetchedPositions.filter((p) => p !== null);

      if (validPositions.length === 0) {
        setError('No open positions found');
      } else {
        setPositions(validPositions);
        setLastUpdate(new Date());
        // Save to search history
        saveToHistory(address);
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setError(err.message || 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshPositions = async () => {
    // Only refresh existing positions, don't reload all positions
    if (positions.length === 0) {
      return; // No positions to refresh
    }

    if (!addressInput.trim()) {
      return; // No address, can't refresh
    }

    const address = addressInput.trim();
    setIsLoading(true);
    setError(null);

    try {
      // Get position addresses from existing positions
      const positionAddresses = positions.map(pos => pos.address);
      console.log(`[handleRefreshPositions] Refreshing ${positionAddresses.length} existing positions...`);

      // Fetch updated details for existing positions (same logic as handleFetchPositions Step 2)
      const positionPromises = positionAddresses.map(async (positionAddress, idx) => {
        try {
          // Add small delay to avoid rate limiting
          if (idx > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * idx));
          }
          
          // Try to get realtime data from SDK first, then fallback to API
          let position = null;
          let deposits = [];
          let claimFees = [];
          let withdraws = [];
          let sdkPosition = null; // SDK position object with realtime data
          let dlmmPool = null; // Store dlmmPool for later use to get fees
          let positionPubkey = null; // Store positionPubkey for later use
          
          // Option 1: Use SDK getPosition() for realtime data from blockchain
          if (DLMM && typeof window !== 'undefined') {
            try {
              console.log(`[handleRefreshPositions] Using SDK getPosition() for ${positionAddress}...`);
              const connection = getConnection();
              positionPubkey = new PublicKey(positionAddress);
              
              // Get pair address first (we need it to create DLMM instance)
              // Try to get from API first, or we can get it from position account
              const tempPosition = await fetchJson(
                `${METEORA_API_BASE}/position/${positionAddress}`,
                { defaultValue: null }
              );
              
              if (tempPosition?.pair_address) {
                const pairPubkey = new PublicKey(tempPosition.pair_address);
                dlmmPool = await DLMM.create(connection, pairPubkey);
                
                // Use SDK getPosition() to get realtime position data
                sdkPosition = await dlmmPool.getPosition(positionPubkey);
                
                if (sdkPosition) {
                  // SDK position has realtime data including feeX and feeY (unclaimed fees)
                  // We'll use this for unclaimed fees calculation
                }
              }
            } catch (sdkErr) {
              console.warn(`[handleRefreshPositions] SDK getPosition() failed for ${positionAddress}, using API:`, sdkErr.message);
            }
          }
          
          // Option 2: Use API (might not be realtime, but has structured data)
          const positionUrl = `${METEORA_API_BASE}/position/${positionAddress}`;
          const [apiPosition, apiDeposits, apiClaimFees, apiWithdraws] = await Promise.all([
            fetchJson(positionUrl, { defaultValue: null }),
            fetchJson(`${positionUrl}/deposits`, { defaultValue: [] }),
            fetchJson(`${positionUrl}/claim_fees`, { defaultValue: [] }),
            fetchJson(`${positionUrl}/withdraws`, { defaultValue: [] }),
          ]);
          
          // Use API data as base, SDK data for realtime unclaimed fees
          position = apiPosition;
          deposits = apiDeposits;
          claimFees = apiClaimFees;
          withdraws = apiWithdraws;
          
          // Validate position data from API response
          if (!position) {
            console.warn(`[handleRefreshPositions] Position ${positionAddress} not found in API`);
            return null;
          }
          
          // Double-check owner (should already be validated, but just to be sure)
          if (position.owner?.toLowerCase() !== address.toLowerCase()) {
            console.warn(`[handleRefreshPositions] Owner mismatch for ${positionAddress}`);
            return null;
          }
          
          // Check if position has deposits or liquidity
          const hasDeposits = Array.isArray(deposits) && deposits.length > 0;
          
          // Check if position has liquidity from SDK (realtime check) - for logging only
          let hasLiquidity = false;
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            const totalXAmount = posData.totalXAmount ? Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount) : 0;
            const totalYAmount = posData.totalYAmount ? Number(posData.totalYAmount.toString ? posData.totalYAmount.toString() : posData.totalYAmount) : 0;
            hasLiquidity = totalXAmount > 0 || totalYAmount > 0;
            console.log(`[handleRefreshPositions] Position ${positionAddress} liquidity check (SDK): totalXAmount=${totalXAmount}, totalYAmount=${totalYAmount}, hasLiquidity=${hasLiquidity}`);
          }
          
          // Position validation: If it has deposits from API, consider it valid and proceed to TVL calculation
          // Don't skip based on SDK liquidity check alone - SDK might not always read correctly
          // We'll use TVL threshold as the final validation (see below)
          if (!hasDeposits && !hasLiquidity) {
            console.log(`[handleRefreshPositions] Position ${positionAddress} has no deposits and no liquidity (closed or empty) - SKIPPING`);
            return null; // Skip this position
          }
          
          // Note: We removed the strict SDK liquidity check here because:
          // 1. SDK might not always read data correctly
          // 2. API deposits are a reliable indicator of position existence
          // 3. TVL threshold check (below) will filter out truly closed positions

          const pairInfo = await fetchJson(
            `${METEORA_API_BASE}/pair/${position?.pair_address}`,
            { defaultValue: null }
          );

          // Fetch wallet earning data for this wallet and pair
          let walletEarning = null;
          try {
            const earningResponse = await fetchJson(
              `${METEORA_API_BASE}/wallet/${address}/${position?.pair_address}/earning`,
              { defaultValue: null }
            );
            walletEarning = Array.isArray(earningResponse) && earningResponse.length > 0 
              ? earningResponse[0] 
              : earningResponse;
          } catch (err) {
            console.warn(`[handleRefreshPositions] Failed to fetch wallet earning:`, err.message);
          }

          // Calculate total deposits in USD
          const totalDepositUsd = sumUsd(deposits);
          
          // Calculate total withdraws in USD  
          const totalWithdrawUsd = sumUsd(withdraws);
          
          // TVL = Current value of position (current balance)
          // Priority: Always use SDK positionData for realtime data from blockchain
          let tvlUsd = 0;
          let tokenXUsd = 0;
          let tokenYUsd = 0;
          // Store prices for fee calculation (will be calculated during TVL calculation)
          let tvlXPrice = 0;
          let tvlYPrice = 0;
          // Store current balance amounts
          let currentBalanceX = 0;
          let currentBalanceY = 0;
          
          // Priority 1: Use SDK positionData (realtime from blockchain) - ALWAYS if available
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            console.log(`[handleRefreshPositions] Using SDK positionData for TVL calculation (REALTIME)`);
            
            const totalXAmount = posData.totalXAmount ? Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount) : 0;
            const totalYAmount = posData.totalYAmount ? Number(posData.totalYAmount.toString ? posData.totalYAmount.toString() : posData.totalYAmount) : 0;
            
            // Store current balance for display
            currentBalanceX = totalXAmount;
            currentBalanceY = totalYAmount;
            
            console.log(`[handleRefreshPositions] SDK positionData amounts (REALTIME): totalXAmount=${totalXAmount}, totalYAmount=${totalYAmount}`);
            
            // Convert to USD using realtime prices from pair reserves
            let xPrice = 0;
            let yPrice = 0;
            const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
            
            // Priority 1a: SDK pool reserves (most realtime)
            if (dlmmPool && pairInfo && solPrice > 0) {
              try {
                const lbPair = dlmmPool.lbPair;
                if (lbPair) {
                  const reserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                  const reserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                  
                  if (reserveX && reserveY) {
                    const finalReserveX = Number(reserveX.toString ? reserveX.toString() : reserveX);
                    const finalReserveY = Number(reserveY.toString ? reserveY.toString() : reserveY);
                    
                    if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && finalReserveX > 0 && finalReserveY > 0) {
                      xPrice = (finalReserveY * solPrice) / finalReserveX;
                      yPrice = solPrice;
                    }
                  }
                }
              } catch (e) {
                console.warn(`[handleRefreshPositions] Could not get reserves from SDK pool:`, e.message);
              }
            }
            
            // Priority 1b: API pair reserves (realtime from API)
            if ((xPrice === 0 || yPrice === 0) && pairInfo && solPrice > 0) {
              const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
              const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
              
              if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                if (xPrice === 0) {
                  xPrice = (reserveY * solPrice) / reserveX;
                }
                if (yPrice === 0) {
                  yPrice = solPrice;
                }
              }
            }
            
            // Method 2: Fallback to deposits if reserves not available
            if ((xPrice === 0 || yPrice === 0) && deposits.length > 0) {
              const latestDeposit = deposits[deposits.length - 1];
              const latestXAmount = Number(latestDeposit.token_x_amount || 0);
              const latestYAmount = Number(latestDeposit.token_y_amount || 0);
              const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
              const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
              
              if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                xPrice = latestXUsd / latestXAmount;
              }
              if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                yPrice = latestYUsd / latestYAmount;
              }
              
              if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                yPrice = solPrice;
              }
            }
            
            // Calculate TVL from realtime amounts and prices
            if (totalXAmount > 0 && xPrice > 0) {
              tokenXUsd = totalXAmount * xPrice;
            }
            if (totalYAmount > 0 && yPrice > 0) {
              tokenYUsd = totalYAmount * yPrice;
            }
            
            tvlUsd = tokenXUsd + tokenYUsd;
          }
          
          // Fallback: Try to get current token amounts from API position response
          if (tokenXUsd === 0 && tokenYUsd === 0 && !sdkPosition && position) {
            tokenXUsd = 
              Number(position?.token_x_usd_amount || 
                     position?.token_x_amount_usd ||
                     position?.x_amount_usd ||
                     0);
            tokenYUsd = 
              Number(position?.token_y_usd_amount || 
                     position?.token_y_amount_usd ||
                     position?.y_amount_usd ||
                     0);
            
            if (tokenXUsd === 0 && tokenYUsd === 0) {
              let tokenXAmount = Number(position?.token_x_amount || position?.x_amount || 0);
              let tokenYAmount = Number(position?.token_y_amount || position?.y_amount || 0);
              
              if ((tokenXAmount > 0 || tokenYAmount > 0) && pairInfo) {
                let xPrice = 0;
                let yPrice = 0;
                const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
                
                if (pairInfo && solPrice > 0) {
                  const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                  const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                  
                  if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                    xPrice = (reserveY * solPrice) / reserveX;
                    yPrice = solPrice;
                  }
                }
                
                if ((xPrice === 0 || yPrice === 0) && deposits.length > 0) {
                  const latestDeposit = deposits[deposits.length - 1];
                  const latestXAmount = Number(latestDeposit.token_x_amount || 0);
                  const latestYAmount = Number(latestDeposit.token_y_amount || 0);
                  const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
                  const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
                  
                  if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                    xPrice = latestXUsd / latestXAmount;
                  }
                  if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                    yPrice = latestYUsd / latestYAmount;
                  }
                  
                  if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                    yPrice = solPrice;
                  }
                }
                
                if (tokenXAmount > 0 && xPrice > 0) {
                  tokenXUsd = tokenXAmount * xPrice;
                }
                if (tokenYAmount > 0 && yPrice > 0) {
                  tokenYUsd = tokenYAmount * yPrice;
                }
              }
            }
            
            tvlUsd = tokenXUsd + tokenYUsd;
            
            if (tvlUsd === 0 && deposits.length > 0) {
              const latestDeposit = deposits[deposits.length - 1];
              if (latestDeposit) {
                const latestXPrice = latestDeposit.token_x_usd_amount / (Number(latestDeposit.token_x_amount) || 1);
                const latestYPrice = latestDeposit.token_y_usd_amount / (Number(latestDeposit.token_y_amount) || 1);
                
                let tokenXAmount = Number(position?.token_x_amount || position?.x_amount || 0);
                let tokenYAmount = Number(position?.token_y_amount || position?.y_amount || 0);
                
                if (tokenXAmount > 0 || tokenYAmount > 0) {
                  tvlUsd = (tokenXAmount * latestXPrice) + (tokenYAmount * latestYPrice);
                } else {
                  tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
                }
              } else {
                tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
              }
            } else if (tvlUsd === 0) {
              tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
            }
          } else {
            tvlUsd = Math.max(0, totalDepositUsd - totalWithdrawUsd);
          }
          
          // Calculate claimed fees (fees that have been claimed) - PER POSITION
          // IMPORTANT: Use total_fee_usd_claimed from API response (most accurate, already calculated by API)
          let totalClaimedFeeUsd = 0;
          
          // Priority 1: Get claimed fees directly from API position response
          // API provides total_fee_usd_claimed which is already calculated with historical prices
          if (position && position.total_fee_usd_claimed !== undefined && position.total_fee_usd_claimed !== null) {
            totalClaimedFeeUsd = Number(position.total_fee_usd_claimed) || 0;
            console.log(`[handleRefreshPositions] Using total_fee_usd_claimed from API: $${totalClaimedFeeUsd}`);
          }
          
          // Store claimed fee amounts from SDK for unclaimed fees calculation (to subtract from total fees)
          // We still need this to calculate unclaimed fees correctly
          let claimedFeeXRaw = 0;
          let claimedFeeYRaw = 0;
          if (sdkPosition && sdkPosition.positionData) {
            const posData = sdkPosition.positionData;
            if (posData.totalClaimedFeeXAmount) {
              claimedFeeXRaw = Number(posData.totalClaimedFeeXAmount.toString());
            }
            if (posData.totalClaimedFeeYAmount) {
              claimedFeeYRaw = Number(posData.totalClaimedFeeYAmount.toString());
            }
          }
          
          // Unclaimed fees: Fees that can be claimed but haven't been claimed yet
          // Priority: Use getUnClaimLpFee() from SDK (most accurate method)
          let unclaimedFeeXUsd = 0;
          let unclaimedFeeYUsd = 0;
          let totalUnclaimedFeeUsd = 0;
          
          // Track which method we use to get fees - some methods return unclaimed only, others return total
          let feeXRaw = 0;
          let feeYRaw = 0;
          let usingUnclaimedMethod = false; // Track if we used a method that already returns unclaimed fees
          
          // Option 1: Use SDK getUnClaimLpFee() - most accurate method for unclaimed fees
          // This method uses getPoolState() and getPositionState() to calculate unclaimed fees
          if (dlmmPool && positionPubkey) {
            try {
              // Import getUnClaimLpFee directly as named export (dynamic import at runtime)
              let getUnClaimLpFeeFunc = null;
              
              if (typeof window !== 'undefined') {
                try {
                  // Dynamic import to get getUnClaimLpFee as named export
                  const dlmmModule = await import('@meteora-ag/dlmm');
                  if (dlmmModule.getUnClaimLpFee && typeof dlmmModule.getUnClaimLpFee === 'function') {
                    getUnClaimLpFeeFunc = dlmmModule.getUnClaimLpFee;
                    console.log(`[handleRefreshPositions] ✓ Found getUnClaimLpFee as named export`);
                  } else {
                    console.warn(`[handleRefreshPositions] getUnClaimLpFee not found. Available exports:`, Object.keys(dlmmModule));
                  }
                } catch (importErr) {
                  console.warn(`[handleRefreshPositions] Dynamic import failed:`, importErr.message);
                }
              }
              
              if (getUnClaimLpFeeFunc) {
                // Get pool state and position state
                const poolState = await dlmmPool.getPoolState();
                const positionState = await dlmmPool.getPositionState(positionPubkey);
                
                // Calculate unclaimed fees using getUnClaimLpFee
                const unclaimed = getUnClaimLpFeeFunc(poolState, positionState);
                
                if (unclaimed) {
                  feeXRaw = Number(unclaimed.feeTokenA?.toString() || unclaimed.feeX?.toString() || 0);
                  feeYRaw = Number(unclaimed.feeTokenB?.toString() || unclaimed.feeY?.toString() || 0);
                  usingUnclaimedMethod = true;
                  console.log(`[handleRefreshPositions] ✓ Using getUnClaimLpFee() - unclaimed fees: feeTokenA=${feeXRaw}, feeTokenB=${feeYRaw}`);
                }
              } else {
                console.warn(`[handleRefreshPositions] getUnClaimLpFee() not found in SDK, trying fallback methods...`);
              }
            } catch (e) {
              console.warn(`[handleRefreshPositions] getUnClaimLpFee() failed:`, e.message, e.stack);
            }
          }
          
          // Option 2: Use SDK getPosition() data - fallback if getUnClaimLpFee not available
          if ((feeXRaw === 0 && feeYRaw === 0) && sdkPosition && sdkPosition.positionData) {
            try {
              const posData = sdkPosition.positionData;
              
              // Priority 2a: Use SDK methods that explicitly return unclaimed fees
              if (typeof sdkPosition.getUnclaimedFees === 'function') {
                try {
                  const fees = await sdkPosition.getUnclaimedFees();
                  if (fees) {
                    feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || 0);
                    feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || 0);
                    usingUnclaimedMethod = true;
                    console.log(`[handleRefreshPositions] Using getUnclaimedFees() - already unclaimed: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                  }
                } catch (e) {
                  console.warn(`[handleRefreshPositions] SDK getUnclaimedFees() failed:`, e.message);
                }
              }
              
              // Priority 2b: Use pool methods that return claimable fees
              if ((feeXRaw === 0 && feeYRaw === 0) && dlmmPool && positionPubkey) {
                try {
                  if (typeof dlmmPool.getClaimableFees === 'function') {
                    const fees = await dlmmPool.getClaimableFees(positionPubkey);
                    if (fees) {
                      feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || fees.xFee?.toString() || 0);
                      feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || fees.yFee?.toString() || 0);
                      usingUnclaimedMethod = true;
                      console.log(`[handleRefreshPositions] Using getClaimableFees() - already unclaimed: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                    }
                  } else if (typeof dlmmPool.getPositionFees === 'function') {
                    // getPositionFees might return total fees, so we'll need to subtract claimed
                    const fees = await dlmmPool.getPositionFees(positionPubkey);
                    if (fees) {
                      feeXRaw = Number(fees.feeX?.toString() || fees.feeTokenA?.toString() || fees.xFee?.toString() || 0);
                      feeYRaw = Number(fees.feeY?.toString() || fees.feeTokenB?.toString() || fees.yFee?.toString() || 0);
                      usingUnclaimedMethod = false; // Might be total fees
                      console.log(`[handleRefreshPositions] Using getPositionFees() - might be total fees: feeX=${feeXRaw}, feeY=${feeYRaw}`);
                    }
                  }
                } catch (e) {
                  console.warn(`[handleRefreshPositions] SDK pool fee methods failed:`, e.message);
                }
              }
              
              // Priority 3: Direct access to feeX and feeY from positionData (might be total fees)
              if (feeXRaw === 0 && feeYRaw === 0) {
                if (posData.feeX) {
                  try {
                    feeXRaw = Number(posData.feeX.toString());
                    usingUnclaimedMethod = false; // feeX/feeY might be total fees
                    console.log(`[handleRefreshPositions] Using posData.feeX directly - might be total fees: ${feeXRaw}`);
                  } catch (e) {
                    console.warn(`[handleRefreshPositions] Error reading feeX:`, e.message);
                  }
                }
                
                if (posData.feeY) {
                  try {
                    feeYRaw = Number(posData.feeY.toString());
                    usingUnclaimedMethod = false; // feeX/feeY might be total fees
                    console.log(`[handleRefreshPositions] Using posData.feeY directly - might be total fees: ${feeYRaw}`);
                  } catch (e) {
                    console.warn(`[handleRefreshPositions] Error reading feeY:`, e.message);
                  }
                }
              }
              
              // IMPORTANT: Only subtract claimed fees if we didn't use a method that already returns unclaimed fees
              // Methods like getUnclaimedFees() and getClaimableFees() already return unclaimed fees only
              // But feeX/feeY directly or getPositionFees() might return total fees
              if (!usingUnclaimedMethod && (claimedFeeXRaw > 0 || claimedFeeYRaw > 0)) {
                if (claimedFeeXRaw > 0 && feeXRaw >= claimedFeeXRaw) {
                  const beforeFeeX = feeXRaw;
                  feeXRaw = feeXRaw - claimedFeeXRaw;
                  console.log(`[handleRefreshPositions] Subtracted claimed feeX from total feeX: ${beforeFeeX} - ${claimedFeeXRaw} = ${feeXRaw} (unclaimed)`);
                } else if (claimedFeeXRaw > 0 && feeXRaw > 0) {
                  console.warn(`[handleRefreshPositions] Warning: feeXRaw (${feeXRaw}) < claimedFeeXRaw (${claimedFeeXRaw}), skipping subtraction`);
                }
                if (claimedFeeYRaw > 0 && feeYRaw >= claimedFeeYRaw) {
                  const beforeFeeY = feeYRaw;
                  feeYRaw = feeYRaw - claimedFeeYRaw;
                  console.log(`[handleRefreshPositions] Subtracted claimed feeY from total feeY: ${beforeFeeY} - ${claimedFeeYRaw} = ${feeYRaw} (unclaimed)`);
                } else if (claimedFeeYRaw > 0 && feeYRaw > 0) {
                  console.warn(`[handleRefreshPositions] Warning: feeYRaw (${feeYRaw}) < claimedFeeYRaw (${claimedFeeYRaw}), skipping subtraction`);
                }
              } else if (usingUnclaimedMethod) {
                console.log(`[handleRefreshPositions] Using unclaimed method - skipping subtraction of claimed fees`);
              }
              
              // Convert raw amounts to USD using REALTIME token prices
              if (feeXRaw > 0 || feeYRaw > 0) {
                let xPrice = 0;
                let yPrice = 0;
                const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
                
                // Priority 1: SDK pool reserves (most realtime)
                if ((xPrice === 0 || yPrice === 0) && dlmmPool && pairInfo && solPrice > 0) {
                  try {
                    const lbPair = dlmmPool.lbPair;
                    if (lbPair) {
                      const reserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                      const reserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                      
                      if (reserveX && reserveY) {
                        const finalReserveX = Number(reserveX.toString ? reserveX.toString() : reserveX);
                        const finalReserveY = Number(reserveY.toString ? reserveY.toString() : reserveY);
                        
                        if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && finalReserveX > 0 && finalReserveY > 0) {
                          if (xPrice === 0) {
                            xPrice = (finalReserveY * solPrice) / finalReserveX;
                          }
                          if (yPrice === 0) {
                            yPrice = solPrice;
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`[handleRefreshPositions] Could not get reserves from SDK pool for fees:`, e.message);
                  }
                }
                
                // Priority 2: API pair reserves
                if ((xPrice === 0 || yPrice === 0) && pairInfo && solPrice > 0) {
                  const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                  const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                  
                  if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
                    if (xPrice === 0) {
                      xPrice = (reserveY * solPrice) / reserveX;
                    }
                    if (yPrice === 0) {
                      yPrice = solPrice;
                    }
                  }
                }
                
                // Method 2: Fallback to deposits
                if ((xPrice === 0 && feeXRaw > 0) || (yPrice === 0 && feeYRaw > 0)) {
                  if (deposits.length > 0) {
                    const latestDeposit = deposits[deposits.length - 1];
                    const latestXAmount = Number(latestDeposit.token_x_amount || 0);
                    const latestYAmount = Number(latestDeposit.token_y_amount || 0);
                    const latestXUsd = Number(latestDeposit.token_x_usd_amount || 0);
                    const latestYUsd = Number(latestDeposit.token_y_usd_amount || 0);
                    
                    if (xPrice === 0 && latestXAmount > 0 && latestXUsd > 0) {
                      xPrice = latestXUsd / latestXAmount;
                    }
                    if (yPrice === 0 && latestYAmount > 0 && latestYUsd > 0) {
                      yPrice = latestYUsd / latestYAmount;
                    }
                    
                    if (yPrice === 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && solPrice > 0) {
                      yPrice = solPrice;
                    }
                  }
                }
                
                // Convert to USD
                // IMPORTANT: Fee calculation harus mengikuti pergerakan harga:
                // 1. Fee meme coin (feeX) -> swap ke SOL menggunakan harga saat ini (reserves) -> kemudian ke USD
                // 2. Fee SOL (feeY) -> langsung ke USD
                // solPrice sudah didefinisikan di atas (line 2422)
                
                if (feeXRaw > 0) {
                  // IMPORTANT: feeXRaw is in raw format, need to convert using decimals
                  let tokenXDecimals = 6; // Default to 6 decimals
                  if (posData.totalXAmount) {
                    const totalXAmount = Number(posData.totalXAmount.toString ? posData.totalXAmount.toString() : posData.totalXAmount);
                    if (totalXAmount > 0 && totalXAmount < 1e12 && feeXRaw > totalXAmount) {
                      const ratio = feeXRaw / totalXAmount;
                      if (ratio > 1e5 && ratio < 1e7) {
                        tokenXDecimals = 6;
                      } else if (ratio > 1e8 && ratio < 1e10) {
                        tokenXDecimals = 9;
                      } else {
                        const logRatio = Math.log10(ratio);
                        tokenXDecimals = Math.round(logRatio);
                      }
                    }
                  }
                  const feeXAmount = feeXRaw / Math.pow(10, tokenXDecimals);
                  
                  // Step 1: Swap feeX (meme coin) ke SOL menggunakan Jupiter API (realtime price)
                  let feeXInSol = 0;
                  
                  // Priority 1: Use Jupiter API to get realtime swap rate
                  if (pairInfo && pairInfo.mint_x) {
                    try {
                      feeXInSol = await convertMemeCoinToSol(pairInfo.mint_x, feeXAmount, tokenXDecimals);
                      if (feeXInSol > 0) {
                        console.log(`[handleRefreshPositions] ✓ Swapped feeX to SOL via Jupiter: ${feeXAmount} meme coins -> ${feeXInSol} SOL`);
                      }
                    } catch (jupiterErr) {
                      console.warn(`[handleRefreshPositions] Jupiter API failed for feeX, falling back to reserves:`, jupiterErr.message);
                    }
                  }
                  
                  // Priority 2: Fallback to reserves if Jupiter API fails
                  if (feeXInSol === 0) {
                    let reserveX = 0;
                    let reserveY = 0;
                    
                    // Get reserves from SDK pool (most realtime)
                    if (dlmmPool && pairInfo) {
                      try {
                        const lbPair = dlmmPool.lbPair;
                        if (lbPair) {
                          const sdkReserveX = lbPair.reserveX || lbPair.reserve_x || lbPair.tokenXReserve || lbPair.token_x_reserve;
                          const sdkReserveY = lbPair.reserveY || lbPair.reserve_y || lbPair.tokenYReserve || lbPair.token_y_reserve;
                          
                          if (sdkReserveX && sdkReserveY) {
                            reserveX = Number(sdkReserveX.toString ? sdkReserveX.toString() : sdkReserveX);
                            reserveY = Number(sdkReserveY.toString ? sdkReserveY.toString() : sdkReserveY);
                            if (reserveY > 1e9) {
                              reserveY = reserveY / LAMPORTS_PER_SOL; // Convert to SOL
                            }
                          }
                        }
                      } catch (e) {
                        console.warn(`[handleRefreshPositions] Could not get reserves from SDK pool:`, e.message);
                      }
                    }
                    
                    // Get reserves from API
                    if ((reserveX === 0 || reserveY === 0) && pairInfo) {
                      reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
                      reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
                      if (reserveY > 1e9) {
                        reserveY = reserveY / LAMPORTS_PER_SOL; // Convert to SOL
                      }
                    }
                    
                    // Swap feeX (meme coin) ke SOL menggunakan reserves saat ini
                    if (reserveX > 0 && reserveY > 0 && pairInfo && pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y)) {
                      feeXInSol = (feeXAmount * reserveY) / reserveX;
                      console.log(`[handleRefreshPositions] ⚠ Fallback: Swapped feeX to SOL using reserves: ${feeXAmount} meme coins -> ${feeXInSol} SOL`);
                    } else {
                      // Fallback: Use price from TVL calculation
                      const effectiveXPrice = tvlXPrice > 0 ? tvlXPrice : xPrice;
                      if (effectiveXPrice > 0 && solPrice > 0) {
                        const xPriceInSol = effectiveXPrice / solPrice;
                        feeXInSol = feeXAmount * xPriceInSol;
                        console.log(`[handleRefreshPositions] ⚠ Fallback: Using TVL price to calculate swap: ${feeXAmount} * (${effectiveXPrice} USD/token / ${solPrice} USD/SOL) = ${feeXInSol} SOL`);
                      }
                    }
                  }
                  
                  // Step 2: Convert feeXInSol ke USD
                  if (feeXInSol > 0 && solPrice > 0) {
                    unclaimedFeeXUsd = feeXInSol * solPrice;
                    console.log(`[handleRefreshPositions] ✓ Converted feeX to USD: ${feeXInSol} SOL * ${solPrice} USD/SOL = ${unclaimedFeeXUsd} USD`);
                  }
                }
                
                // FeeY (SOL) langsung ke USD
                // IMPORTANT: feeYRaw is in lamports, need to convert to SOL first
                if (feeYRaw > 0) {
                  const feeYInSol = feeYRaw / LAMPORTS_PER_SOL;
                  if (solPrice > 0) {
                    unclaimedFeeYUsd = feeYInSol * solPrice;
                    console.log(`[handleRefreshPositions] ✓ Converted feeY (SOL) to USD: ${feeYRaw} lamports = ${feeYInSol} SOL * ${solPrice} USD/SOL = ${unclaimedFeeYUsd} USD`);
                  }
                }
                
                // Claimed fees are already calculated from API (total_fee_usd_claimed)
                // No need to calculate from SDK - we use API value directly
              }
            } catch (sdkFeeErr) {
              console.warn(`[handleRefreshPositions] Failed to get fees from SDK position:`, sdkFeeErr.message);
            }
          }
          
          // Fallback to API position response if SDK not available
          if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0 && !sdkPosition && position) {
            unclaimedFeeXUsd = 
              Number(position?.fee_x_amount_usd || 
                     position?.unclaimed_fee_x_usd || 
                     position?.claimable_fee_x_usd ||
                     0);
            unclaimedFeeYUsd = 
              Number(position?.fee_y_amount_usd || 
                     position?.unclaimed_fee_y_usd || 
                     position?.claimable_fee_y_usd ||
                     0);
          }
          
          // Fallback to /claim_fees endpoint if still not found
          if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0 && Array.isArray(claimFees) && claimFees.length > 0) {
            unclaimedFeeXUsd = sumUsd(claimFees.filter(f => 
              f.token === 'x' || 
              f.token_x || 
              f.token_x_amount ||
              (f.token_x_usd_amount && !f.claimed)
            ));
            unclaimedFeeYUsd = sumUsd(claimFees.filter(f => 
              f.token === 'y' || 
              f.token_y || 
              f.token_y_amount ||
              (f.token_y_usd_amount && !f.claimed)
            ));
            
            if (unclaimedFeeXUsd === 0 && unclaimedFeeYUsd === 0) {
              claimFees.forEach(fee => {
                if (fee.token_x_usd_amount) unclaimedFeeXUsd += Number(fee.token_x_usd_amount || 0);
                if (fee.token_y_usd_amount) unclaimedFeeYUsd += Number(fee.token_y_usd_amount || 0);
              });
            }
          }
          
          totalUnclaimedFeeUsd = unclaimedFeeXUsd + unclaimedFeeYUsd;
          
          // Calculate UPNL: (Current TVL + Unclaimed Fees + Claimed Fees) - Net deposits
          // UPNL includes all profit/loss from the position including fees earned
          const netDepositUsd = totalDepositUsd - totalWithdrawUsd;
          
          console.log(`[handleRefreshPositions] ========== UPNL Calculation (WITH FEES) ==========`);
          console.log(`[handleRefreshPositions] - TVL (LIQUIDITY): $${tvlUsd}`);
          console.log(`[handleRefreshPositions] - Unclaimed Fees (SOL + Meme coin): $${totalUnclaimedFeeUsd} USD`);
          console.log(`[handleRefreshPositions]   * Meme coin fees: $${unclaimedFeeXUsd} USD`);
          console.log(`[handleRefreshPositions]   * SOL fees: $${unclaimedFeeYUsd} USD`);
          console.log(`[handleRefreshPositions] - Claimed Fees (SOL + Meme coin): $${totalClaimedFeeUsd} USD`);
          console.log(`[handleRefreshPositions] - Total Value (TVL + All Fees): $${tvlUsd + totalUnclaimedFeeUsd + totalClaimedFeeUsd}`);
          console.log(`[handleRefreshPositions] - Net Deposits (deposits - withdraws): $${netDepositUsd}`);
          
          const upnl = calculateUPNL(tvlUsd, netDepositUsd, exchangeRates.SOL, totalUnclaimedFeeUsd, totalClaimedFeeUsd);
          
          console.log(`[handleRefreshPositions] - UPNL (Total Value - Net Deposits, WITH FEES): $${upnl.usd} (${upnl.percent.toFixed(2)}%)`);
          console.log(`[handleRefreshPositions] ==========================================`);

          // Final validation: Skip position if TVL is 0 or very small
          const MIN_TVL_THRESHOLD = 0.01;
          if (tvlUsd < MIN_TVL_THRESHOLD) {
            console.log(`[handleRefreshPositions] Position ${positionAddress} has TVL=${tvlUsd} (below threshold ${MIN_TVL_THRESHOLD}) - SKIPPING`);
            return null;
          }

          // Get token decimals for proper display
          let tokenXDecimals = pairInfo?.token_x?.decimals || 6;
          let tokenYDecimals = pairInfo?.token_y?.decimals || 9;
          const isYSol = pairInfo?.mint_y && SOL_MINTS.includes(pairInfo.mint_y);
          if (isYSol) {
            tokenYDecimals = 9; // SOL has 9 decimals
          }

          // Format balance amounts (convert from raw if needed)
          let balanceX = currentBalanceX;
          let balanceY = currentBalanceY;
          
          // Check if balances are in raw format and convert
          // For SOL (9 decimals), if balance > 1, it's likely in lamports (raw format)
          if (isYSol && balanceY > 1) {
            balanceY = balanceY / LAMPORTS_PER_SOL;
            console.log(`[handleRefreshPositions] Converted SOL balance from lamports: ${currentBalanceY} -> ${balanceY} SOL`);
          } else if (balanceY > 1e12) {
            balanceY = balanceY / Math.pow(10, tokenYDecimals);
          }
          
          // For token X, check if it's in raw format (very large numbers)
          if (balanceX > 1e12) {
            balanceX = balanceX / Math.pow(10, tokenXDecimals);
          }
          
          // Fallback: Get balance from API if SDK not available
          if (balanceX === 0 && balanceY === 0 && position) {
            balanceX = Number(position?.token_x_amount || position?.x_amount || 0);
            balanceY = Number(position?.token_y_amount || position?.y_amount || 0);
            // If from API and Y is SOL, might still be in lamports
            if (isYSol && balanceY > 1) {
              balanceY = balanceY / LAMPORTS_PER_SOL;
            }
          }

          // Calculate token prices for balance USD conversion
          let tokenXPriceUsd = 0;
          let tokenYPriceUsd = 0;
          const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
          
          if (pairInfo && solPrice > 0) {
            const reserveX = Number(pairInfo.reserve_x || pairInfo.token_x_reserve || pairInfo.x_reserve || pairInfo.reserveX || 0);
            const reserveY = Number(pairInfo.reserve_y || pairInfo.token_y_reserve || pairInfo.y_reserve || pairInfo.reserveY || 0);
            
            // If Y is SOL, calculate X price from reserves
            if (pairInfo.mint_y && SOL_MINTS.includes(pairInfo.mint_y) && reserveX > 0 && reserveY > 0) {
              // Convert reserveY from lamports to SOL if needed
              const reserveYInSol = reserveY > 1e9 ? reserveY / LAMPORTS_PER_SOL : reserveY;
              tokenXPriceUsd = (reserveYInSol * solPrice) / reserveX;
              tokenYPriceUsd = solPrice;
            }
          }
          
          // Use tvlXPrice and tvlYPrice if available (from TVL calculation)
          if (tvlXPrice > 0) tokenXPriceUsd = tvlXPrice;
          if (tvlYPrice > 0) tokenYPriceUsd = tvlYPrice;

          // Extract token symbols from pairInfo with multiple fallbacks
          let tokenXSymbol = pairInfo?.token_x?.symbol || 
                            pairInfo?.token_x?.name || 
                            pairInfo?.tokenX?.symbol ||
                            pairInfo?.tokenX?.name ||
                            pairInfo?.x_token?.symbol ||
                            pairInfo?.xToken?.symbol;
          
          let tokenYSymbol = pairInfo?.token_y?.symbol || 
                            pairInfo?.token_y?.name || 
                            pairInfo?.tokenY?.symbol ||
                            pairInfo?.tokenY?.name ||
                            pairInfo?.y_token?.symbol ||
                            pairInfo?.yToken?.symbol;

          // Fallback: Try to extract from pairName (e.g., "Frieren-SOL" or "Frieren/SOL" -> "Frieren" and "SOL")
          if (!tokenXSymbol || !tokenYSymbol) {
            const pairName = pairInfo?.name || '';
            if (pairName) {
              const parts = pairName.split(/[-/]/);
              if (parts.length >= 2) {
                if (!tokenXSymbol) tokenXSymbol = parts[0].trim();
                if (!tokenYSymbol) tokenYSymbol = parts[1].trim();
              }
            }
          }

          // Final fallback
          if (!tokenXSymbol) tokenXSymbol = 'X';
          if (!tokenYSymbol) tokenYSymbol = 'Y';

          return {
            address: positionAddress,
            position,
            deposits,
            withdraws, // Store withdraws for net deposits calculation
            pairInfo,
            pairName: pairInfo?.name || pairInfo?.token_x?.symbol + '/' + pairInfo?.token_y?.symbol || 'Unknown',
            pairAddress: position?.pair_address,
            claimedFeeUsd: totalClaimedFeeUsd,
            unclaimedFeeUsd: totalUnclaimedFeeUsd,
            upnl,
            tvlUsd,
            balanceX, // Current balance of Token X
            balanceY, // Current balance of Token Y
            tokenXSymbol,
            tokenYSymbol,
            tokenXPriceUsd, // Token X price in USD for balance conversion
            tokenYPriceUsd, // Token Y price in USD for balance conversion
          };
        } catch (err) {
          console.error(`Failed to refresh position ${positionAddress}:`, err);
          // Return existing position data if refresh fails
          return positions.find(p => p.address === positionAddress) || null;
        }
      });

      const refreshedPositions = await Promise.all(positionPromises);
      const validPositions = refreshedPositions.filter((p) => p !== null);

      if (validPositions.length > 0) {
        setPositions(validPositions);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Failed to refresh positions:', err);
      setError(err.message || 'Failed to refresh positions');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto refresh positions every 5 seconds
  useEffect(() => {
    // Only auto refresh if there are positions and not currently loading
    if (positions.length === 0 || isLoading) {
      return;
    }

    const intervalId = setInterval(() => {
      console.log('[Auto Refresh] Refreshing positions...');
      handleRefreshPositions();
    }, 5000); // 5 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, isLoading]); // Re-run when positions count or loading state changes

  return (
    <>
      <Head>
        <title>Metina | Portfolio</title>
        <link rel="icon" href="/img/logo-gram.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-black text-white pb-28 pt-14">
        <Header />

        <div className="w-full max-w-2xl mx-auto px-4 py-6">
          {/* Title */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">DLMM Portfolio</h1>
              {positions.length > 0 && (
                <button
                  onClick={handleRefreshPositions}
                  disabled={isLoading}
                  className="p-2 text-gray-400 hover:text-orange-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh positions (realtime data)"
                >
                  <svg
                    className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Check your open DLMM positions, fees, and unrealized PNL
              {lastUpdate && (
                <span className="ml-2 text-xs text-gray-500">
                  (Last updated: {new Date(lastUpdate).toLocaleTimeString()})
                </span>
              )}
            </p>
          </div>

          {/* Input Field */}
          <div className="relative mb-3">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => {
                setAddressInput(e.target.value);
                if (searchHistory.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onFocus={() => {
                if (searchHistory.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  setShowSuggestions(false);
                  handleFetchPositions();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                }
              }}
              placeholder="Enter your Solana address"
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
            />
            <button
              onClick={handleFetchPositions}
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-gray-400 hover:text-orange-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Fetch positions"
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
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            
            {/* Search History Suggestions */}
            {showSuggestions && searchHistory.length > 0 && (() => {
              const filteredHistory = addressInput.trim().length > 0
                ? searchHistory.filter((item) => 
                    item.toLowerCase().includes(addressInput.toLowerCase()) &&
                    item !== addressInput
                  )
                : searchHistory.filter((item) => item !== addressInput);
              
              return filteredHistory.length > 0 ? (
                <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredHistory.slice(0, 5).map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setAddressInput(item);
                        setShowSuggestions(false);
                        // Trigger search automatically with selected address
                        handleFetchPositions(item);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800 transition flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4 text-gray-400 flex-shrink-0"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-mono text-xs">{item}</span>
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500 rounded-md text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="mb-4 flex flex-col items-center gap-2 text-center">
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
              <div className="text-gray-400 text-xs">Fetching positions...</div>
            </div>
          )}

        </div>

        {/* Currency Selector - Only show when positions exist */}
        {positions.length > 0 && (
          <div className="w-full max-w-2xl mx-auto px-4 mb-4">
            <div className="flex justify-center items-center gap-3 text-xs">
              <span className="text-gray-400 uppercase tracking-wide">Currency</span>
              <div className="flex bg-gray-900 border border-gray-700 rounded-md overflow-hidden">
                {CURRENCY_OPTIONS.map((option) => {
                  const isActive = currency === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCurrency(option)}
                      className={`px-3 py-1 font-semibold transition ${
                        isActive
                          ? 'bg-orange-500 text-black'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Positions Table - Full Width Container */}
        {positions.length > 0 && (
          <div className="w-full px-2 md:px-6 overflow-x-auto mt-3">
            <div className="max-w-full md:max-w-[1320px] mx-auto">
              <div className="min-w-[800px] md:min-w-[1300px]">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b-2 border-gray-800">
                      <th className="text-left py-3 px-2 font-normal">Pair</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">TVL</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">Current Balance</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">Claimed Fee</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">Unclaimed Fee</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">UPNL</th>
                      <th className="text-right px-2 font-normal whitespace-nowrap">UPNL %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      // UPNL color: green for 0 or positive, red for negative
                      const isLoss = pos.upnl.usd < 0;
                      const tvlValue = currency === 'SOL' 
                        ? pos.tvlUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                        : pos.tvlUsd;
                      const claimedFeeValue = currency === 'SOL'
                        ? pos.claimedFeeUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                        : pos.claimedFeeUsd;
                      const unclaimedFeeValue = currency === 'SOL'
                        ? pos.unclaimedFeeUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                        : pos.unclaimedFeeUsd;
                      const upnlValue = currency === 'SOL' ? pos.upnl.sol : pos.upnl.usd;

                      // Calculate USD value for balances using stored prices
                      const balanceXUsd = (pos.balanceX || 0) * (pos.tokenXPriceUsd || 0);
                      const balanceYUsd = (pos.balanceY || 0) * (pos.tokenYPriceUsd || 0);
                      
                      // Get token symbols with multiple fallbacks
                      const tokenXSymbol = pos.tokenXSymbol || 
                                          pos.pairInfo?.token_x?.symbol || 
                                          pos.pairInfo?.token_x?.name || 
                                          pos.pairInfo?.tokenX?.symbol ||
                                          pos.pairInfo?.tokenX?.name ||
                                          pos.pairInfo?.x_token?.symbol ||
                                          pos.pairInfo?.xToken?.symbol ||
                                          'X';
                      const tokenYSymbol = pos.tokenYSymbol || 
                                          pos.pairInfo?.token_y?.symbol || 
                                          pos.pairInfo?.token_y?.name || 
                                          pos.pairInfo?.tokenY?.symbol ||
                                          pos.pairInfo?.tokenY?.name ||
                                          pos.pairInfo?.y_token?.symbol ||
                                          pos.pairInfo?.yToken?.symbol ||
                                          'Y';

                      return (
                        <tr key={pos.address} className="border-b border-gray-800/50 hover:bg-[#1e2025]">
                          <td className="py-4 px-2">
                            <div className="text-white text-xs sm:text-sm">{pos.pairName}</div>
                            <div className="text-gray-500 text-xs font-mono">
                              {pos.address.slice(0, 8)}...{pos.address.slice(-8)}
                            </div>
                          </td>
                          <td className="text-right px-2 whitespace-nowrap text-white">
                            {formatCurrency(tvlValue, { currency, exchangeRates })}
                          </td>
                          <td className="text-right px-2 whitespace-nowrap text-white">
                            <div className="text-xs">
                              <div>
                                {(pos.balanceX || 0).toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 0 })} {tokenXSymbol}
                                {balanceXUsd > 0.01 && ` ($${balanceXUsd.toFixed(2)})`}
                              </div>
                              <div className="text-gray-500">
                                {(pos.balanceY || 0).toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 0 })} {tokenYSymbol}
                                {balanceYUsd > 0.01 && ` ($${balanceYUsd.toFixed(2)})`}
                              </div>
                            </div>
                          </td>
                          <td className="text-right px-2 whitespace-nowrap text-white">
                            {formatCurrency(claimedFeeValue, { currency, exchangeRates })}
                          </td>
                          <td className="text-right px-2 whitespace-nowrap text-orange-400">
                            {formatCurrency(unclaimedFeeValue, { currency, exchangeRates })}
                          </td>
                          <td className={`text-right px-2 whitespace-nowrap ${
                            isLoss ? 'text-red-500' : 'text-green-500'
                          }`}>
                            {formatCurrency(upnlValue, { currency, exchangeRates })}
                          </td>
                          <td className={`text-right px-2 whitespace-nowrap ${
                            isLoss ? 'text-red-500' : 'text-green-500'
                          }`}>
                            {pos.upnl.percent.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-800">
                      <td className="py-4 px-2 text-white font-semibold">Total</td>
                      <td className="text-right px-2 whitespace-nowrap text-white font-semibold">
                        {formatCurrency(
                          positions.reduce((sum, pos) => {
                            const val = currency === 'SOL'
                              ? pos.tvlUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                              : pos.tvlUsd;
                            return sum + val;
                          }, 0),
                          { currency, exchangeRates }
                        )}
                      </td>
                      <td className="text-right px-2 whitespace-nowrap text-white font-semibold text-xs">
                        {formatCurrency(
                          positions.reduce((sum, pos) => {
                            // Use stored prices, with same fallback logic as when position was created
                            let tokenXPrice = pos.tokenXPriceUsd || 0;
                            let tokenYPrice = pos.tokenYPriceUsd || 0;
                            const solPrice = exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL;
                            
                            // Apply same fallback logic as in handleFetchPositions
                            if (tokenXPrice === 0 || tokenYPrice === 0) {
                              const isYSol = pos.pairInfo?.mint_y && SOL_MINTS.includes(pos.pairInfo.mint_y);
                              
                              // If Y is SOL and price is 0, use SOL price
                              if (isYSol && tokenYPrice === 0 && solPrice > 0) {
                                tokenYPrice = solPrice;
                              }
                              
                              // Calculate X price from reserves if available and price is 0
                              if (tokenXPrice === 0 && pos.pairInfo && isYSol && solPrice > 0) {
                                const reserveX = Number(pos.pairInfo.reserve_x || pos.pairInfo.token_x_reserve || pos.pairInfo.x_reserve || pos.pairInfo.reserveX || 0);
                                const reserveY = Number(pos.pairInfo.reserve_y || pos.pairInfo.token_y_reserve || pos.pairInfo.y_reserve || pos.pairInfo.reserveY || 0);
                                if (reserveX > 0 && reserveY > 0) {
                                  const reserveYInSol = reserveY > 1e9 ? reserveY / LAMPORTS_PER_SOL : reserveY;
                                  tokenXPrice = (reserveYInSol * solPrice) / reserveX;
                                }
                              }
                            }
                            
                            // Calculate balance USD (same as row)
                            const balanceXUsd = (pos.balanceX || 0) * tokenXPrice;
                            const balanceYUsd = (pos.balanceY || 0) * tokenYPrice;
                            const totalBalanceUsd = balanceXUsd + balanceYUsd;
                            const val = currency === 'SOL'
                              ? totalBalanceUsd / (solPrice || DEFAULT_EXCHANGE_RATES.SOL)
                              : totalBalanceUsd;
                            return sum + val;
                          }, 0),
                          { currency, exchangeRates }
                        )}
                      </td>
                      <td className="text-right px-2 whitespace-nowrap text-white font-semibold">
                        {formatCurrency(
                          positions.reduce((sum, pos) => {
                            const val = currency === 'SOL'
                              ? pos.claimedFeeUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                              : pos.claimedFeeUsd;
                            return sum + val;
                          }, 0),
                          { currency, exchangeRates }
                        )}
                      </td>
                      <td className="text-right px-2 whitespace-nowrap text-orange-400 font-semibold">
                        {formatCurrency(
                          positions.reduce((sum, pos) => {
                            const val = currency === 'SOL'
                              ? pos.unclaimedFeeUsd / (exchangeRates.SOL || DEFAULT_EXCHANGE_RATES.SOL)
                              : pos.unclaimedFeeUsd;
                            return sum + val;
                          }, 0),
                          { currency, exchangeRates }
                        )}
                      </td>
                      <td className={`text-right px-2 whitespace-nowrap font-semibold ${
                        positions.reduce((sum, pos) => sum + pos.upnl.usd, 0) < 0
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}>
                        {formatCurrency(
                          positions.reduce((sum, pos) => {
                            const val = currency === 'SOL' ? pos.upnl.sol : pos.upnl.usd;
                            return sum + val;
                          }, 0),
                          { currency, exchangeRates }
                        )}
                      </td>
                      <td className={`text-right px-2 whitespace-nowrap font-semibold ${
                        positions.reduce((sum, pos) => sum + pos.upnl.usd, 0) < 0
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}>
                        {(() => {
                          const totalUpnl = positions.reduce((sum, pos) => sum + pos.upnl.usd, 0);
                          // Use net deposits (deposits - withdraws) for percentage calculation
                          const totalDeposits = positions.reduce((sum, pos) => {
                            return sum + sumUsd(pos.deposits || []);
                          }, 0);
                          const totalWithdraws = positions.reduce((sum, pos) => {
                            return sum + sumUsd(pos.withdraws || []);
                          }, 0);
                          const netDeposits = totalDeposits - totalWithdraws;
                          
                          if (netDeposits > 0) {
                            return ((totalUpnl / netDeposits) * 100).toFixed(2);
                          } else if (netDeposits === 0 && totalUpnl > 0) {
                            return '100.00';
                          } else if (netDeposits === 0 && totalUpnl < 0) {
                            return '-100.00';
                          } else if (netDeposits < 0) {
                            // If net deposits is negative, calculate percentage differently
                            return ((totalUpnl / Math.abs(netDeposits)) * 100).toFixed(2);
                          }
                          return '0.00';
                        })()}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {/* {!isLoading && positions.length === 0 && !error && (
          <div className="w-full max-w-2xl mx-auto px-4">
            <div className="text-center text-gray-400 text-sm">
              Enter a Solana address to view your DLMM positions
            </div>
          </div>
        )} */}
      </div>
      <Footer />
    </>
  );
};

export default Portfolio;

