// In-memory store for tracking online users
// In production, consider using Redis or a database
const activeUsers = new Map(); // sessionId -> lastSeen timestamp

// Clean up inactive users (no ping for 60 seconds)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 60 seconds
  
  for (const [sessionId, lastSeen] of activeUsers.entries()) {
    if (now - lastSeen > timeout) {
      activeUsers.delete(sessionId);
    }
  }
}, 30000); // Run cleanup every 30 seconds

export default async function handler(req, res) {
  // Set CORS headers if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    // Heartbeat - user is online
    const sessionId = req.body.sessionId || req.headers['x-session-id'] || 
                      `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    activeUsers.set(sessionId, Date.now());
    
    return res.status(200).json({
      success: true,
      count: activeUsers.size,
      sessionId
    });
  }

  if (req.method === 'GET') {
    // Get current online user count
    return res.status(200).json({
      count: activeUsers.size,
      timestamp: Date.now()
    });
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

// Cleanup on server shutdown (if possible)
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
  });
}

