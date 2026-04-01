import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Phone, MonitorUp, Paperclip, Sticker, User, VideoOff, MicOff, Check, CheckCheck } from 'lucide-react';
import './App.css';

const socket = io('https://ghost-chat-server.onrender.com', {
  transports: ['websocket', 'polling']
});
const STICKERS = ['🚀', '👻', '💀', '👽', '🍕', '🎉', '🔥', '💯'];
// Helper for rendering multiple video streams
const RemoteVideoPlayer = ({ stream, name }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay playsInline className="remote-video" />
      <span className="name-badge">{name}</span>
    </div>
  );
};

function App() {
  // --- UI & DATA STATES ---
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  
  // --- MEDIA & PRIVACY STATES ---
  const [mediaStreamed, setMediaStreamed] = useState(false); 
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // --- NETWORK REFS & STATES ---
  const [myPeerId, setMyPeerId] = useState('');
  const [peers, setPeers] = useState({}); // { peerId: { stream, name } }
  
  const myVideoRef = useRef();
  const myStreamRef = useRef(null);
  const peerInstance = useRef(null);
  const callsRef = useRef({}); // Tracks video calls
  const connsRef = useRef({}); // Tracks data channels (files/stickers)

  // --- 1. JOIN LOGIC ---
  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return alert("Fill in all fields!");
    setInRoom(true);
    initMesh();
  };

  const initMesh = () => {
    // Look at your own backend instead of 0.peerjs.com
  const peer = new Peer({
  host: 'ghost-chat-server.onrender.com', // CRITICAL: Remove the "https://" part!
  port: 443,                              // CRITICAL: Must be 443 for the live web
  path: '/myapp',
  secure: true,                           // CRITICAL: Required for webcams to work
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
});
    
    peerInstance.current = peer;
    // ... rest of your peer.on listeners

    peer.on('open', (id) => {
      setMyPeerId(id);
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

    // Handle Incoming Media
    peer.on('call', (call) => {
      myStreamRef.current ? call.answer(myStreamRef.current) : call.answer();
      callsRef.current[call.peer] = call;
      call.on('stream', (remStream) => {
        setPeers(p => ({ ...p, [call.peer]: { ...p[call.peer], stream: remStream } }));
      });
    });

    // Handle Incoming Data (Files/Stickers)
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connsRef.current[conn.peer] = conn;
        conn.on('data', (data) => handleIncomingData(data, false));
      });
    });

    // --- SOCKET EVENTS ---
    socket.on('user-joined', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} joined the room!` }]);
      setPeers(prev => ({ ...prev, [data.peerId]: { stream: null, name: data.senderName } }));
      
      // Establish data connection for chat features
      const conn = peerInstance.current.connect(data.peerId);
      conn.on('open', () => {
        connsRef.current[data.peerId] = conn;
        conn.on('data', (d) => handleIncomingData(d, false));
      });

      // If we are already streaming video, call them immediately
      if (myStreamRef.current) {
        const call = peerInstance.current.call(data.peerId, myStreamRef.current);
        callsRef.current[data.peerId] = call;
        call.on('stream', (rs) => {
          setPeers(p => ({ ...p, [data.peerId]: { ...p[data.peerId], stream: rs } }));
        });
      }
    });

    socket.on('user-left', (data) => {
      setMessages(p => [...p, { type: 'system', text: `${data.userName} has left.` }]);
      setPeers(p => {
        const updated = { ...p };
        delete updated[data.peerId];
        return updated;
      });
    });

    socket.on('receive-message', (data) => {
      if (data.type === 'read-receipt') {
        setMessages(p => p.map(m => m.id === data.messageId ? { ...m, status: 'read' } : m));
      } else {
        setMessages(p => [...p, { ...data, isMine: false }]);
        socket.emit('send-message', { roomId, type: 'read-receipt', messageId: data.id });
      }
    });
  };

  useEffect(() => {
    return () => socket.off('receive-message');
  }, []);

   // --- 2. MEDIA HANDLING (FIXED) ---
  const turnOnMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      // NO MORE MUTING HERE! 
      // If they clicked the green button, they want to be seen!
      
      myStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;
      
      setMediaStreamed(true);
      setIsMuted(false);    // <--- Changed to false! Starts with mic ON
      setIsVideoOff(false); // <--- Changed to false! Starts with video ON

      // Distribute our active stream to all peers
      Object.keys(peers).forEach(id => {
        const call = peerInstance.current.call(id, stream);
        callsRef.current[id] = call;
        call.on('stream', (rs) => {
          setPeers(p => ({ ...p, [id]: { ...p[id], stream: rs } }));
        });
      });
    } catch (e) {
      alert("Camera access denied! Check browser permissions.");
    }
  };

  const toggleMute = () => {
    const track = myStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  };

  const toggleVideo = () => {
    const track = myStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsVideoOff(!track.enabled); }
  };

  const toggleScreenShare = async () => {
    if (!mediaStreamed) return alert("Enable media first!");
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        // Replace video track for all connections
        Object.values(callsRef.current).forEach(call => {
          const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(track);
        });
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;
        setIsScreenSharing(true);
        track.onended = () => stopScreenShare();
      } else { stopScreenShare(); }
    } catch (e) { console.error(e); }
  };

  const stopScreenShare = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const track = stream.getVideoTracks()[0];
    myStreamRef.current.getVideoTracks()[0].stop();
    myStreamRef.current = stream;
    Object.values(callsRef.current).forEach(call => {
      const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
      if (sender) sender.replaceTrack(track);
    });
    if (myVideoRef.current) myVideoRef.current.srcObject = stream;
    setIsScreenSharing(false);
    if (isVideoOff) track.enabled = false;
  };

  // --- 3. WIDGETS & MESSAGING ---
  const broadcastData = (data) => {
    Object.values(connsRef.current).forEach(conn => { if (conn.open) conn.send(data); });
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { 
      id: Math.random().toString(36).slice(2, 10), 
      roomId, 
      text: inputMessage, 
      type: 'text', 
      senderName: userName, 
      status: 'sent' 
    };
    socket.emit('send-message', msg);
    setMessages(p => [...p, { ...msg, isMine: true }]);
    setInputMessage('');
  };

  const sendSticker = (sticker) => {
    const data = { type: 'sticker', content: sticker, senderName: userName };
    broadcastData(data);
    handleIncomingData(data, true);
    setShowStickers(false);
  };

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 104857600) return alert("Max 100MB!");
    const data = { type: 'file', file, name: file.name, fileType: file.type, senderName: userName };
    broadcastData(data);
    handleIncomingData(data, true);
  };

  const handleIncomingData = (data, isMine) => {
    if (data.type === 'file') {
      const url = URL.createObjectURL(new Blob([data.file]));
      setMessages(p => [...p, { ...data, url, isMine }]);
    } else {
      setMessages(p => [...p, { ...data, isMine }]);
    }
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'text') return <p>{msg.text}</p>;
    if (msg.type === 'sticker') return <span className="sticker-display">{msg.content}</span>;
    if (msg.type === 'file') {
      if (msg.fileType.startsWith('image/')) return <img src={msg.url} className="chat-image" alt="upload" />;
      if (msg.fileType.startsWith('video/')) return <video src={msg.url} controls className="chat-video" />;
      return <a href={msg.url} download={msg.name} className="download-link">💾 {msg.name}</a>;
    }
  };

  // --- UI RENDER ---
  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <form onSubmit={joinRoom} className="join-form">
          <div className="input-group">
            <User size={18} className="icon"/><input type="text" placeholder="Your Name" value={userName} onChange={e => setUserName(e.target.value)} required />
          </div>
          <div className="input-group">
            <input type="text" placeholder="Room Code" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required/>
            <button type="button" className="text-btn" onClick={() => setRoomId(Math.random().toString(36).slice(2, 8).toUpperCase())}>Gen</button>
          </div>
          <button type="submit" className="primary-btn">Join Secure Room</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      {/* SIDEBAR */}
      <div className="media-sidebar active">
        <div className="room-badge">Room: {roomId}</div>
        <div className="video-stack">
          <div className="video-container self-view">
            {!mediaStreamed && <div className="media-overlay"><button onClick={turnOnMedia} className="primary-btn">Enable Camera</button></div>}
            <video ref={myVideoRef} autoPlay playsInline muted className={`my-video ${isScreenSharing ? '' : 'mirrored'}`} />
            <span className="name-badge">{userName} (You)</span>
          </div>
          {Object.entries(peers).map(([id, d]) => d.stream && <RemoteVideoPlayer key={id} stream={d.stream} name={d.name} />)}
        </div>
        <div className="call-controls">
          <button onClick={toggleMute} className={`control-btn ${isMuted ? 'danger' : ''}`} disabled={!mediaStreamed}>
            {isMuted ? <MicOff size={20}/> : <Phone size={20}/>}
          </button>
          <button onClick={toggleVideo} className={`control-btn ${isVideoOff ? 'danger' : ''}`} disabled={!mediaStreamed}>
            {isVideoOff ? <VideoOff size={20}/> : <Video size={20}/>}
          </button>
          <button onClick={toggleScreenShare} className={`control-btn ${isScreenSharing ? 'active-share' : ''}`} disabled={!mediaStreamed}>
            <MonitorUp size={20}/>
          </button>
        </div>
      </div>

      {/* CHAT MAIN */}
      <div className="chat-main">
        <div className="messages-area">
          {messages.map((m, i) => m.type === 'system' ? <div key={i} className="system-msg">{m.text}</div> : (
            <div key={i} className={`message-wrapper ${m.isMine ? 'mine' : 'theirs'}`}>
              {!m.isMine && <span className="sender-name">{m.senderName}</span>}
              <div className={`message bubble ${m.isMine ? 'mine' : 'theirs'}`}>
                {renderMessageContent(m)}
                {m.isMine && m.type === 'text' && (
                  <div className="read-receipt">
                    {m.status === 'read' ? <CheckCheck size={14} color="#60a5fa"/> : <Check size={14} color="#94a3b8"/>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* COMPOSE AREA */}
        <div className="compose-area">
          {showStickers && (
            <div className="sticker-popup">
              {STICKERS.map(s => <button key={s} onClick={() => sendSticker(s)}>{s}</button>)}
            </div>
          )}
          <form onSubmit={sendTextMessage} className="compose-form">
            <button type="button" className="icon-btn" onClick={() => setShowStickers(!showStickers)}><Sticker size={24}/></button>
            <input type="file" id="file-upload" style={{ display: 'none' }} onChange={sendFile} />
            <label htmlFor="file-upload" className="icon-btn"><Paperclip size={24}/></label>
            <input type="text" className="chat-input" placeholder="Type a message..." value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
            <button type="submit" className="send-btn"><Send size={20}/></button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;