import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Activity } from 'lucide-react';
import './App.css';

// 1. Ensure NO trailing slash at the end of the URL
const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';

// 2. Initialize socket with aggressive reconnection for strict browsers
const socket = io(RENDER_URL, { 
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 20000
});

function App() {
  const [mounted, setMounted] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const peerInstance = useRef(null);

  // HANDLE CONNECTION LOGIC
  useEffect(() => {
    setMounted(true);
    window.socket = socket; // For your Console debugging

    const onConnect = () => {
      console.log("🟢 1. SOCKET CONNECTED TO RENDER");
      setConnStatus(prev => ({ ...prev, server: true }));
    };

    const onDisconnect = () => {
      console.log("🔴 1. SOCKET DISCONNECTED");
      setConnStatus(prev => ({ ...prev, server: false }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    
    // Global message listener
    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: data.senderName === userName }]);
    });

    socket.on('user-joined', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} joined the shadows.` }]);
    });

    // If it's already connected by the time we load
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive-message');
      socket.off('user-joined');
    };
  }, [userName]);

  const initPeer = () => {
    const peer = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
      console.log("🟢 2. PEERJS CLOUD READY");
      setConnStatus(prev => ({ ...prev, peer: true }));
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

    peerInstance.current = peer;
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;
    setInRoom(true);
    initPeer();
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { roomId, text: inputMessage, senderName: userName };
    socket.emit('send-message', msg);
    setInputMessage('');
  };

  // Prevent Hydration Error #418
  if (!mounted) return null;

  if (!inRoom) return (
    <div className="join-screen">
        <div className="glass-panel">
            <h1>Ghost Chat 👻</h1>
            <div className={`status-indicator ${connStatus.server ? 'online' : 'offline'}`}>
                {connStatus.server ? "🟢 Server Online" : "🔴 Connecting to Render..." }
            </div>
            <form onSubmit={joinRoom} className="join-form">
                <input type="text" placeholder="Your Name" value={userName} onChange={e => setUserName(e.target.value)} required />
                <input type="text" placeholder="Room ID (e.g., LAKSHYA)" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
                <button type="submit" className="primary-btn" disabled={!connStatus.server}>Enter the Shadows</button>
            </form>
        </div>
    </div>
  );

  return (
    <div className="chat-layout">
        <div className="status-bar">
            <span>Server: {connStatus.server ? "🟢" : "🔴"}</span>
            <span>Cloud: {connStatus.peer ? "🟢" : "🔴"}</span>
            <span>Room: <b>{roomId}</b></span>
        </div>
        
        <div className="chat-main">
            <div className="messages-area">
                {messages.map((m, i) => (
                    <div key={i} className={`message-wrapper ${m.type === 'system' ? 'system' : (m.isMine ? 'mine' : 'theirs')}`}>
                        <div className="bubble">
                            {!m.isMine && m.type !== 'system' && <small>{m.senderName}</small>}
                            <p>{m.text}</p>
                        </div>
                    </div>
                ))}
            </div>
            <form onSubmit={sendTextMessage} className="compose-area">
                <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Type a message..." />
                <button type="submit" className="send-btn"><Send size={20}/></button>
            </form>
        </div>
    </div>
  );
}

export default App;