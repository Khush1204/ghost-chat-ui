import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Phone, Shield } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';

// 1. Initialize Socket OUTSIDE the component to ensure it's a singleton
let socket;

function App() {
  const [hasLoaded, setHasLoaded] = useState(false); // The "Hydration Shield"
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const peerInstance = useRef(null);

  useEffect(() => {
    // 2. Kill Error #418: Only execute this once we are safely in the browser
    setHasLoaded(true);

    if (!socket) {
      socket = io(RENDER_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true
      });
      window.socket = socket; // Now it will EXIST in your console
    }

    const onConnect = () => {
      console.log("🟢 SYSTEM: LINK ESTABLISHED");
      setConnStatus(prev => ({ ...prev, server: true }));
    };

    const onDisconnect = () => {
      setConnStatus(prev => ({ ...prev, server: false }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: data.senderName === userName }]);
    });

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [userName]);

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;
    setInRoom(true);
    
    // PeerJS Init
    const peer = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    peer.on('open', (id) => {
      setConnStatus(prev => ({ ...prev, peer: true }));
      socket.emit('join-room', { roomId, peerId: id, userName });
    });
    peerInstance.current = peer;
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    socket.emit('send-message', { roomId, text: inputMessage, senderName: userName });
    setInputMessage('');
  };

  // CRITICAL: This prevents the Vercel/React #418 crash
  if (!hasLoaded) return null;

  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <p className={connStatus.server ? "status-online" : "status-offline"}>
          {connStatus.server ? "🟢 System Ready" : "🔴 Connecting to Shadow Server..."}
        </p>
        <form onSubmit={joinRoom} className="join-form">
          <input type="text" placeholder="Identity" value={userName} onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" disabled={!connStatus.server} className="primary-btn">JOIN SHADOWS</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      <div className="status-bar">
        <span>Server: {connStatus.server ? "🟢" : "🔴"}</span>
        <span>Room: <b>{roomId}</b></span>
      </div>
      <div className="messages-area">
        {messages.map((m, i) => (
          <div key={i} className={`message-wrapper ${m.isMine ? 'mine' : 'theirs'}`}>
            <div className="bubble"><p>{m.text}</p></div>
          </div>
        ))}
      </div>
      <form onSubmit={sendTextMessage} className="compose-area">
        <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Type message..." />
        <button type="submit"><Send size={20}/></button>
      </form>
    </div>
  );
}

export default App;