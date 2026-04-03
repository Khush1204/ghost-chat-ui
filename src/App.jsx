import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Mic, MicOff, VideoOff, PhoneOff, MonitorUp, Users, Smile } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';
let socket;

function App() {
  const [isClient, setIsClient] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [users, setUsers] = useState([]); // List for the Left Panel
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callType, setCallType] = useState(null); // 'voice', 'video', or null
  const [isMuted, setIsMuted] = useState(false);

  const myVideo = useRef();
  const remoteVideo = useRef();
  const peerInstance = useRef(null);

  useEffect(() => {
    setIsClient(true);
    if (!socket) {
      socket = io(RENDER_URL, { transports: ['polling', 'websocket'], withCredentials: true });
    }

    socket.on('user-list', (userList) => setUsers(userList));
    
    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, data]);
    });

    socket.on('sys-notification', (text) => {
      setMessages(prev => [...prev, { type: 'system', text }]);
    });

    return () => socket.off();
  }, []);

  const initMedia = async (video = true) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
    setMyStream(stream);
    if (myVideo.current) myVideo.current.srcObject = stream;
    return stream;
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName || !roomId) return;
    setInRoom(true);
    
    const peer = new Peer();
    peer.on('open', (id) => {
      socket.emit('join-room', { roomId, userName, peerId: id });
    });

    peer.on('call', async (call) => {
      const stream = await initMedia(call.options.metadata.type === 'video');
      call.answer(stream);
      call.on('stream', (rStream) => setRemoteStream(rStream));
    });

    peerInstance.current = peer;
  };

  const toggleMute = () => {
    myStream.getAudioTracks()[0].enabled = !isMuted;
    setIsMuted(!isMuted);
  };

  const shareScreen = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
    myVideo.current.srcObject = screenStream;
    // Update logic to replace track in peer call here
  };

  if (!isClient) return null;

  if (!inRoom) return (
    <div className="welcome-gate">
      <div className="auth-card">
        <h1 className="glitch-text">GHOST_INTEL</h1>
        <form onSubmit={joinRoom}>
          <input type="text" placeholder="GHOST_ID" onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="SECURE_ROOM" onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" className="neon-btn">INITIALIZE</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* 5. Left Panel: User List */}
      <aside className="side-bar">
        <h3><Users size={18} /> OPERATIVES</h3>
        <div className="user-list">
          {users.map((u, i) => (
            <div key={i} className="user-item">
              <span className={`status-dot ${u.online ? 'on' : 'off'}`}></span>
              {u.name} {u.name === userName && "(You)"}
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-area">
        {/* 6, 7, 8. Call Interface */}
        {myStream && (
          <div className="media-bridge">
            <video ref={myVideo} autoPlay muted className="mini-cam" />
            {remoteStream && <video ref={remoteVideo} autoPlay className="main-cam" />}
            <div className="call-controls">
              <button onClick={toggleMute}>{isMuted ? <MicOff /> : <Mic />}</button>
              <button onClick={shareScreen}><MonitorUp /></button>
              <button className="hangup" onClick={() => window.location.reload()}><PhoneOff /></button>
            </div>
          </div>
        )}

        <div className="message-log">
          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.type === 'system' ? 'center' : (m.sender === userName ? 'right' : 'left')}`}>
              <div className="msg-content">
                {m.type !== 'system' && <small>{m.sender}</small>}
                <p>{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 4. Stickers & Input */}
        <form className="input-dock" onSubmit={(e) => {
          e.preventDefault();
          socket.emit('send-message', { roomId, text: inputMessage, sender: userName });
          setInputMessage('');
        }}>
          <button type="button" className="sticker-btn"><Smile /></button>
          <input value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Enter encrypted data..." />
          <button type="submit" className="send-btn"><Send /></button>
        </form>
      </main>
    </div>
  );
}

export default App;