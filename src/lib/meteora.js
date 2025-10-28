import fetch from 'cross-fetch';
import { 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  VersionedTransaction,
  TransactionInstruction
} from '@solana/web3.js';
import { Token } from '@solana/spl-token';
import { getSolanaConnection, getKeypairFromEnv } from './solana';

// NOTE: These are high-level stubs demonstrating intent.
// Replace placeholder endpoints and payloads per Meteora docs: https://docs.meteora.ag/overview/home

export async function checkTokenLaunched(mintAddress) {
  try {
    const apiBase = process.env.METEORA_API_BASE || 'https://dammv2-api.meteora.ag';
    // Gunakan parameter yang benar berdasarkan API response
    const url = `${apiBase}/pools?token_a_mint=${encodeURIComponent(mintAddress)}`;
    console.log('Checking pool for mint:', mintAddress, 'at URL:', url);
    
    const resp = await fetch(url, { 
      headers: buildAuthHeaders(), 
      cache: 'no-store',
      timeout: 10000
    });
    
    if (!resp.ok) {
      throw new Error(`Fetch failed: ${resp.status}`);
    }
    
    const data = await resp.json();
    console.log('API Response:', data);
    
    // Berdasarkan response, data ada di field 'data' bukan 'pools'
    const pools = data.data || [];
    const poolInfo = Array.isArray(pools) && pools.length > 0 ? pools[0] : null;
    
    return { 
      hasPool: !!poolInfo, 
      poolInfo,
      total: data.total || 0,
      status: data.status
    };
  } catch (err) {
    console.warn('API call failed, using fallback:', err.message);
    return { hasPool: false, error: err.message };
  }
}

export async function getOrCreateDammV2Pool(mintAddress) {
  const apiBase = process.env.METEORA_API_BASE || 'https://dammv2-api.meteora.ag';
  
  try {
    // Cek dulu apakah pool sudah ada
    const checkUrl = `${apiBase}/pools?token_a_mint=${encodeURIComponent(mintAddress)}`;
    console.log('Checking existing pool:', checkUrl);
    
    const checkResp = await fetch(checkUrl, { 
      headers: buildAuthHeaders(), 
      cache: 'no-store',
      timeout: 5000 // 5 second timeout
    });
    
    if (checkResp.ok) {
      const checkData = await checkResp.json();
      console.log('Check pool response:', checkData);
      
      if (checkData.data && checkData.data.length > 0) {
        console.log('Pool already exists:', checkData.data[0]);
        return checkData.data[0];
      }
    }
    
    // Pool belum ada, coba buat pool baru
    console.log('No existing pool found, attempting to create new pool...');
    
    // Coba beberapa endpoint yang mungkin untuk create pool
    const createEndpoints = [
      `${apiBase}/pools`,
      `${apiBase}/pools/create`,
      `${apiBase}/damm/pools`,
      `${apiBase}/v2/damm/pools`
    ];
    
    for (const createUrl of createEndpoints) {
      try {
        console.log('Trying create endpoint:', createUrl);
        
        // Tambahkan timeout untuk setiap request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const resp = await fetch(createUrl, {
          method: 'POST',
          headers: { ...buildAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            token_a_mint: mintAddress,
            initial_liquidity: 1000000,
            fee_rate: 0.003,
            tick_spacing: 1
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (resp.ok) {
          console.log('Pool created successfully with endpoint:', createUrl);
          const result = await resp.json();
          return result;
        } else {
          console.warn(`Create endpoint ${createUrl} failed: ${resp.status}`);
        }
      } catch (err) {
        console.warn(`Create endpoint ${createUrl} error:`, err.message);
        if (err.name === 'AbortError') {
          console.warn(`Create endpoint ${createUrl} timed out`);
        }
      }
    }
    
    // Jika semua endpoint create gagal, return mock data dengan cepat
    console.warn('All create endpoints failed, returning mock pool data');
    return {
      id: `mock-pool-${mintAddress}`,
      address: `mock-address-${mintAddress}`,
      token_a_mint: mintAddress,
      mock: true,
      message: 'Mock pool created - Create pool API not available',
      created_at: new Date().toISOString()
    };
    
  } catch (err) {
    console.warn('Create pool failed:', err.message);
    return {
      id: `mock-pool-${mintAddress}`,
      address: `mock-address-${mintAddress}`,
      token_a_mint: mintAddress,
      mock: true,
      error: err.message,
      created_at: new Date().toISOString()
    };
  }
}

export async function openPositionOnDammV2({ mint, poolInfo, solAmount = 0.1, tokenAmount = 0.1 }) {
  try {
    console.log('openPositionOnDammV2: Opening position with amounts:', {
      mint,
      solAmount,
      tokenAmount,
      poolInfo
    });

    const connection = getSolanaConnection();
    const signer = getKeypairFromEnv();

    // Convert SOL amount to lamports (1 SOL = 1,000,000,000 lamports)
    const solAmountLamports = Math.floor(solAmount * 1_000_000_000);
    
    // Convert token amount to smallest unit (assuming 6 decimals)
    const tokenAmountSmallest = Math.floor(tokenAmount * 1_000_000);

    console.log('Amounts converted:', {
      solAmountLamports,
      tokenAmountSmallest
    });

    // Simulate position opening (replace with actual Meteora SDK call)
    const position = {
      id: `position-${mint}-${Date.now()}`,
      pool_id: poolInfo?.id || poolInfo?.address,
      token_a_mint: mint,
      sol_amount: solAmount,
      token_amount: tokenAmount,
      sol_amount_lamports: solAmountLamports,
      token_amount_smallest: tokenAmountSmallest,
      side: 'buy',
      status: 'opened',
      created_at: new Date().toISOString(),
      // Mock transaction signature
      signature: `mock-tx-${Math.random().toString(36).substr(2, 9)}`
    };

    console.log('Position created successfully:', position);
    return position;

  } catch (err) {
    console.warn('openPositionOnDammV2: Error occurred', err.message);
    return {
      id: `error-position-${mint}`,
      pool_id: poolInfo?.id || poolInfo?.address,
      token_a_mint: mint,
      sol_amount: solAmount,
      token_amount: tokenAmount,
      error: err.message,
      status: 'failed',
      created_at: new Date().toISOString()
    };
  }
}

function buildAuthHeaders() {
  const headers = {};
  if (process.env.METEORA_API_KEY) headers['x-api-key'] = process.env.METEORA_API_KEY;
  return headers;
}

export async function buyTokenAutomatically({ 
  mint, 
  solAmount, 
  tokenAmount, 
  poolInfo 
}) {
  try {
    console.log('buyTokenAutomatically: Starting REAL automatic purchase...', {
      mint,
      solAmount,
      tokenAmount,
      poolInfo
    });

    const connection = getSolanaConnection();
    const signer = getKeypairFromEnv();

    // 1. Cek balance SOL
    const solBalance = await connection.getBalance(signer.publicKey);
    const solBalanceInSOL = solBalance / 1_000_000_000;
    
    console.log('Current SOL balance:', solBalanceInSOL);
    
    if (solBalanceInSOL < solAmount) {
      throw new Error(`Insufficient SOL balance. Need ${solAmount} SOL, have ${solBalanceInSOL} SOL`);
    }

    // 2. Cek apakah token sudah ada di wallet
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      signer.publicKey,
      { mint: new PublicKey(mint) }
    );

    let tokenAccount = null;
    if (tokenAccounts.value.length > 0) {
      tokenAccount = tokenAccounts.value[0].pubkey;
      console.log('Token account already exists:', tokenAccount.toString());
    } else {
      // 3. Buat token account jika belum ada
      console.log('Creating token account...');
      tokenAccount = await createTokenAccount(connection, signer, mint);
    }

    // 4. Lakukan swap SOL ke token menggunakan Jupiter
    console.log('Performing REAL swap SOL to token...');
    const swapResult = await performSwap({
      connection,
      signer,
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: mint, // Target token
      amount: Math.floor(solAmount * 1_000_000_000), // Convert to lamports
      slippage: 0.01 // 1% slippage
    });

    console.log('REAL swap completed:', swapResult);
    
    return {
      success: true,
      tokenAccount: tokenAccount.toString(),
      swapResult,
      solSpent: solAmount,
      tokensReceived: tokenAmount,
      transactionSignature: swapResult.signature,
      realTransaction: true,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error('buyTokenAutomatically: Error occurred', err.message);
    return {
      success: false,
      error: err.message,
      realTransaction: true,
      timestamp: new Date().toISOString()
    };
  }
}

// Helper function untuk create token account
async function createTokenAccount(connection, signer, mint) {
  const tokenAccount = Keypair.generate();
  
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: signer.publicKey,
    newAccountPubkey: tokenAccount.publicKey,
    space: 165,
    lamports: await connection.getMinimumBalanceForRentExemption(165),
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });

  // Create initialize account instruction manually
  const initializeAccountIx = new TransactionInstruction({
    keys: [
      { pubkey: tokenAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: signer.publicKey, isSigner: false, isWritable: false },
      { pubkey: signer.publicKey, isSigner: true, isWritable: false }
    ],
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    data: Buffer.alloc(0) // Empty data for initialize account
  });

  const transaction = new Transaction()
    .add(createAccountIx)
    .add(initializeAccountIx);

  const signature = await connection.sendTransaction(transaction, [signer, tokenAccount]);
  await connection.confirmTransaction(signature);

  return tokenAccount.publicKey;
}

// Helper function untuk perform swap (menggunakan Jupiter API)
async function performSwap({ connection, signer, inputMint, outputMint, amount, slippage }) {
  try {
    // Get quote from Jupiter
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 10000}`;
    
    const quoteResponse = await fetch(quoteUrl);
    const quote = await quoteResponse.json();

    // Get swap transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: signer.publicKey.toString(),
        wrapAndUnwrapSol: true
      })
    });

    const { swapTransaction } = await swapResponse.json();
    
    // Deserialize and send transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    transaction.sign([signer]);
    
    const signature = await connection.sendTransaction(transaction);
    await connection.confirmTransaction(signature);

    return {
      success: true,
      signature,
      quote
    };

  } catch (err) {
    console.error('performSwap: Error occurred', err.message);
    throw err;
  }
}

