import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';

function App() {
  const [mounted, setMounted] = useState(false);
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });
  const socketRef = useRef(null);

  // THIS IS THE KEY: useEffect only runs on the CLIENT
  useEffect(() => {
    setMounted(true);

    if (typeof window !== 'undefined' && !socketRef.current) {
      socketRef.current = io(RENDER_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true
      });

      // Attach to window so your console command works!
      window.socket = socketRef.current;

      socketRef.current.on('connect', () => {
        setConnStatus(prev => ({ ...prev, server: true }));
      });

      socketRef.current.on('disconnect', () => {
        setConnStatus(prev => ({ ...prev, server: false }));
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
      }
    };
  }, []);

  // If we aren't mounted yet, show nothing (Prevents Error 418)
  if (!mounted) return null;

  return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <p>Status: {connStatus.server ? "🟢 Online" : "🔴 Connecting..."}</p>
        <button disabled={!connStatus.server} className="primary-btn">
          {connStatus.server ? "Enter Shadows" : "Waiting for Server..."}
        </button>
      </div>
    </div>
  );
}

export default App;