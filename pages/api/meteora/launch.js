import { checkTokenLaunched, getOrCreateDammV2Pool, openPositionOnDammV2, buyTokenAutomatically } from '../../../src/lib/meteora';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Set timeout yang lebih lama untuk real-time monitoring
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log('Request timeout after 5 minutes');
      res.status(408).json({ error: 'Request timeout' });
    }
  }, 300000); // 5 minute timeout untuk real-time monitoring

  try {
    // Ensure no caching so every call fetches fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { 
      mint, 
      waitUntilLaunched = true, // Default true untuk real-time monitoring
      timeoutSeconds = 300, // 5 menit timeout
      intervalMs = 2000, // Cek setiap 2 detik
      // solAmount = 0.1, // 0.1 SOL
      // tokenAmount = 0.1 // 0.1 token
      solAmount = 0.03, // 0.1 SOL
      tokenAmount = 0.03 // 0.1 token
    } = req.body || {};

    if (!mint || typeof mint !== 'string') {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Invalid or missing "mint"' });
    }

    console.log('=== REAL-TIME MONITORING STARTED ===');
    console.log('Target mint:', mint);
    console.log('SOL amount:', solAmount);
    console.log('Token amount:', tokenAmount);
    console.log('Monitoring interval:', intervalMs + 'ms');
    console.log('Max timeout:', timeoutSeconds + 's');

    let launchedInfo = null;
    let attempts = 0;
    const maxAttempts = Math.floor(timeoutSeconds * 1000 / intervalMs);

    // Real-time monitoring loop
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`\n--- Attempt ${attempts}/${maxAttempts} ---`);
      
      try {
        launchedInfo = await checkTokenLaunched(mint);
        console.log('Pool check result:', {
          hasPool: launchedInfo?.hasPool,
          total: launchedInfo?.total,
          status: launchedInfo?.status
        });

        if (launchedInfo?.hasPool) {
          console.log('🎉 POOL FOUND! Opening position...');
          break;
        } else {
          console.log(`⏳ No pool yet (${launchedInfo?.total || 0} pools found). Waiting ${intervalMs}ms...`);
        }
      } catch (err) {
        console.warn('Pool check failed:', err.message);
      }

      // Wait before next check
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    // Handle results
    if (launchedInfo?.hasPool) {
      console.log('✅ Pool is available! Proceeding with automatic purchase...');
      
      const poolInfo = launchedInfo.poolInfo;
      console.log('Pool info:', poolInfo);
  
      // 1. Otomatis beli token LOYAL
      console.log('Step 1: Automatically buying LOYAL token...');
      const purchaseResult = await buyTokenAutomatically({
        mint,
        solAmount,
        tokenAmount,
        poolInfo
      });
  
      if (!purchaseResult.success) {
        console.error('Failed to buy token:', purchaseResult.error);
        clearTimeout(timeout);
        return res.status(500).json({
          success: false,
          message: 'Failed to buy token automatically',
          error: purchaseResult.error,
          timestamp: new Date().toISOString()
        });
      }
  
      console.log('Token purchase successful:', purchaseResult);
  
      // 2. Open position di DAMM v2
      console.log('Step 2: Opening position in DAMM v2...');
      const position = await openPositionOnDammV2({ 
        mint, 
        poolInfo,
        solAmount,
        tokenAmount
      });
      
      console.log('Position opened:', position);
  
      clearTimeout(timeout);
      return res.status(200).json({
        success: true,
        message: 'Pool found, token purchased, and position opened successfully!',
        launchedInfo,
        poolInfo,
        purchaseResult,
        position,
        attempts,
        maxAttempts,
        monitoringTime: attempts * intervalMs + 'ms',
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('❌ No pool found after monitoring period');
      
      clearTimeout(timeout);
      return res.status(200).json({
        success: false,
        message: 'No pool found after monitoring period',
        launchedInfo,
        attempts,
        monitoringTime: attempts * intervalMs + 'ms',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    clearTimeout(timeout);
    console.error('=== REAL-TIME MONITORING ERROR ===', error);
    return res.status(500).json({ 
      error: error?.message || 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  }
}