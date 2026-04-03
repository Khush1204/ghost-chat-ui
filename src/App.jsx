import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Users } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';
const socket = io(RENDER_URL, { 
  transports: ['websocket', 'polling'],
  withCredentials: true // 👈 Add this line!
});
function App() {
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [peers, setPeers] = useState({}); 
  const [connStatus, setConnStatus] = useState({ server: false, peer: false });

  const myStreamRef = useRef(null);
  const peerInstance = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setConnStatus(prev => ({ ...prev, server: true })));
    socket.on('disconnect', () => setConnStatus(prev => ({ ...prev, server: false })));

    socket.on('user-joined', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} joined!` }]);
    });

    socket.on('get-active-members', (members) => {
        const memberObj = {};
        members.forEach(m => { 
            if(m.userName !== userName) memberObj[m.peerId] = { name: m.userName, stream: null };
        });
        setPeers(memberObj);
    });

    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: data.senderName === userName }]);
    });

    return () => socket.off();
  }, [userName]);

  const initMesh = () => {
    const peer = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
      setConnStatus(prev => ({ ...prev, peer: true }));
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

    peer.on('call', (call) => {
      call.answer(myStreamRef.current || undefined);
      call.on('stream', (remoteStream) => {
        setPeers(prev => ({ ...prev, [call.peer]: { ...prev[call.peer], stream: remoteStream } }));
      });
    });

    peerInstance.current = peer;
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;
    setInRoom(true);
    initMesh();
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { roomId, text: inputMessage, senderName: userName };
    socket.emit('send-message', msg);
    setInputMessage('');
  };

  if (!inRoom) return (
    <div className="join-screen">
        <div className="glass-panel">
            <h1>Ghost Chat 👻</h1>
            <p>Server Status: {connStatus.server ? "🟢 Online" : "🔴 Connecting to Render..."}</p>
            <form onSubmit={joinRoom} className="join-form">
                <input type="text" placeholder="Your Name" value={userName} onChange={e => setUserName(e.target.value)} required />
                <input type="text" placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required />
                <button type="submit" className="primary-btn" disabled={!connStatus.server}>Join Room</button>
            </form>
        </div>
    </div>
  );

  return (
    <div className="chat-layout">
        <div className="status-bar">
            <span>Server: {connStatus.server ? "🟢" : "🔴"}</span>
            <span>Peer Cloud: {connStatus.peer ? "🟢" : "🔴"}</span>
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