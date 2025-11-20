import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

const Header = () => {
  const router = useRouter();
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    <>
      <header className="fixed top-0 inset-x-0 flex justify-between items-center px-[18px] py-[6px] h-14 bg-black/95 backdrop-blur-sm border-b border-gray-800 z-50">
        <div className="flex items-center gap-4">
          <Image 
            src="/img/metina-logo.png" 
            alt="Metina Logo" 
            width={32} 
            height={32}
            className="object-contain"
          />
          <Link 
            href="/"
            className="text-2xl sm:text-2xl md:text-2xl ml-[-8px] font-anta font-bold text-white transition"
          >
            Metina
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <Link 
              href="/"
              className={`px-3 py-1.5 rounded-md transition font-medium text-xs ${
                router.pathname === '/' 
                  ? 'text-orange-500 lg:text-orange-500' 
                  : 'text-white hover:text-orange-500'
              }`}
            >
              POOL
            </Link>
            <Link 
              href="/pnl-card"
              className={`px-3 py-1.5 rounded-md transition font-medium text-xs ${
                router.pathname === '/pnl-card' 
                  ? 'text-orange-500 lg:text-orange-500' 
                  : 'text-white hover:text-orange-500'
              }`}
            >
              PNL
            </Link>
            <Link 
              href="/portfolio"
              className={`px-3 py-1.5 rounded-md transition font-medium text-xs ${
                router.pathname === '/portfolio' 
                  ? 'text-orange-500 lg:text-orange-500' 
                  : 'text-white hover:text-orange-500'
              }`}
            >
              PORTO
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-gray-400 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="hidden sm:inline">Online:</span>
              <span className="text-white font-semibold">{onlineUsers}</span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden transition p-2 ${
              isMobileMenuOpen 
                ? 'text-orange-500' 
                : 'text-white'
            }`}
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>
      {isMobileMenuOpen && (
        <div className="fixed top-14 inset-x-0 md:hidden bg-black/95 backdrop-blur-sm border-b border-gray-800 z-40">
          <nav className="flex flex-col py-4 gap-2">
            <Link 
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-white text-xs hover:text-orange-500 hover:bg-gray-800 transition font-medium"
            >
              POOL
            </Link>
            <Link 
              href="/pnl-card"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-white text-xs hover:text-orange-500 hover:bg-gray-800 transition font-medium"
            >
              PNL
            </Link>
            <Link 
              href="/portfolio"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-white text-xs hover:text-orange-500 hover:bg-gray-800 transition font-medium"
            >
              PORTO
            </Link>
            <div className="flex items-center gap-2 text-gray-400 text-xs pt-2 border-t border-gray-800">
              <div className="flex items-center gap-1.5 px-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Online:</span>
                <span className="text-white font-semibold">{onlineUsers}</span>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
};

export default Header;

