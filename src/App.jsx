import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Mic, MessageSquare, Shield, Activity } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';
let socket; 

function App() {
  const [isClient, setIsClient] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const socketRef = useRef(null);
  const peerInstance = useRef(null);

  useEffect(() => {
    setIsClient(true); 

    if (!socket) {
      socket = io(RENDER_URL, {
        transports: ['polling', 'websocket'],
        withCredentials: true,
      });
      socketRef.current = socket;
      window.socket = socket;
    }

    socket.on('connect', () => setConnStatus(prev => ({ ...prev, server: true })));
    socket.on('disconnect', () => setConnStatus(prev => ({ ...prev, server: false })));
    
    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: data.senderName === userName }]);
    });

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

    // RESTORE: PeerJS Logic for Video/Audio signaling
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

  if (!isClient) return null;

  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <div className="logo-area">
          <Shield className="glow-icon" size={40} />
          <h1>GHOST CHAT</h1>
        </div>
        <div className={`status-tag ${connStatus.server ? 'online' : 'offline'}`}>
          <Activity size={14} /> {connStatus.server ? "SECURE LINK ACTIVE" : "ESTABLISHING ENCRYPTION..."}
        </div>
        <form onSubmit={joinRoom} className="join-form">
          <input type="text" placeholder="GHOST IDENTITY" value={userName} onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="ROOM SECURE ID" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" disabled={!connStatus.server} className="glow-button">INITIALIZE SESSION</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <div className="room-info">
          <MessageSquare size={18} /> <span>ROOM: <b>{roomId}</b></span>
        </div>
        <div className="actions">
          <button className="icon-btn"><Video size={20} /></button>
          <button className="icon-btn"><Mic size={20} /></button>
        </div>
      </header>

      <div className="messages-container">
        {messages.map((m, i) => (
          <div key={i} className={`msg-block ${m.isMine ? 'mine' : 'theirs'}`}>
            <div className="msg-bubble">
              {!m.isMine && <span className="sender-label">{m.senderName}</span>}
              <p>{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendTextMessage} className="input-dock">
        <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Transmit data..." />
        <button type="submit" className="send-trigger"><Send size={20}/></button>
      </form>
    </div>
  );
}

export default App;