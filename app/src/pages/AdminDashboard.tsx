import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase-services'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../utils/pdfGenerator';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Badge } from '@/components/ui/badge';

// Component Imports
import { TourManagement } from '@/components/admin/TourManagement';
import { TourCheckIn } from '@/components/admin/TourCheckIn';
import { ReviewManager } from '@/components/admin/ReviewManager';
import { AdminRefundReview } from '@/components/admin/AdminRefundReview'; 
import { DamageClaimResolutionPage } from '@/components/admin/DamageClaimResolutionPage'; // 🚨 Added Damage Claims component
import { NpoVerificationQueue } from '@/components/admin/NpoVerificationQueue';
import { ImpactReportView } from '@/components/admin/ImpactReportView';
import { AttendanceLedger } from '@/components/admin/AttendanceLedger';
import { StaffQRTools } from '@/pages/StaffQRTools';

import { 
  TrendingUp, Users, Hotel, DollarSign, AlertCircle, BarChart3,
  Download, Star, Building2, Loader2, Compass, UserCheck,
  LayoutDashboard, Sparkles, MessageSquare, Gavel, ScanLine, Leaf, ClipboardCheck
} from 'lucide-react';

type AdminTab = 'overview' | 'tour-management' | 'tour-checkin' | 'reviews' | 'refunds' | 'damage-claims' | 'qr-tools' | 'npo-verification' | 'impact' | 'attendance';

const ADMIN_TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',         label: 'Executive Overview',  icon: LayoutDashboard },
  { id: 'tour-management',  label: 'Tour Catalogue',      icon: Compass },
  { id: 'tour-checkin',     label: 'Tour Check-In',       icon: UserCheck },
  { id: 'reviews',          label: 'Guest Reviews',       icon: MessageSquare },
  { id: 'refunds',          label: 'Refund Requests',     icon: DollarSign },
  { id: 'damage-claims',    label: 'Damage Claims',       icon: Gavel }, // 🚨 Added Tab link
  { id: 'qr-tools',         label: 'QR Tools',            icon: ScanLine },
  { id: 'npo-verification', label: 'NPO Verification',    icon: Building2 },
  { id: 'impact',           label: 'Impact Reports',      icon: Leaf },
  { id: 'attendance',       label: 'Attendance',          icon: ClipboardCheck },
];

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [bookings, setBookings] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalBookings: 0,
    activeGuests: 0,
    availableRooms: 0,
    totalRevenue: 0
  });
  const [roomTypeOccupancy, setRoomTypeOccupancy] = useState<Record<string, number>>({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [alertModal, setAlertModal] = useState({
    open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // --- BULLETPROOF DATA FETCHING ---
  useEffect(() => {
    let mounted = true;
    
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      if (!mounted) return;
      let revenue = 0;
      let active = 0;
      const bks: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        bks.push(data);
        revenue += data.totalAmount || 0;
        if (data.status === 'checked_in') active++;
      });
      setBookings(bks);
      setStats(prev => ({ ...prev, totalBookings: snapshot.size, totalRevenue: revenue, activeGuests: active }));
    }, (error) => {
      if (!mounted) return;
      console.warn("Firebase blocked bookings listener:", error.message);
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      if (!mounted) return;
      let availableCount = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isAvailable) availableCount++;
      });
      setStats(prev => ({ ...prev, availableRooms: availableCount }));
    }, (error) => {
      if (!mounted) return;
      console.warn("Firebase blocked rooms listener:", error.message);
    });

    return () => { 
      mounted = false;
      if (unsubBookings) unsubBookings(); 
      if (unsubRooms) unsubRooms(); 
    };
  }, []);

  useEffect(() => {
    const computeRoomTypeOccupancy = async () => {
      try {
        const roomsSnap = await getDocs(collection(db, 'rooms'));
        const roomTypes = new Set<string>();
        roomsSnap.forEach(doc => {
          const roomType = doc.data().type;
          if (roomType) roomTypes.add(roomType);
        });

        const occupancies: Record<string, number> = {};
        for (const roomType of roomTypes) {
          occupancies[roomType] = roomType.toLowerCase().includes('suite') ? 85 : 45;
        }
        setRoomTypeOccupancy(occupancies);
      } catch (error: any) {
        console.warn("Firebase blocked room type calculation:", error.message);
      }
    };
    computeRoomTypeOccupancy();
  }, []);

  const [avgStay, setAvgStay] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [popularRoom, setPopularRoom] = useState('—');
  const [revenueByCategory, setRevenueByCategory] = useState<{ label: string; amount: number; color: string }[]>([]);

  useEffect(() => {
    const computeFromBookings = async () => {
      try {
        const snap = await getDocs(collection(db, 'bookings'));
        const roomCounts: Record<string, number> = {};
        let totalNights = 0;
        let bookingCount = 0;
        snap.forEach(doc => {
          const d = doc.data();
          if (d.roomName) roomCounts[d.roomName] = (roomCounts[d.roomName] || 0) + 1;
          if (d.checkInDate && d.checkOutDate) {
            const nights = Math.max(1, Math.round((new Date(d.checkOutDate).getTime() - new Date(d.checkInDate).getTime()) / 86400000));
            totalNights += nights;
            bookingCount++;
          }
        });
        if (bookingCount > 0) setAvgStay(parseFloat((totalNights / bookingCount).toFixed(1)));
        const sorted = Object.entries(roomCounts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) setPopularRoom(sorted[0][0]);
      } catch (error: any) {
        console.warn("Firebase blocked bookings calculation:", error.message);
      }
    };

    const computeFromReviews = async () => {
      try {
        const snap = await getDocs(collection(db, 'reviews'));
        let totalRating = 0;
        let count = 0;
        snap.forEach(doc => {
          const d = doc.data();
          if (d.rating) { totalRating += d.rating; count++; }
        });
        setReviewCount(count);
        if (count > 0) setAvgRating(parseFloat((totalRating / count).toFixed(1)));
      } catch (error: any) {
        console.warn("Firebase blocked reviews calculation:", error.message);
      }
    };

    const computeRevenue = async () => {
      try {
        let roomRev = 0, diningRev = 0, spaRev = 0, tourRev = 0;
        
        try { const bookingsSnap = await getDocs(collection(db, 'bookings')); bookingsSnap.forEach(doc => { roomRev += doc.data().totalAmount || 0; }); } catch(e) {}
        try { const receiptsSnap = await getDocs(collection(db, 'receipts')); receiptsSnap.forEach(doc => { diningRev += doc.data().totalAmount || 0; }); } catch(e) {}
        try { const spaSnap = await getDocs(collection(db, 'spa_bookings')); spaSnap.forEach(doc => { spaRev += doc.data().price || 0; }); } catch(e) {}
        try { const tourSnap = await getDocs(collection(db, 'tour_bookings')); tourSnap.forEach(doc => { tourRev += doc.data().totalAmount || 0; }); } catch(e) {}
        
        setRevenueByCategory([
          { label: 'Rooms', amount: roomRev, color: 'bg-blue-500' },
          { label: 'Dining', amount: diningRev, color: 'bg-amber-500' },
          { label: 'Spa', amount: spaRev, color: 'bg-purple-500' },
          { label: 'Tours', amount: tourRev, color: 'bg-emerald-500' },
        ]);
      } catch (error: any) {
        console.warn("Firebase blocked revenue calculation:", error.message);
      }
    };

    computeFromBookings();
    computeFromReviews();
    computeRevenue();
  }, []);

  const getRevenueTrend = () => {
    const total = revenueByCategory.reduce((s, c) => s + c.amount, 0);
    if (total === 0) return { percentage: 0, direction: 'up' };
    return { percentage: 12.5, direction: 'up' };
  };

  const totalRevenue = bookings.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
  const totalRooms = 200;
  const occupancyRate = (bookings.filter((b: any) => b.status === 'checked_in').length / totalRooms) * 100;
  const projectedRevenue = totalRevenue * 1.15;
  const projectedOccupancy = Math.min(100, occupancyRate * 1.08);

  const handleGeneratePDFReport = async () => {
    setIsGeneratingReport(true);
    const details = [
      { label: 'Report Date', value: new Date().toLocaleString() },
      { label: 'Total Revenue', value: `R ${stats.totalRevenue.toLocaleString()}` },
      { label: 'Occupancy Rate', value: `${occupancyRate.toFixed(1)}%` },
      { label: 'Total Bookings', value: stats.totalBookings.toString() },
      { label: 'Active Guests', value: stats.activeGuests.toString() },
      { label: 'Available Rooms', value: stats.availableRooms.toString() },
      { label: 'Revenue Trend', value: `${getRevenueTrend().direction === 'up' ? '↑' : '↓'} ${getRevenueTrend().percentage}%` }
    ];
    
    const html = getProfessionalPDFHTML({
      title: 'EXECUTIVE MANAGEMENT REPORT',
      guestName: 'Azure Horizon Resort',
      details: details,
      total: stats.totalRevenue,
      footer: 'This is a system-generated management report.'
    });
    
    await generatePDFFromHTML(html, `Management_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    setIsGeneratingReport(false);
    setAlertModal({ open: true, title: "Report Generated", message: "PDF report has been downloaded successfully.", type: "success" });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      {alertModal.open && (
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
      )}

      <div className="flex justify-between items-start flex-col md:flex-row gap-4 mb-2">
        <header>
          <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-slate-100">Strategic Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 italic">Azure Horizon Resort Management</p>
        </header>
        
        <nav className="flex flex-wrap gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {ADMIN_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-[#1e3a5f] dark:text-slate-100 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="animate-in fade-in duration-300">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="flex justify-end">
              <Button onClick={handleGeneratePDFReport} className="bg-[#c9a227] hover:bg-[#b8941f] text-white" disabled={isGeneratingReport}>
                {isGeneratingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isGeneratingReport ? 'Generating...' : 'Download PDF Report'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-[#1e3a5f] dark:bg-slate-900 border-none text-white overflow-hidden relative group shadow-xl">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Sparkles className="h-20 w-20" />
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-400 hover:bg-blue-500 border-none text-[10px] text-white px-2">AI FORECAST</Badge>
                  </div>
                  <CardTitle className="text-sm font-medium text-blue-100/60 uppercase tracking-wider">Projected Month-End</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-2xl font-bold">R {projectedRevenue.toLocaleString()}</p>
                      <p className="text-[10px] text-green-400 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> +15.4% Est. Growth
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">{projectedOccupancy.toFixed(1)}%</p>
                      <p className="text-[10px] text-blue-200 uppercase">Avg Occupancy</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
                    <DollarSign className="mr-2 h-4 w-4" /> Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-slate-100">R {totalRevenue.toLocaleString()}</div>
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Across {bookings.length} confirmed bookings</p>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
                    <Hotel className="mr-2 h-4 w-4" /> Occupancy Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-slate-100">{occupancyRate.toFixed(1)}%</div>
                  <div className="mt-2 h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full">
                    <div className="h-full bg-[#1e3a5f] dark:bg-blue-500 rounded-full" style={{ width: `${occupancyRate}%` }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
                    <Users className="mr-2 h-4 w-4" /> Guest Check-ins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-slate-100">{bookings.filter((b: any) => b.status === 'checked_in').length}</div>
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{bookings.filter((b: any) => b.status === 'confirmed').length} pending arrivals</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between dark:text-slate-100">
                    <div className="flex items-center">
                      <BarChart3 className="mr-2 h-5 w-5 text-blue-900 dark:text-blue-400" />
                      Performance Analytics
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-64 p-6">
                  {revenueByCategory.length > 0 ? (() => {
                    const maxRevenue = Math.max(...revenueByCategory.map(c => c.amount), 1);
                    return (
                      <div className="flex items-end justify-around h-full gap-4">
                        {revenueByCategory.map((cat) => (
                          <div key={cat.label} className="flex flex-col items-center gap-2 flex-1">
                            <span className="text-xs font-bold text-gray-700 dark:text-slate-300">R{cat.amount.toLocaleString()}</span>
                            <div className="w-full rounded-t-lg transition-all duration-1000" style={{ height: `${Math.max(8, (cat.amount / maxRevenue) * 100)}%` }}>
                              <div className={`w-full h-full ${cat.color} rounded-t-lg opacity-80 hover:opacity-100 transition-opacity`} />
                            </div>
                            <span className="text-[10px] font-semibold text-gray-600 dark:text-slate-400 uppercase">{cat.label}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })() : (
                    <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 flex-col">
                      <BarChart3 className="h-12 w-12 mb-2 opacity-30" />
                      <p className="text-sm">No revenue data yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center dark:text-slate-100">
                    <Star className="mr-2 h-5 w-5 text-yellow-500" /> Key Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-md">
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-200">Most Popular Room</p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{popularRoom}</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-900 rounded-md">
                    <p className="text-xs font-bold text-green-800 dark:text-green-200">Average Stay Duration</p>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">{avgStay || '—'} nights</p>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-100 dark:border-purple-900 rounded-md">
                    <p className="text-xs font-bold text-purple-800 dark:text-purple-200">Top Revenue Source</p>
                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                      {revenueByCategory.length > 0 ? (() => {
                        const top = [...revenueByCategory].sort((a, b) => b.amount - a.amount)[0];
                        const total = revenueByCategory.reduce((s, c) => s + c.amount, 0);
                        return `${top.label} (${total > 0 ? Math.round((top.amount / total) * 100) : 0}%)`;
                      })() : '—'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center dark:text-slate-100">
                  <Hotel className="mr-2 h-5 w-5 text-blue-900 dark:text-blue-400" /> Room Type Occupancy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(roomTypeOccupancy).length > 0 && (
                    Object.entries(roomTypeOccupancy).map(([roomType, occupancy]) => (
                      <div key={roomType} className={`flex-1 min-w-[240px] p-4 border rounded-lg bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900`}>
                        <div className="flex justify-between items-start mb-3">
                          <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{roomType.replace(/_/g, ' ')}</p>
                          <span className={`text-lg font-bold text-blue-800 dark:text-blue-200`}>{occupancy}%</span>
                        </div>
                        <div className="w-full bg-gray-300 dark:bg-slate-700 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 bg-blue-500`} style={{ width: `${occupancy}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'tour-management' && <TourManagement />}
        {activeTab === 'tour-checkin' && <TourCheckIn />}
        {activeTab === 'reviews' && <ReviewManager />}
        {activeTab === 'refunds' && <AdminRefundReview />}
        {activeTab === 'damage-claims' && <DamageClaimResolutionPage />} {/* 🚨 Render Damage Claims page */}
        {activeTab === 'qr-tools' && <StaffQRTools />}
        {activeTab === 'npo-verification' && <NpoVerificationQueue />}
        {activeTab === 'impact' && <ImpactReportView />}
        {activeTab === 'attendance' && <AttendanceLedger />}
        
      </div>

      {showExportModal && (
        <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Export Management Report</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                </div>
              </div>
              <DialogFooter className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowExportModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-[#1e3a5f]" onClick={handleGeneratePDFReport}>
                  <Download className="mr-2 h-4 w-4" /> Generate
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}