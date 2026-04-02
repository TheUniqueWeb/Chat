import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  limit
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { 
  Send, 
  Image as ImageIcon, 
  Mic, 
  Paperclip, 
  LogOut, 
  MoreVertical, 
  Edit2, 
  Trash2,
  X,
  Check,
  FileText,
  Play,
  Pause,
  ChevronLeft,
  Search,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';

interface ChatUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  lastSeen?: any;
  isTyping?: boolean;
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCount?: number;
  isChatDisabled?: boolean;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  type: 'text' | 'photo' | 'voice' | 'file';
  fileData?: string;
  fileName?: string;
  timestamp: any;
  edited?: boolean;
  deleted?: boolean;
  seen?: boolean;
}

export default function AdminPanel({ user }: { user: User }) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for all users except admin
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'user'), orderBy('lastMessageTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const uList = snapshot.docs.map(doc => doc.data() as ChatUser);
      setUsers(uList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return () => unsubscribe();
  }, []);

  // Mark messages as seen when admin opens chat
  useEffect(() => {
    if (!selectedUser) return;
    const unseenMessages = messages.filter(m => m.senderId === selectedUser.uid && !m.seen);
    unseenMessages.forEach(async (m) => {
      await updateDoc(doc(db, 'messages', m.id), { seen: true });
    });
  }, [messages, selectedUser]);

  // Listen for selected user's typing status
  useEffect(() => {
    if (!selectedUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', selectedUser.uid), (doc) => {
      if (doc.exists()) {
        setIsUserTyping(doc.data().isTyping || false);
      }
    });
    return () => unsubscribe();
  }, [selectedUser]);

  // Handle typing status
  const handleTyping = () => {
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid), { isTyping: true });
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(doc(db, 'users', user.uid), { isTyping: false });
    }, 3000);
  };

  // Listen for messages with selected user
  useEffect(() => {
    if (!selectedUser) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', selectedUser.uid),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => unsubscribe();
  }, [selectedUser, user.uid]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedUser) return;

    const text = inputText;
    setInputText("");

    await addDoc(collection(db, 'messages'), {
      senderId: user.uid,
      receiverId: selectedUser.uid,
      chatId: selectedUser.uid,
      text: text,
      type: 'text',
      timestamp: serverTimestamp(),
      edited: false,
      deleted: false,
      seen: false
    });
  };

  const clearChat = async () => {
    if (!selectedUser) return;
    const q = query(collection(db, 'messages'), where('chatId', '==', selectedUser.uid));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    setShowClearConfirm(false);
  };

  const toggleChatStatus = async () => {
    if (!selectedUser) return;
    await updateDoc(doc(db, 'users', selectedUser.uid), {
      isChatDisabled: !selectedUser.isChatDisabled
    });
  };

  const isOnline = (lastSeen: any) => {
    if (!lastSeen) return false;
    const now = new Date().getTime();
    const last = lastSeen.toDate().getTime();
    return (now - last) < 120000; // 2 minutes
  };

  const handleEdit = async () => {
    if (!editingMessage || !inputText.trim()) return;
    await updateDoc(doc(db, 'messages', editingMessage.id), {
      text: inputText,
      edited: true
    });
    setEditingMessage(null);
    setInputText("");
  };

  const handleDelete = async (id: string) => {
    await updateDoc(doc(db, 'messages', id), {
      deleted: true,
      text: "This message was deleted",
      fileData: null
    });
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!selectedUser) return;
    for (const file of acceptedFiles) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        let type: 'photo' | 'file' = file.type.startsWith('image/') ? 'photo' : 'file';
        
        await addDoc(collection(db, 'messages'), {
          senderId: user.uid,
          receiverId: selectedUser.uid,
          chatId: selectedUser.uid,
          type,
          fileData: base64,
          fileName: file.name,
          timestamp: serverTimestamp(),
          edited: false,
          deleted: false,
          seen: false
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    noClick: true
  });

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-950 text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`w-full md:w-80 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-xl ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
            <button onClick={() => auth.signOut()} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500">
              <Users className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">No users found</p>
            </div>
          ) : (
            filteredUsers.map(u => (
              <button 
                key={u.uid}
                onClick={() => setSelectedUser(u)}
                className={`w-full flex items-center gap-4 p-4 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 ${selectedUser?.uid === u.uid ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="relative">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt={u.displayName} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center font-bold">
                      {u.displayName[0]}
                    </div>
                  )}
                  <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${isOnline(u.lastSeen) ? 'bg-green-500' : 'bg-slate-500'}`}></div>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm truncate">{u.displayName}</h3>
                    {u.lastMessageTime && (
                      <span className="text-[10px] text-slate-500">
                        {format(u.lastMessageTime.toDate(), 'HH:mm')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 truncate flex-1">
                      {u.isTyping ? <span className="text-blue-400 italic">typing...</span> : (u.lastMessage || u.email)}
                    </p>
                    {u.unreadCount ? (
                      <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                        {u.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat Area */}
      <main className={`flex-1 flex flex-col bg-slate-950 relative ${!selectedUser ? 'hidden md:flex' : 'flex'}`} {...getRootProps()}>
        <input {...getInputProps()} />
        
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <header className="flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 hover:bg-slate-800 rounded-full">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="relative">
                  <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center font-bold">
                    {selectedUser.displayName[0]}
                  </div>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${isOnline(selectedUser.lastSeen) ? 'bg-green-500' : 'bg-slate-500'}`}></div>
                </div>
                <div>
                  <h2 className="font-bold text-sm sm:text-base">{selectedUser.displayName}</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    {isUserTyping ? <span className="text-blue-400">typing...</span> : (isOnline(selectedUser.lastSeen) ? 'Online' : 'Offline')}
                    {selectedUser.isChatDisabled && <span className="text-red-500 font-bold bg-red-500/10 px-1 rounded">DISABLED</span>}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={toggleChatStatus}
                  className={`p-2 rounded-lg text-xs font-bold transition-colors ${selectedUser.isChatDisabled ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30' : 'bg-red-600/20 text-red-500 hover:bg-red-600/30'}`}
                >
                  {selectedUser.isChatDisabled ? 'Enable Chat' : 'Disable Chat'}
                </button>
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="p-2 hover:bg-red-500/10 text-red-400 rounded-full transition-colors"
                  title="Clear Chat"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.map((msg) => (
                <MessageItem 
                  key={msg.id} 
                  msg={msg} 
                  isMe={msg.senderId === user.uid} 
                  onEdit={() => {
                    setEditingMessage(msg);
                    setInputText(msg.text);
                  }}
                  onDelete={() => handleDelete(msg.id)}
                />
              ))}
              <div ref={scrollRef} />
              
              {isDragActive && (
                <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 z-50 flex items-center justify-center">
                  <div className="bg-slate-900 p-8 rounded-3xl shadow-2xl text-center">
                    <Paperclip className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-bounce" />
                    <p className="text-xl font-bold">Drop files to send</p>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <footer className="p-4 bg-slate-900/80 backdrop-blur-md border-t border-slate-800">
              <AnimatePresence>
                {editingMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-center justify-between bg-slate-800 p-2 rounded-t-xl mb-2 border-x border-t border-slate-700"
                  >
                    <div className="flex items-center gap-2 text-xs text-blue-400 px-2">
                      <Edit2 className="w-3 h-3" /> Editing message
                    </div>
                    <button onClick={() => { setEditingMessage(null); setInputText(""); }} className="p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <form onSubmit={editingMessage ? handleEdit : sendMessage} className="flex items-end gap-2">
                <div className="flex-1 bg-slate-800 rounded-2xl p-1 flex items-end border border-slate-700 focus-within:border-blue-500 transition-colors">
                  <div className="flex items-center p-2">
                    <label className="cursor-pointer p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400">
                      <Paperclip className="w-5 h-5" />
                      <input type="file" className="hidden" onChange={(e) => {
                        if (e.target.files) onDrop(Array.from(e.target.files));
                      }} />
                    </label>
                  </div>
                  <textarea
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      handleTyping();
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 resize-none max-h-32 min-h-[44px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        editingMessage ? handleEdit() : sendMessage();
                      }
                    }}
                  />
                  <div className="flex items-center p-2 gap-1">
                    <VoiceRecorder onFinish={(base64) => {
                      if (!selectedUser) return;
                      addDoc(collection(db, 'messages'), {
                        senderId: user.uid,
                        receiverId: selectedUser.uid,
                        chatId: selectedUser.uid,
                        type: 'voice',
                        fileData: base64,
                        timestamp: serverTimestamp(),
                        edited: false,
                        deleted: false,
                        seen: false
                      });
                    }} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-2xl transition-all active:scale-90 shadow-lg shadow-blue-500/20"
                >
                  {editingMessage ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800">
              <Users className="w-10 h-10 opacity-20" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Select a conversation</h2>
            <p className="max-w-xs">Choose a user from the sidebar to start chatting and providing predictions.</p>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-2">Clear Chat?</h3>
              <p className="text-slate-400 text-sm mb-6">This will permanently delete all messages in this conversation. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={clearChat}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 rounded-xl font-medium transition-colors"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Re-using components from Chat.tsx for consistency
function MessageItem({ msg, isMe, onEdit, onDelete }: { msg: Message, isMe: boolean, onEdit: () => void, onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative px-2`}
    >
      <div className={`max-w-[85%] sm:max-w-[70%] ${isMe ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none'} p-3 shadow-lg transition-all hover:shadow-xl`}>
        {msg.deleted ? (
          <div className="flex items-center gap-2 italic text-xs opacity-60 py-1">
            <Trash2 className="w-3 h-3" />
            <span>This message was deleted</span>
          </div>
        ) : (
          <>
            {msg.type === 'text' && <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>}
            {msg.type === 'photo' && (
              <div className="space-y-2">
                <img src={msg.fileData} alt="Shared" className="rounded-xl max-w-full h-auto max-h-80 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
              </div>
            )}
            {msg.type === 'voice' && <AudioPlayer src={msg.fileData!} />}
            {msg.type === 'file' && (
              <div className="flex items-center gap-3 bg-slate-900/30 p-3 rounded-xl border border-white/10 hover:bg-slate-900/50 transition-colors">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{msg.fileName}</p>
                  <a href={msg.fileData} download={msg.fileName} className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 mt-0.5">
                    Download File
                  </a>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-end gap-1.5 mt-1.5 pt-1 border-t border-white/5">
              {msg.edited && <span className="text-[9px] opacity-40 italic font-medium uppercase tracking-tighter">edited</span>}
              <span className="text-[9px] opacity-40 font-medium">
                {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}
              </span>
              {isMe && (
                <div className="flex items-center">
                  {msg.seen ? (
                    <div className="flex -space-x-1">
                      <Check className="w-2.5 h-2.5 text-blue-300" />
                      <Check className="w-2.5 h-2.5 text-blue-300" />
                    </div>
                  ) : (
                    <Check className="w-2.5 h-2.5 opacity-40" />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!msg.deleted && (
        <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute ${isMe ? '-left-10' : '-right-10'} top-1/2 -translate-y-1/2 flex flex-col gap-1`}>
          <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-slate-800 rounded-full bg-slate-900/50 backdrop-blur-sm border border-slate-800 shadow-sm">
            <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`absolute ${isMe ? 'left-0' : 'right-0'} bottom-full mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-20 min-w-[110px]`}
              >
                {isMe && (
                  <button 
                    onClick={() => { onEdit(); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-slate-700 transition-colors border-b border-slate-700/50"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" /> Edit
                  </button>
                )}
                <button 
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-red-500/10 text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (playing) audioRef.current?.pause();
    else audioRef.current?.play();
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <button onClick={toggle} className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-full hover:bg-white/30 transition-colors">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
        <div className={`h-full bg-white transition-all duration-300 ${playing ? 'w-full' : 'w-0'}`} />
      </div>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

function VoiceRecorder({ onFinish }: { onFinish: (base64: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data);
      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onFinish(reader.result as string);
        reader.readAsDataURL(blob);
        chunks.current = [];
      };
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stop = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  return (
    <button 
      type="button"
      onMouseDown={start}
      onMouseUp={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse scale-125' : 'text-slate-400 hover:bg-slate-700'}`}
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
