import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { Send, Video, Phone, MonitorUp, Paperclip, VideoOff, MicOff, Users } from 'lucide-react';
import './App.css';

const socket = io('https://ghost-chat-server.onrender.com', {
  transports: ['websocket', 'polling']
});

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
  const [mediaStreamed, setMediaStreamed] = useState(false); 
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState({}); 

  const myVideoRef = useRef();
  const myStreamRef = useRef(null);
  const peerInstance = useRef(null);
  const callsRef = useRef({});

  // --- SOCKET LISTENERS FOR MESSAGES & JOINS ---
  useEffect(() => {
    socket.on('user-joined', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.senderName} joined the room!` }]);
      setPeers(prev => ({ ...prev, [data.peerId]: { stream: null, name: data.senderName } }));
    });

    socket.on('user-left', (data) => {
      setMessages(prev => [...prev, { type: 'system', text: `${data.userName} has left.` }]);
      setPeers(prev => {
        const updated = { ...prev };
        delete updated[data.peerId];
        return updated;
      });
    });

    socket.on('receive-message', (data) => {
      setMessages(prev => [...prev, { ...data, isMine: false }]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('receive-message');
    };
  }, []);

  const initMesh = () => {
    // 💥 BYPASS THE 404: Use the global PeerJS cloud server instead!
    const peer = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peerInstance.current = peer;

    peer.on('open', (id) => {
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

    // ... (keep the rest of your peer.on('call', ...) code exactly the same)
  };

    peerInstance.current = peer;

    peer.on('open', (id) => {
      socket.emit('join-room', { roomId, peerId: id, userName });
    });

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
    if (!userName.trim() || !roomId.trim()) return;
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

  // --- NEW: TOGGLE VIDEO & AUDIO LOGIC ---
  const toggleVideo = () => {
    const videoTrack = myStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const toggleAudio = () => {
    const audioTrack = myStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        Object.values(callsRef.current).forEach(call => {
          const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if(sender) sender.replaceTrack(track);
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
    Object.values(callsRef.current).forEach(call => {
      const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
      if(sender) sender.replaceTrack(track);
    });
    if (myVideoRef.current) myVideoRef.current.srcObject = stream;
    setIsScreenSharing(false);
    if(isVideoOff) track.enabled = false;
  };

  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = { roomId, text: inputMessage, type: 'text', senderName: userName };
    socket.emit('send-message', msg);
    setMessages(p => [...p, { ...msg, isMine: true }]);
    setInputMessage('');
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
      {/* SIDEBAR */}
      <div className="media-sidebar active">
        
        {/* NEW: ACTIVE MEMBERS LIST */}
        <div className="members-list">
          <h3><Users size={16}/> Active in {roomId}</h3>
          <ul>
            <li className="you-badge">🟢 {userName} (You)</li>
            {Object.values(peers).map((p, i) => (
              <li key={i}>🟢 {p.name || "Connecting..."}</li>
            ))}
          </ul>
        </div>

        <div className="video-stack">
          <div className="video-container self-view">
            {!mediaStreamed && <button onClick={turnOnMedia} className="primary-btn">Enable Camera</button>}
            <video ref={myVideoRef} autoPlay playsInline muted className="my-video mirrored" />
          </div>
          {Object.entries(peers).map(([id, d]) => d.stream && <RemoteVideoPlayer key={id} stream={d.stream} name={d.name} />)}
        </div>

        {/* UPDATED: CONTROLS WITH CAMERA TOGGLE */}
        <div className="call-controls">
          <button onClick={toggleAudio} className={`control-btn ${isMuted ? 'danger' : ''}`} disabled={!mediaStreamed}>
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
          {messages.map((m, i) => (
            <div key={i} className={`message-wrapper ${m.type === 'system' ? 'system' : (m.isMine ? 'mine' : 'theirs')}`}>
              {m.type === 'system' ? m.text : (
                <div className="bubble">
                  {!m.isMine && <small>{m.senderName}</small>}
                  <p>{m.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={sendTextMessage} className="compose-area">
          <input type="text" className="chat-input" placeholder="Type..." value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          <button type="submit" className="send-btn"><Send size={20}/></button>
        </form>
      </div>
    </div>
  );
}

export default App;
// FORCE VERCEL DEPLOYMENT 1