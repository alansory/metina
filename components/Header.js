import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const Header = () => {
  const [onlineUsers, setOnlineUsers] = useState(0);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    // Generate or retrieve session ID
    if (typeof window !== 'undefined') {
      let sessionId = sessionStorage.getItem('metina_session_id');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        sessionStorage.setItem('metina_session_id', sessionId);
      }
      sessionIdRef.current = sessionId;
    }

    // Fetch initial count
    const fetchOnlineCount = async () => {
      try {
        const response = await fetch('/api/online-users');
        if (response.ok) {
          const data = await response.json();
          setOnlineUsers(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching online users:', error);
      }
    };

    // Send heartbeat and update count
    const sendHeartbeat = async () => {
      try {
        const response = await fetch('/api/online-users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current
          })
        });
        if (response.ok) {
          const data = await response.json();
          setOnlineUsers(data.count || 0);
        }
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    };

    // Initial fetch
    fetchOnlineCount();
    sendHeartbeat();

    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, 30000);

    // Update count every 10 seconds (more frequent than heartbeat)
    const countInterval = setInterval(() => {
      fetchOnlineCount();
    }, 10000);

    // Cleanup on unmount
    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(countInterval);
    };
  }, []);

  return (
    <header className="flex justify-between items-center px-[18px] py-[6px] h-14 bg-black border-b border-gray-800 z-50">
      <div className="flex items-center gap-4">
        <Image 
          src="/img/metina.png" 
          alt="Metina Logo" 
          width={32} 
          height={32}
          className="object-contain"
        />
        <a 
          href="/"
          className="text-2xl sm:text-3xl md:text-[2rem] ml-[-8px] font-anta font-bold text-white hover:text-orange-500 transition"
        >
          Metina
        </a>
      </div>
      <nav className="space-x-4 flex items-center">
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="hidden sm:inline">Online:</span>
            <span className="text-white font-semibold">{onlineUsers}</span>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;

