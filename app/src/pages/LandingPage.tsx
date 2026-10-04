import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { loginUser, loginAsGuest, logoutUser, db } from '@/services/firebase-services';
import { auth } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { UserRole, User as CustomUser } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { 
  User, 
  Users, 
  Hotel,
  Star,
  Waves,
  UtensilsCrossed,
  Sparkles,
  Loader2,
  Database,
  ArrowRight,
  ChefHat,
  ClipboardList,
  Wrench,
  Search,
  Key,
  ShieldCheck,
  UserPlus,
  AlertCircle,
  MapPin,
  MessageSquareHeart,
  Compass,
  Flower2,
  CalendarCheck2
} from 'lucide-react';

interface LandingPageProps {
  onRegisterClick: () => void;
}

export function LandingPage({ onRegisterClick }: LandingPageProps) {
  const { login, user, isAuthenticated } = useAuth(); 
  const navigate = useNavigate();
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

  const [activeTab, setActiveTab] = useState('guest');
  const [guestType, setGuestType] = useState<'browsing' | 'resident'>('browsing');
  
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(null);
  
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      const u = user as CustomUser;
      const role = u.role?.toLowerCase();
      
      console.log("Redirecting user:", u.name, "Role:", role);
      
      if (!role) {
        console.log("No role found, staying on landing");
        return;
      }

      const roleRoutes: { [key: string]: string } = {
        'guest': '/guest-portal',
        'chef': '/kitchen',
        'kitchen_manager': '/',
        'npo_rep': '/',
        'staff': '/',
        'delivery': '/',
        'front_desk': '/reception',
        'waitstaff': '/service-dashboard',
        'maintenance': '/maintenance-portal',
        'tour_guide': '/tour-dashboard',
        'spa_staff': '/spa-dashboard',
        'event_manager': '/event-manager',
        'admin': '/admin-dashboard'
      };
      
      const route = roleRoutes[role];
      if (route) {
        console.log("Navigating to:", route);
        navigate(route);
      } else {
        console.log("Unknown role:", role);
        navigate('/');
      }
    }
  }, [isAuthenticated, user, navigate]);

  const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

  const features = [
    { icon: Hotel, title: 'Luxury Accommodations', description: 'Experience world-class comfort in our meticulously designed rooms.' },
    { icon: UtensilsCrossed, title: 'Fine Dining', description: 'Savor exquisite culinary creations crafted by award-winning chefs.' },
    { icon: Sparkles, title: 'Spa & Wellness', description: 'Rejuvenate your body and mind in our tranquil spa sanctuary.' },
    { icon: Waves, title: 'Infinity Pool', description: 'Swim into the horizon at our stunning ocean-view infinity pool.' },
    { icon: MapPin, title: 'Curated Tours', description: 'Embark on unforgettable excursions guided by local experts.' },
    { icon: MessageSquareHeart, title: 'Guest Experience', description: 'We listen to your feedback to continuously elevate our 5-star service.' }
  ];

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    try {
      const { seedDatabase } = await import('@/services/seedData');
      await seedDatabase();
    } catch (err: unknown) {
      console.error(err);
      alert("Seeding failed. Check console for details.");
    } finally {
      setIsSeeding(false);
    }
  };

  // Auto-refresh demo data whenever it is stale (e.g. a new day).
  // Replaces the need to manually click "Seed Database" — keeps
  // events/inspections/invitations permanently in sync with "today".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { autoSeedIfNeeded } = await import('@/services/seedData');
        if (!cancelled) await autoSeedIfNeeded({ silent: true });
      } catch (err) {
        console.error('Auto-seed failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGuestLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    const cleanEmail = guestEmail.trim().toLowerCase();

    if (guestType === 'browsing') {
      if (!guestName.trim()) { 
        setErrorMessage("❌ Please enter your name to continue as a guest."); 
        return; 
      }
      setIsLoggingIn(true);
      try {
        const result = await loginAsGuest(guestName, "none");
        if (result.user) login(result.user as unknown as CustomUser);
      } finally { setIsLoggingIn(false); }
    } else {
      if (!isValidEmail(cleanEmail) || !guestPassword) {
        setErrorMessage("❌ Valid email and password required for residents.");
        return;
      }
      setIsLoggingIn(true);
      try {
        const result = await loginUser(cleanEmail, guestPassword);
        if (result.user) {
          const userDoc = await getDoc(doc(db, 'users', cleanEmail));
          if (userDoc.exists()) {
            const userData = userDoc.data() as CustomUser;
            if (userData.role !== 'guest') {
              setErrorMessage(`❌ This account is for staff (${userData.role}). Please use the Staff tab.`);
              await logoutUser();
              setIsLoggingIn(false);
              return;
            }
            login(userData);
          }
        } else if (result.error) {
          setErrorMessage(`❌ ${result.error}`);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage(`❌ ${err.message || "Invalid resident credentials."}`);
      } finally { setIsLoggingIn(false); }
    }
  };

  const handleStaffLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    
    if (!selectedRole) {
      setErrorMessage("⚠️ Please select your department/role from the dropdown menu.");
      return;
    }
    if (!staffEmail.trim()) {
      setErrorMessage("⚠️ Please enter your staff email address.");
      return;
    }
    if (!staffPassword.trim()) {
      setErrorMessage("⚠️ Please enter your password.");
      return;
    }
    
    setIsLoggingIn(true);
    
    try {
      let dbUser: CustomUser | null = null;
      let authUid: string | null = null;
      const cleanEmail = staffEmail.trim().toLowerCase();

      // DEMO BYPASS: Check for master password
      if (DEMO_MODE && (staffPassword === 'azure2026' || staffPassword === 'password123')) {
        // The profile lookup below needs an authenticated session for Firestore
        // rules — establish an anonymous one when signed out (the staff
        // profile applied afterwards still governs role access).
        try {
          const { getAuth } = await import('firebase/auth');
          if (!getAuth().currentUser) await signInAnonymously(auth);
        } catch {
          /* fall through; the read below will surface the real error */
        }
        const userDoc = await getDoc(doc(db, 'users', cleanEmail));
        if (userDoc.exists()) {
          dbUser = userDoc.data() as CustomUser;
          authUid = dbUser.uid || dbUser.id || 'demo-auth-id';
        } else {
          setErrorMessage("❌ Staff profile not found in database. Please click 'Initialize System Database' first.");
          setIsLoggingIn(false);
          return;
        }
      } else {
        // REAL AUTH: Standard Firebase Auth
        const result = await loginUser(cleanEmail, staffPassword);
        
        if (!result.user) {
          setErrorMessage(`❌ ${result.error || "Invalid email or password."}\n\nTIP: Use 'password123' as a master password for any staff account during testing.`);
          setIsLoggingIn(false);
          return;
        }

        const userDoc = await getDoc(doc(db, 'users', cleanEmail));
        if (userDoc.exists()) {
          dbUser = userDoc.data() as CustomUser;
          authUid = result.user.id;
        } else {
          setErrorMessage("❌ Staff profile not found in Firestore. Please contact administrator.");
          await logoutUser();
          setIsLoggingIn(false);
          return;
        }
      }
      
      const selectedRoleLower = selectedRole.toLowerCase();
      const userRoleLower = dbUser.role?.toLowerCase() || '';
      
      if (userRoleLower !== selectedRoleLower) {
        const roleNames: { [key: string]: string } = {
          'admin': 'Administrator',
          'chef': 'Kitchen / Chef',
          'kitchen_manager': 'Kitchen Manager',
          'npo_rep': 'NPO Partner',
          'front_desk': 'Front Desk',
          'waitstaff': 'Service / Waitstaff',
          'maintenance': 'Maintenance',
          'tour_guide': 'Tour Guide',
          'spa_staff': 'Spa Therapist / Staff',
          'event_manager': 'Event Manager'
        };
        const expectedRoleName = roleNames[userRoleLower] || userRoleLower;
        const selectedRoleName = roleNames[selectedRoleLower] || selectedRoleLower;
        
        setErrorMessage(`❌ Access Denied: ${cleanEmail} is registered as "${expectedRoleName}", not "${selectedRoleName}".\n\nPlease select the correct department.`);
        if (staffPassword !== 'azure2026' && staffPassword !== 'password123') await logoutUser();
        setIsLoggingIn(false);
        return;
      }
      
      const userToLogin = {
        ...dbUser,
        id: dbUser.id || authUid,
        role: dbUser.role
      };
      
      console.log("Logging in user:", userToLogin);
      login(userToLogin);
      
    } catch (err: unknown) {
      console.error("Staff login error:", err);
      setErrorMessage("❌ Login failed. Please check your connection and credentials.");
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1e3a5f] via-[#2c5282] to-[#4a7c9b] font-sans">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('data:image/svg+xml,%3Csvg_width=%2260%22_height=%2260%22_viewBox=%220_0_60_60%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg_fill=%22none%22_fill-rule=%22evenodd%22%3E%3Cg_fill=%22%23ffffff%22_fill-opacity=%220.4%22%3E%3Cpath_d=%22M36_34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6_34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6_4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]">
        </div>

        <div className="relative max-w-7xl mx-auto px-4 pt-12 pb-20">
          <div className="text-center mb-12">
            <Star className="h-8 w-8 text-[#c9a227] mx-auto mb-4" />
            <h1 className="text-4xl sm:text-6xl font-serif font-bold text-white italic">Azure Horizon Resort</h1>
            <p className="text-white/80 mt-2 max-w-2xl mx-auto italic">Excellence in Hospitality Management</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <Card className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl border-0">
              <CardHeader>
                <CardTitle className="text-[#1e3a5f] dark:text-blue-400">Secure Portal Access</CardTitle>
                <CardDescription className="dark:text-gray-400">Select access level</CardDescription>
              </CardHeader>
              <CardContent>
                {errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm animate-in fade-in zoom-in-95 whitespace-pre-line">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {errorMessage}
                  </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 dark:bg-slate-800">
                    <TabsTrigger value="guest" className="dark:data-[state=active]:bg-slate-700 dark:text-gray-300"><User className="h-4 w-4 mr-2" />Guest</TabsTrigger>
                    <TabsTrigger value="staff" className="dark:data-[state=active]:bg-slate-700 dark:text-gray-300"><Users className="h-4 w-4 mr-2" />Staff</TabsTrigger>
                  </TabsList>

                  <TabsContent value="guest" className="space-y-6">
                    <form onSubmit={handleGuestLogin} className="space-y-6">
                      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                        <Button type="button" variant={guestType === 'browsing' ? 'default' : 'ghost'} className={`flex-1 text-xs ${guestType === 'browsing' ? 'dark:bg-slate-700 dark:text-white' : 'dark:text-gray-400'}`} onClick={() => setGuestType('browsing')}>
                          <Search className="h-3 w-3 mr-1" /> Browsing
                        </Button>
                        <Button type="button" variant={guestType === 'resident' ? 'default' : 'ghost'} className={`flex-1 text-xs ${guestType === 'resident' ? 'dark:bg-slate-700 dark:text-white' : 'dark:text-gray-400'}`} onClick={() => setGuestType('resident')}>
                          <Key className="h-3 w-3 mr-1" /> Resident
                        </Button>
                      </div>

                      <div className="space-y-4">
                        {guestType === 'browsing' ? (
                          <div className="space-y-2">
                            <Label className="dark:text-gray-300">Full Name</Label>
                            <Input placeholder="John Doe" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={guestName} onChange={e => setGuestName(e.target.value)} />
                          </div>
                        ) : (
                          <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                              <Label className="dark:text-gray-300">Resident Email</Label>
                              <Input type="email" placeholder="j.doe@example.com" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label className="dark:text-gray-300">Password</Label>
                              <Input type="password" placeholder="••••••••" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={guestPassword} onChange={e => setGuestPassword(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 dark:text-gray-400">Room Number (Optional)</Label>
                              <Input placeholder="e.g. 101" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={roomNumber} onChange={e => setRoomNumber(e.target.value)} />
                            </div>
                          </div>
                        )}
                      </div>
                      <Button type="submit" className="w-full bg-[#c9a227] hover:bg-[#b8941f] text-white" disabled={isLoggingIn}>
                        {isLoggingIn ? <Loader2 className="animate-spin" /> : <span className="flex items-center">Enter Portal <ArrowRight className="ml-2 h-4 w-4" /></span>}
                      </Button>
                    </form>

                    <div className="pt-4 border-t dark:border-slate-800 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Want to become a member?</p>
                      <Button variant="outline" className="w-full border-[#1e3a5f] text-[#1e3a5f] hover:bg-slate-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-slate-800" onClick={onRegisterClick}>
                        <UserPlus className="h-4 w-4 mr-2" /> Create Member Account
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="staff" className="space-y-4">
                    <form onSubmit={handleStaffLogin} className="space-y-4">
                      <Select onValueChange={(v) => setSelectedRole(v as UserRole)}>
                        <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"><SelectValue placeholder="Choose Department" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                          <SelectItem value="front_desk"><div className="flex items-center gap-2"><Hotel className="h-4 w-4" />Front Desk</div></SelectItem>
                          <SelectItem value="chef"><div className="flex items-center gap-2"><ChefHat className="h-4 w-4" />Kitchen / Chef</div></SelectItem>
                          <SelectItem value="kitchen_manager"><div className="flex items-center gap-2"><ChefHat className="h-4 w-4" />Kitchen Manager</div></SelectItem>
                          <SelectItem value="npo_rep"><div className="flex items-center gap-2"><Hotel className="h-4 w-4" />NPO Partner</div></SelectItem>
                          <SelectItem value="waitstaff"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />Service / Waitstaff</div></SelectItem>
                          <SelectItem value="maintenance"><div className="flex items-center gap-2"><Wrench className="h-4 w-4" />Maintenance</div></SelectItem>
                          <SelectItem value="housekeeping"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Housekeeping</div></SelectItem>
                          <SelectItem value="tour_guide"><div className="flex items-center gap-2"><Compass className="h-4 w-4" />Tour Guide</div></SelectItem>
                          <SelectItem value="spa_staff"><div className="flex items-center gap-2"><Flower2 className="h-4 w-4" />Spa Staff</div></SelectItem>
                          <SelectItem value="event_manager"><div className="flex items-center gap-2"><CalendarCheck2 className="h-4 w-4" />Event Manager</div></SelectItem>
                          <SelectItem value="admin"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-red-600" />Administrator</div></SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Staff Email" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} />
                      <Input type="password" placeholder="Password" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} />
                      <Button className="w-full bg-[#1e3a5f] hover:bg-[#152a45] dark:bg-blue-600 dark:hover:bg-blue-700 text-white" disabled={isLoggingIn} type="submit">
                        {isLoggingIn ? <Loader2 className="animate-spin" /> : <span className="flex items-center">Staff Login <ArrowRight className="ml-2 h-4 w-4" /></span>}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>

                <div className="mt-8 pt-4 border-t text-center flex flex-col gap-2 items-center">
                  <Button variant="outline" size="sm" className="text-gray-600 hover:text-blue-900 w-full max-w-xs" onClick={handleSeedDatabase} disabled={isSeeding}>
                    <Database className="h-3 w-3 mr-2" /> {isSeeding ? 'Syncing...' : 'Initialize System Database'}
                  </Button>
                  {DEMO_MODE && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-red-600 hover:text-red-800 border-red-200 hover:bg-red-50 w-full max-w-xs" 
                    onClick={async () => {
                      // Dev bypass also needs an authenticated session, otherwise
                      // realtime Firestore listeners are denied by security rules.
                      try {
                        const { getAuth } = await import('firebase/auth');
                        if (!getAuth().currentUser) await signInAnonymously(auth);
                      } catch {
                        /* fall through; screens will show their own errors */
                      }
                      login({ id: 'bandile_maqeda', uid: 'bandile_maqeda', name: "Bandile Maqeda", role: "admin", email: "admin@azurehorizon.com", status: 'staff' } as CustomUser);
                    }}
                  >
                    <ShieldCheck className="h-3 w-3 mr-2" /> Dev Bypass: Login as Admin
                  </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <Card key={i} className="bg-white/10 dark:bg-slate-900/40 backdrop-blur-sm border-white/20 dark:border-slate-700/50 text-white hover:bg-white/20 dark:hover:bg-slate-800/60 transition-all group">
                  <CardContent className="p-6 flex flex-col h-full">
                    <f.icon className="h-10 w-10 text-[#c9a227] dark:text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-sm text-white/80 dark:text-slate-300">{f.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showInfoModal} onOpenChange={setShowInfoModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#1e3a5f] text-2xl font-serif">Azure Horizon System</DialogTitle>
            <DialogDescription className="font-bold text-amber-600 uppercase text-xs">Increment 1 Deployment - Group 11</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-600">
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
              <div><p className="font-bold text-gray-900">Group Name:</p><p>Fixed Funding</p></div>
              <div><p className="font-bold text-gray-900">Semester:</p><p>1 (2026)</p></div>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
              <p className="font-bold text-blue-900 mb-2 underline">Staff Login (Demo):</p>
              <ul className="space-y-1">
                <li><span className="font-semibold">Admin:</span> admin@azurehorizon.com</li>
                <li><span className="font-semibold">Chef:</span> s.khoza@azurehorizon.com</li>
                <li><span className="font-semibold">Front Desk:</span> e.meyer@azurehorizon.com</li>
                <li><span className="font-semibold">Service:</span> waiter@azurehorizon.com</li>
                <li><span className="font-semibold">Maintenance:</span> t.mbeki@azurehorizon.com</li>
                <li><span className="font-semibold">Tour Guide:</span> tour@azurehorizon.com</li>
                <li><span className="font-semibold">Spa Staff:</span> spa@azurehorizon.com</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}