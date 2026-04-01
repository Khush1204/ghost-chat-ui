import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Phone, MonitorUp, Paperclip, Sticker, User, VideoOff, MicOff, Check, CheckCheck } from 'lucide-react';
import './App.css';

// CONNECT TO YOUR LIVE RENDER SERVER
const socket = io('https://ghost-chat-server.onrender.com', {
  transports: ['websocket', 'polling']
});

const STICKERS = ['🚀', '👻', '💀', '👽', '🍕', '🎉', '🔥', '💯'];

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
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [mediaStreamed, setMediaStreamed] = useState(false); 
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [myPeerId, setMyPeerId] = useState('');
  const [peers, setPeers] = useState({}); 

  const myVideoRef = useRef();
  const myStreamRef = useRef(null);
  const peerInstance = useRef(null);
  const callsRef = useRef({}); 
  const connsRef = useRef({});

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    socket.on('user-joined', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} joined the room!` }]);
      setPeers(prev => ({ ...prev, [data.peerId]: { stream: null, name: data.senderName } }));
      
      // Auto-connect data for files
      if (peerInstance.current) {
        const conn = peerInstance.current.connect(data.peerId);
        setupConnection(conn);
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

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('receive-message');
    };
  }, [roomId]);

  const setupConnection = (conn) => {
    conn.on('open', () => {
      connsRef.current[conn.peer] = conn;
      conn.on('data', (data) => handleIncomingData(data, false));
    });
  };

  const initMesh = () => {
    const peer = new Peer({
      host: 'ghost-chat-server.onrender.com',
      port: 443,
      path: '/peerjs/myapp',
      secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peerInstance.current = peer;

    peer.on('open', (id) => {
      setMyPeerId(id);
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

    peer.on('connection', (conn) => setupConnection(conn));

    peer.on('call', (call) => {
      call.answer(myStreamRef.current || undefined);
      callsRef.current[call.peer] = call;
      call.on('stream', (remStream) => {
        setPeers(p => ({ ...p, [call.peer]: { ...p[call.peer], stream: remStream } }));
      });
    });
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return alert("Enter details!");
    setInRoom(true);
    initMesh();
  };

  const turnOnMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      myStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;
      setMediaStreamed(true);
      
      Object.keys(peers).forEach(id => {
        const call = peerInstance.current.call(id, stream);
        callsRef.current[id] = call;
        call.on('stream', (rs) => {
          setPeers(p => ({ ...p, [id]: { ...p[id], stream: rs } }));
        });
      });
    } catch (e) { alert("Camera Permission Denied"); }
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { 
      id: Math.random().toString(36).substr(2, 9),
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

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = { type: 'file', file, name: file.name, fileType: file.type, senderName: userName };
    Object.values(connsRef.current).forEach(c => c.send(data));
    handleIncomingData(data, true);
  };

  const handleIncomingData = (data, isMine) => {
    if (data.type === 'file') {
      const url = URL.createObjectURL(new Blob([data.file]));
      setMessages(p => [...p, { ...data, url, isMine }]);
    } else if (data.type === 'sticker') {
      setMessages(p => [...p, { ...data, isMine }]);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        Object.values(callsRef.current).forEach(call => {
          const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
          sender.replaceTrack(track);
        });
        setIsScreenSharing(true);
        track.onended = () => stopScreenShare();
      } else { stopScreenShare(); }
    } catch (e) { console.error(e); }
  };

  const stopScreenShare = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const track = stream.getVideoTracks()[0];
    Object.values(callsRef.current).forEach(call => {
      const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
      sender.replaceTrack(track);
    });
    setIsScreenSharing(false);
  };

  if (!inRoom) return (
    <div className="join-screen">
      <div className="glass-panel">
        <h1>Ghost Chat 👻</h1>
        <form onSubmit={joinRoom} className="join-form">
          <input type="text" placeholder="Your Name" value={userName} onChange={e => setUserName(e.target.value)} required />
          <input type="text" placeholder="Room Code" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} required/>
          <button type="submit" className="primary-btn">Join Secure Room</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      <div className="media-sidebar active">
        <div className="video-stack">
          <div className="video-container self-view">
            {!mediaStreamed && <button onClick={turnOnMedia} className="primary-btn">Enable Camera</button>}
            <video ref={myVideoRef} autoPlay playsInline muted className="my-video mirrored" />
            <span className="name-badge">{userName} (You)</span>
          </div>
          {Object.entries(peers).map(([id, d]) => d.stream && <RemoteVideoPlayer key={id} stream={d.stream} name={d.name} />)}
        </div>
        <div className="call-controls">
          <button onClick={() => setIsMuted(!isMuted)} className={`control-btn ${isMuted ? 'danger' : ''}`}><MicOff size={20}/></button>
          <button onClick={toggleScreenShare} className="control-btn"><MonitorUp size={20}/></button>
        </div>
      </div>
      <div className="chat-main">
        <div className="messages-area">
          {messages.map((m, i) => (
            <div key={i} className={`message-wrapper ${m.type === 'system' ? 'system' : (m.isMine ? 'mine' : 'theirs')}`}>
              {m.type === 'system' ? m.text : (
                <div className="bubble">
                  {!m.isMine && <small>{m.senderName}</small>}
                  {m.type === 'text' ? <p>{m.text}</p> : <img src={m.url} className="chat-image" />}
                  {m.isMine && m.status === 'read' && <CheckCheck size={14} className="receipt" />}
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={sendTextMessage} className="compose-area">
          <input type="file" id="f-up" hidden onChange={sendFile} />
          <label htmlFor="f-up" className="icon-btn"><Paperclip size={20}/></label>
          <input type="text" className="chat-input" placeholder="Type..." value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          <button type="submit" className="send-btn"><Send size={20}/></button>
        </form>
      </div>
    </div>
  );
}

export default App;