import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, db } from "../services/firebase-services";
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "guest" | "staff" | "admin";
  subRole: "event_manager" | "front_desk" | "maintenance" | "catering_staff" | "housekeeping" | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  phoneNumber: string;
  photoURL: string;
  roomNumber: string;
  status: string;
  preferences: {
    language: "en" | "zu" | "af";
    notifications: boolean;
  };
  createdAt: any;
  updatedAt: any;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isGuest: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isEventManager: boolean;
  isFrontDesk: boolean;
  isMaintenance: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (firebaseUser: FirebaseUser) => {
    try {
      // 1. Try UID doc
      let userSnap = await getDoc(doc(db, "users", firebaseUser.uid));

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        setProfile({ ...data, uid: firebaseUser.uid });
        return;
      }

      // 2. Try Email doc fallback
      if (firebaseUser.email) {
        const cleanEmail = firebaseUser.email.trim().toLowerCase();
        userSnap = await getDoc(doc(db, "users", cleanEmail));
        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          setProfile({ ...data, uid: firebaseUser.uid });
          return;
        }
      }

      const cleanEmail = (firebaseUser.email || "").trim().toLowerCase();
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: cleanEmail,
        displayName: firebaseUser.displayName || cleanEmail.split('@')[0] || "Resident Guest",
        role: "guest",
        subRole: null,
        loyaltyPoints: 500,
        loyaltyTier: "Silver",
        phoneNumber: firebaseUser.phoneNumber || "",
        photoURL: firebaseUser.photoURL || "",
        roomNumber: "101",
        status: "resident",
        preferences: {
          language: "en",
          notifications: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist doc to Firestore so future reads pick up resident status
      try {
        const { setDoc } = require('firebase/firestore');
        await setDoc(doc(db, "users", firebaseUser.uid), newProfile);
        if (cleanEmail) {
          await setDoc(doc(db, "users", cleanEmail), newProfile);
        }
      } catch (err) {
        console.warn('⚠️ Non-fatal setDoc warning in AuthContext:', err);
      }

      setProfile(newProfile);
    } catch (error) {
      console.error("🔴 AuthProvider: Error fetching profile:", error);
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    loading,
    signOut,
    refreshProfile,
    isGuest: profile?.role === "guest",
    isStaff: profile?.role === "staff",
    isAdmin: profile?.role === "admin",
    isEventManager: profile?.subRole === "event_manager",
    isFrontDesk: profile?.subRole === "front_desk",
    isMaintenance: profile?.subRole === "maintenance",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};