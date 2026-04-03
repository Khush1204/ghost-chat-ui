import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';

function App() {
  const [isClient, setIsClient] = useState(false); // 🛡️ Hydration Shield
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });
  const socketRef = useRef(null);

  useEffect(() => {
    setIsClient(true); // Now we are safely in the browser

    if (!socketRef.current) {
      socketRef.current = io(RENDER_URL, {
        transports: ['polling', 'websocket'], // Polling first for ISP stability
        withCredentials: true,
      });

      // Attach to window so you can finally use the console
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

  // If we are still on the "Server" side, show nothing. 
  // This prevents Error #418 completely.
  if (!isClient) return null;

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