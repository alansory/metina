// API route to fetch SOL price (proxy to avoid CORS issues)
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Try multiple APIs with fallbacks
  let solPrice = null;
  let source = '';

  // Method 1: CoinGecko (most reliable)
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      solPrice = data?.solana?.usd;
      if (solPrice) {
        source = 'coingecko';
      }
    }
  } catch (err) {
    console.warn('CoinGecko API failed:', err.message);
  }

  // Method 2: Binance (fallback)
  if (!solPrice) {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        solPrice = parseFloat(data?.price);
        if (solPrice) {
          source = 'binance';
        }
      }
    } catch (err) {
      console.warn('Binance API failed:', err.message);
    }
  }

  // Method 3: Jupiter (last resort)
  if (!solPrice) {
    try {
      const response = await fetch('https://price.jup.ag/v6/price?ids=SOL', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        solPrice = data?.data?.SOL?.price;
        if (solPrice) {
          source = 'jupiter';
        }
      }
    } catch (err) {
      console.warn('Jupiter API failed:', err.message);
    }
  }

  if (solPrice) {
    return res.status(200).json({ price: solPrice, source });
  } else {
    // Return default value if all APIs fail
    return res.status(200).json({ price: 150, source: 'default' });
  }
}

