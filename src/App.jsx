import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';

function App() {
  const [mounted, setMounted] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const socketRef = useRef(null);
  const peerInstance = useRef(null);

  useEffect(() => {
    // 1. KILL ERROR #418: Only start logic once the browser is ready
    setMounted(true);

    // 2. Initialize Socket inside useEffect to keep it out of the Pre-render
    if (!socketRef.current) {
      socketRef.current = io(RENDER_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      // 3. FIX THE SCOPE: Attach it to window for your console commands
      window.socket = socketRef.current;
    }

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log("🟢 [DEBUG] Socket Connected!");
      setConnStatus(prev => ({ ...prev, server: true }));
    });

    socket.on('disconnect', () => {
      setConnStatus(prev => ({ ...prev, server: false }));
    });

    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: data.senderName === userName }]);
    });

    // Check initial state
    if (socket.connected) setConnStatus(prev => ({ ...prev, server: true }));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive-message');
    };
  }, [userName]);

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;
    
    setInRoom(true);
    
    // Initialize PeerJS only when joining
    const peer = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
      setConnStatus(prev => ({ ...prev, peer: true }));
      socketRef.current.emit('join-room', { roomId, peerId: id, userName });
    });

    peerInstance.current = peer;
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { roomId, text: inputMessage, senderName: userName };
    socketRef.current.emit('send-message', msg);
    setInputMessage('');
  };

  // 4. PREVENT HYDRATION CRASH: Return null until mounted
  if (!mounted) return null;

  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <div className={`status-pill ${connStatus.server ? 'online' : 'offline'}`}>
          {connStatus.server ? "🟢 Server Online" : "🔴 Connecting to Render..."}
        </div>
        <form onSubmit={joinRoom} className="join-form">
          <input type="text" placeholder="Name" value={userName} onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" disabled={!connStatus.server}>Enter Shadows</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      <div className="status-bar">
        <span>Server: {connStatus.server ? "🟢" : "🔴"}</span>
        <span>Room: {roomId}</span>
      </div>
      <div className="messages-area">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.isMine ? 'mine' : 'theirs'}`}>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={sendTextMessage} className="compose">
        <input value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;