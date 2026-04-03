import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Activity, Shield } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';
let socket; // Keep this outside to prevent multiple connections

function App() {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const peerInstance = useRef(null);

  useEffect(() => {
    setHasLoaded(true); // Forces the app to wait for the browser

    if (!socket) {
      socket = io(RENDER_URL, {
        transports: ['polling', 'websocket'], // 🟢 Polling first to bypass ISP blocks
        withCredentials: true,
        forceNew: true,
        reconnectionAttempts: 10
      });
      window.socket = socket; // For your console debugging
    }

    const onConnect = () => {
      console.log("🟢 GHOST SERVER LINKED");
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
      socket.off('receive-message');
    };
  }, [userName]);

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;
    setInRoom(true);
    
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

  // 🛡 THE HYDRATION SHIELD (Kills Error #418)
  if (!hasLoaded) return null;

  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <p className={connStatus.server ? "status-online" : "status-offline"}>
          {connStatus.server ? "🟢 Server Live" : "🔴 Reaching through the void..."}
        </p>
        <form onSubmit={joinRoom} className="join-form">
          <input type="text" placeholder="Your Ghost Name" value={userName} onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" disabled={!connStatus.server} className="primary-btn">ENTER SHADOWS</button>
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
                <div key={i} className={`msg-wrap ${m.isMine ? 'mine' : 'theirs'}`}>
                    <div className="bubble">
                        {!m.isMine && <small>{m.senderName}</small>}
                        <p>{m.text}</p>
                    </div>
                </div>
            ))}
        </div>
        <form onSubmit={sendTextMessage} className="compose">
            <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Type a message..." />
            <button type="submit"><Send size={18}/></button>
        </form>
    </div>
  );
}

export default App;