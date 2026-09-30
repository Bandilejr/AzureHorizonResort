import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { auth, db } from "../services/firebase-services";
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import type { EmploymentType } from "@/types/workforce";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "guest" | "staff" | "admin" | "kitchen_manager"
| "npo_rep" | "chef";
  subRole: "event_manager" | "front_desk" | "maintenance" | "catering_staff" | "housekeeping" | "kitchen_manager" | null;
  npoId: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  phoneNumber: string;
  photoURL: string;
  roomNumber: string;
  status: string;
  // Phase 1 workforce identity fields
  employeeId: string | null;
  department: string | null;
  employmentType: EmploymentType | null;
  active: boolean;
  position: string | null;
  skills: string[];
  worksiteId: string | null;
  deviceBinding: string | null;
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
  isKitchenStaff: boolean;
  isNpoRep: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function withWorkforceDefaults(data: Partial<UserProfile>, uid: string): UserProfile {
  return {
    uid,
    email: data.email || "",
    displayName: data.displayName || "Staff Member",
    role: (data.role as UserProfile["role"]) || "guest",
    subRole: (data.subRole as UserProfile["subRole"]) || null,
    npoId: (data.npoId as string | null) ?? null,
    loyaltyPoints: data.loyaltyPoints ?? 500,
    loyaltyTier: data.loyaltyTier || "Silver",
    phoneNumber: data.phoneNumber || "",
    photoURL: data.photoURL || "",
    roomNumber: data.roomNumber || "101",
    status: data.status || "resident",
    employeeId: data.employeeId ?? null,
    department: data.department ?? null,
    employmentType: data.employmentType ?? null,
    active: data.active !== false,
    position: data.position ?? null,
    skills: Array.isArray(data.skills) ? data.skills : [],
    worksiteId: data.worksiteId ?? null,
    deviceBinding: data.deviceBinding ?? null,
    preferences: data.preferences || { language: "en", notifications: true },
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const teardownRef = useRef<Array<() => void>>([]);

  const registerTeardown = (fn: () => void) => {
    teardownRef.current.push(fn);
  };

  const fetchProfile = async (firebaseUser: FirebaseUser) => {
    try {
      let userSnap = await getDoc(doc(db, "users", firebaseUser.uid));

      if (userSnap.exists()) {
        const data = userSnap.data() as Partial<UserProfile>;
        setProfile(withWorkforceDefaults(data, firebaseUser.uid));
        return;
      }

      if (firebaseUser.email) {
        const cleanEmail = firebaseUser.email.trim().toLowerCase();
        userSnap = await getDoc(doc(db, "users", cleanEmail));
        if (userSnap.exists()) {
          const data = userSnap.data() as Partial<UserProfile>;
          // Dual-key: backfill UID doc so future reads are uid-only.
          const merged = withWorkforceDefaults(data, firebaseUser.uid);
          try {
            const { setDoc } = require("firebase/firestore");
            await setDoc(doc(db, "users", firebaseUser.uid), merged, { merge: true });
          } catch { /* non-fatal */ }
          setProfile(merged);
          return;
        }
      }

      const cleanEmail = (firebaseUser.email || "").trim().toLowerCase();
      const newProfile = withWorkforceDefaults(
        {
          uid: firebaseUser.uid,
          email: cleanEmail,
          displayName: firebaseUser.displayName || cleanEmail.split("@")[0] || "Resident Guest",
          role: "guest",
          subRole: null,
          loyaltyPoints: 500,
          loyaltyTier: "Silver",
          phoneNumber: firebaseUser.phoneNumber || "",
          photoURL: firebaseUser.photoURL || "",
          roomNumber: "101",
          status: "resident",
          employeeId: null,
          department: null,
          employmentType: null,
          active: true,
          position: null,
          skills: [],
          worksiteId: null,
          deviceBinding: null,
          preferences: { language: "en", notifications: true },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        firebaseUser.uid,
      );

      try {
        const { setDoc } = require("firebase/firestore");
        // Phase 1 identity: seed ONLY the uid-keyed authoritative profile.
        // Email-keyed duplicates are legacy — the read fallback above backfills
        // uid docs from them, but no NEW email-keyed docs are created.
        await setDoc(doc(db, "users", firebaseUser.uid), newProfile);
      } catch (err) {
        console.warn("⚠️ Non-fatal setDoc warning in AuthContext:", err);
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
      teardownRef.current.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
      teardownRef.current = [];
    };
  }, []);

  const signOut = async () => {
    // Ordered teardown (Phase 1): run registered cleanups BEFORE Firebase signOut
    // so onSnapshot listeners are removed first — prevents permission-denied races.
    const fns = teardownRef.current.splice(0, teardownRef.current.length);
    fns.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
    try {
      if (user) {
        await updateDoc(doc(db, "users", user.uid), { lastSignedOutAt: new Date().toISOString() }).catch(() => {});
      }
    } catch { /* ignore */ }
    await firebaseSignOut(auth);
    setProfile(null);
    setUser(null);
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
    isKitchenStaff:
      profile?.role === "kitchen_manager" ||
      profile?.subRole === "catering_staff" ||
      profile?.subRole === "kitchen_manager",
    isNpoRep: profile?.role === "npo_rep",
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
