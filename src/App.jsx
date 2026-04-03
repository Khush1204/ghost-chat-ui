import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Mic, MicOff, VideoOff, PhoneOff, MonitorUp, Users, MessageSquare } from 'lucide-react';
import './App.css';

const RENDER_URL = 'https://ghost-chat-backend-vkcz.onrender.com';
let socket;

function App() {
  const [isClient, setIsClient] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [activeTab, setActiveTab] = useState('CHAT'); // 'CHAT' or 'VIDEO'
  
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [operatives, setOperatives] = useState([]); 
  
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const myVideo = useRef();
  const remoteVideo = useRef();
  const peerInstance = useRef(null);

  useEffect(() => {
    setIsClient(true);
    if (!socket) {
      socket = io(RENDER_URL, { transports: ['polling', 'websocket'], withCredentials: true });
    }

    // 1. ACTIVE OPERATIVES LISTENER
    socket.on('user-joined', (data) => {
      setOperatives(prev => [...prev, { id: data.peerId, name: data.senderName }]);
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} entered the chat.` }]);
    });

    socket.on('user-left', (data) => {
      setOperatives(prev => prev.filter(op => op.name !== data.senderName));
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} left the chat.` }]);
    });

    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, data]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('receive-message');
    };
  }, []);

  // 2. VIDEO / AUDIO ENGINE
  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMyStream(stream);
      if (myVideo.current) myVideo.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("Hardware access denied:", err);
    }
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!userName || !roomId) return;
    
    // Add yourself to the operative list locally first
    setOperatives([{ id: 'me', name: userName }]);
    setInRoom(true);
    
    const stream = await startMedia();
    const peer = new Peer({ config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    
    peer.on('open', (id) => {
      socket.emit('join-room', { roomId, userName, peerId: id });
    });

    // Answer incoming calls
    peer.on('call', (call) => {
      call.answer(stream);
      call.on('stream', (rStream) => {
        setRemoteStream(rStream);
        if (remoteVideo.current) remoteVideo.current.srcObject = rStream;
      });
    });

    peerInstance.current = peer;
  };

  // 3. HARDWARE CONTROLS
  const toggleMute = () => {
    if (myStream) {
      myStream.getAudioTracks()[0].enabled = isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleCam = () => {
    if (myStream) {
      myStream.getVideoTracks()[0].enabled = isCamOff;
      setIsCamOff(!isCamOff);
    }
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (myVideo.current) myVideo.current.srcObject = screenStream;
      // Note: Full WebRTC track replacement requires mapping through peerInstance connections
      // This immediately updates your local view to show the screen share is active.
    } catch (err) {
      console.error("Screen share canceled", err);
    }
  };

  if (!isClient) return null;

  if (!inRoom) return (
    <div className="welcome-gate">
      <div className="auth-card">
        <h1>GHOST_CHAT</h1>
        <form onSubmit={joinRoom}>
          <input type="text" placeholder="YOUR ALIAS" onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="ROOM CODE" onChange={e => setRoomId(e.target.value.toUpperCase())} required />
          <button type="submit" className="neon-btn">CONNECT</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* LEFT PANEL: ACTIVE OPERATIVES */}
      <aside className="side-bar">
        <div className="side-header">
          <Users size={18} /> <span>OPERATIVES</span>
        </div>
        <div className="user-list">
          {operatives.map((op, i) => (
            <div key={i} className="user-item">
              <span className="status-dot on"></span>
              {op.name} {op.name === userName && <span className="you-tag">(You)</span>}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN PANEL: TABS + CONTENT */}
      <main className="main-area">
        {/* TAB NAVIGATION */}
        <div className="tab-bar">
          <button className={`tab-btn ${activeTab === 'CHAT' ? 'active' : ''}`} onClick={() => setActiveTab('CHAT')}>
            <MessageSquare size={16} /> TEXT INTEL
          </button>
          <button className={`tab-btn ${activeTab === 'VIDEO' ? 'active' : ''}`} onClick={() => setActiveTab('VIDEO')}>
            <Video size={16} /> COMMS & VIDEO
          </button>
        </div>

        {/* TAB 1: CHAT VIEW (Fixed Bottom Input) */}
        {activeTab === 'CHAT' && (
          <div className="chat-view">
            <div className="message-log">
              {messages.map((m, i) => (
                <div key={i} className={`msg-wrapper ${m.type === 'system' ? 'system' : (m.senderName === userName ? 'mine' : 'theirs')}`}>
                  {m.type === 'system' ? (
                    <div className="sys-text">{m.text}</div>
                  ) : (
                    <div className="msg-bubble">
                      {m.senderName !== userName && <span className="sender-name">{m.senderName}</span>}
                      <p>{m.text}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* THE FIXED TYPING DOCK */}
            <form className="input-dock" onSubmit={(e) => {
              e.preventDefault();
              if(!inputMessage.trim()) return;
              socket.emit('send-message', { roomId, text: inputMessage, senderName: userName });
              setInputMessage('');
            }}>
              <input value={inputMessage} onChange={e => setInputMessage(e.target.value)} placeholder="Type a message..." />
              <button type="submit" className="send-btn"><Send size={18}/></button>
            </form>
          </div>
        )}

        {/* TAB 2: VIDEO / AUDIO VIEW */}
        {activeTab === 'VIDEO' && (
          <div className="video-view">
            <div className="video-grid">
              <div className="video-card remote">
                {remoteStream ? <video ref={remoteVideo} autoPlay className="main-cam" /> : <div className="waiting-text">Awaiting other operatives...</div>}
              </div>
              <div className="video-card local">
                <video ref={myVideo} autoPlay muted className="mini-cam" />
                <span className="cam-label">YOU</span>
              </div>
            </div>
            
            <div className="hardware-controls">
              <button className={`ctrl-btn ${isMuted ? 'danger' : ''}`} onClick={toggleMute}>
                {isMuted ? <MicOff /> : <Mic />}
              </button>
              <button className={`ctrl-btn ${isCamOff ? 'danger' : ''}`} onClick={toggleCam}>
                {isCamOff ? <VideoOff /> : <Video />}
              </button>
              <button className="ctrl-btn screen" onClick={shareScreen}>
                <MonitorUp />
              </button>
              <button className="ctrl-btn end-call" onClick={() => window.location.reload()}>
                <PhoneOff />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;