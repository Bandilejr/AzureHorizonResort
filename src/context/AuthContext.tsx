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

  console.log('🟢 AuthProvider: Initial render, loading=', loading);

  const fetchProfile = async (firebaseUser: FirebaseUser) => {
    console.log('🟢 AuthProvider: fetchProfile called for', firebaseUser.uid);
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        console.log('🟢 AuthProvider: Profile found in Firestore');
        setProfile(data);
      } else {
        console.log('🟢 AuthProvider: No profile in Firestore, creating default');
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || "",
          role: "guest",
          subRole: null,
          loyaltyPoints: 0,
          loyaltyTier: "bronze",
          phoneNumber: firebaseUser.phoneNumber || "",
          photoURL: firebaseUser.photoURL || "",
          roomNumber: "N/A",
          status: "guest",
          preferences: {
            language: "en",
            notifications: true,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setProfile(newProfile);
      }
    } catch (error) {
      console.error("🔴 AuthProvider: Error fetching profile:", error);
      setProfile(null);
    }
  };

  useEffect(() => {
    console.log('🟢 AuthProvider: Setting up onAuthStateChanged listener');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🟢 AuthProvider: onAuthStateChanged fired, user=', firebaseUser?.uid || 'null');
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
      console.log('🟢 AuthProvider: Auth state updated, loading=false');
    });

    return () => {
      console.log('🟢 AuthProvider: Cleaning up listener');
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    console.log('🟢 AuthProvider: signOut called');
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

  console.log('🟢 AuthProvider: Rendering with loading=', loading, 'user=', user?.uid);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};