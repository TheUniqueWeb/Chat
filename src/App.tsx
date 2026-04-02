import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import Auth from './components/Auth';
import Chat from './components/Chat';
import AdminPanel from './components/AdminPanel';
import { Loader2 } from 'lucide-react';

const ADMIN_EMAIL = "mahamudurrahman778@gmail.com";

export default function App() {
  const [user, loading, error] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connected successfully.");
      } catch (error) {
        if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
          console.error("Firestore is offline or unavailable. Check configuration or network.");
        } else {
          console.error("Firestore connection error:", error);
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    async function checkAdmin() {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const role = user.email === ADMIN_EMAIL ? 'admin' : 'user';
          
          if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'User',
              photoURL: user.photoURL || '',
              role: role,
              lastSeen: serverTimestamp()
            });
          } else {
            if (user.email === ADMIN_EMAIL && userDoc.data().role !== 'admin') {
              await setDoc(doc(db, 'users', user.uid), { role: 'admin' }, { merge: true });
            }
          }
          
          setIsAdmin(user.email === ADMIN_EMAIL);
        } catch (err) {
          console.error("Error checking admin status:", err);
        }
      }
      setIsReady(true);
    }

    if (!loading) {
      checkAdmin();
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    
    const updateLastSeen = async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), { lastSeen: serverTimestamp() }, { merge: true });
      } catch (err) {
        console.error("Error updating lastSeen:", err);
      }
    };

    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [user]);

  if (loading || !isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white p-4 text-center">
        <div>
          <h1 className="text-2xl font-bold text-red-500 mb-2">Authentication Error</h1>
          <p className="text-slate-400">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return isAdmin ? <AdminPanel user={user} /> : <Chat user={user} />;
}
