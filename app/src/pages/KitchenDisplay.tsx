import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCentralClock } from '@/components/ui/CentralizedClock';
import { listenForOrders, claimOrder, markOrderReady } from '@/services/firebase-services';
import type { FoodOrder, User as CustomUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { DonationLoggingForm } from '@/components/kitchen/DonationLoggingForm';
import { DonationAllocationWorkspace } from '@/components/kitchen/DonationAllocationWorkspace';
import { DonationLogisticsBoard } from '@/components/kitchen/DonationLogisticsBoard';
import { CollectionVerification } from '@/components/kitchen/CollectionVerification';
import { LeaveManagement } from '@/components/workforce/LeaveManagement';
import { RosterBuilder } from '@/components/workforce/RosterBuilder';
import { SwapBoard } from '@/components/workforce/SwapBoard';
import { OpenShiftsBoard } from '@/components/workforce/OpenShiftsBoard';
import { hasIncrement2Permission } from '@/services/permissions';
import { 
  ChefHat, 
  Clock, 
  CheckCircle, 
  Loader2,
  UtensilsCrossed,
  Home,
  Car,
  User,
  Flame,
  Bell,
  XCircle,
  AlertTriangle
} from 'lucide-react';

export function KitchenDisplay() {
  const { user } = useAuth();
  const canManageWorkforce =
    (user?.role === 'kitchen_manager' || user?.role === 'admin') &&
    hasIncrement2Permission(user?.role, 'ROSTER_MANAGEMENT');
  const currentTime = useCentralClock();
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<FoodOrder | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRejectOrder, setSelectedRejectOrder] = useState<FoodOrder | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Alert Modal state
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });
  
  // Notification state
  const [notifications, setNotifications] = useState<FoodOrder[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  // Increment 2: toggle between order queue and food-rescue workspace
  const [view, setView] = useState<'orders' | 'rescue'>('orders');
  const previousOrdersRef = useRef<FoodOrder[]>([]);

  // Create a simple beep sound using Web Audio API
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      setTimeout(() => audioContext.close(), 600);
    } catch {
      // Silently fail if audio not supported
    }
  };

  useEffect(() => {
    const unsubscribe = listenForOrders((updatedOrders) => {
      const sorted = [...updatedOrders].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // Check for new pending orders
      const previousOrders = previousOrdersRef.current;
      const newPendingOrders = updatedOrders.filter(order => 
        order.status === 'pending' && 
        !previousOrders.some(prev => prev.id === order.id && prev.status === 'pending')
      );
      
      if (newPendingOrders.length > 0) {
        // Add to notifications
        setNotifications(prev => [...newPendingOrders, ...prev].slice(0, 5));
        setShowNotification(true);
        setNewOrderCount(prev => prev + newPendingOrders.length);
        playNotificationSound();
        
        // Auto-hide notification after 5 seconds
        setTimeout(() => {
          setShowNotification(false);
        }, 5000);
      }
      
      setOrders(sorted);
      previousOrdersRef.current = updatedOrders;
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  const handleClaimOrder = async (order: FoodOrder) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const u = user as CustomUser;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chefId = u.id || u.uid || (user as any).uid;
      
      if (!chefId) {
        setAlertModal({
          open: true,
          title: "Error",
          message: "Unable to identify chef. Please log out and log in again.",
          type: "error"
        });
        setIsProcessing(false);
        return;
      }
      
      const result = await claimOrder(order.id, chefId);
      
      if (result.success) {
        setShowOrderModal(false);
      } else {
        setAlertModal({
          open: true,
          title: "Claim Failed",
          message: result.error || "Failed to claim order. Please try again.",
          type: "error"
        });
      }
    } catch (error) {
      console.error("Claim failed:", error);
      setAlertModal({
        open: true,
        title: "Error",
        message: "Error claiming order. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReady = async (order: FoodOrder) => {
    setIsProcessing(true);
    try {
      await markOrderReady(order.id);
      setShowOrderModal(false);
    } catch (error) {
      console.error("Update failed:", error);
      setAlertModal({
        open: true,
        title: "Error",
        message: "Failed to mark order as ready. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!selectedRejectOrder || !rejectReason) {
      setAlertModal({
        open: true,
        title: "Missing Reason",
        message: "Please provide a reason for rejection.",
        type: "warning"
      });
      return;
    }
    setIsProcessing(true);
    try {
      setAlertModal({
        open: true,
        title: "Order Rejected",
        message: `Order #${selectedRejectOrder.id?.slice(-6)} rejected.\nReason: ${rejectReason}`,
        type: "warning"
      });
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedRejectOrder(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearNotification = (orderId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== orderId));
    setNewOrderCount(prev => Math.max(0, prev - 1));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setNewOrderCount(0);
    setShowNotification(false);
  };

  const getOrderTypeIcon = (type: FoodOrder['orderType']) => {
    switch (type) {
      case 'dine_in': return <UtensilsCrossed className="h-4 w-4" />;
      case 'room_delivery': return <Home className="h-4 w-4" />;
      case 'takeaway': return <Car className="h-4 w-4" />;
      default: return <UtensilsCrossed className="h-4 w-4" />;
    }
  };

  const getOrderTypeLabel = (type: FoodOrder['orderType']) => {
    return (type || 'dine_in').replace('_', ' ').toUpperCase();
  };

  const getElapsedTime = (createdAt: string | number) => {
    let createdDate: Date;
    if (typeof createdAt === 'number') {
      createdDate = new Date(createdAt);
    } else {
      createdDate = new Date(createdAt);
    }
    
    if (isNaN(createdDate.getTime())) {
      return 0;
    }
    
    const diff = Math.floor((currentTime.getTime() - createdDate.getTime()) / 60000);
    return diff < 0 ? 0 : diff;
  };

  const getUrgencyColor = (elapsedMinutes: number) => {
    if (elapsedMinutes < 10) return 'text-green-600';
    if (elapsedMinutes < 20) return 'text-yellow-600';
    return 'text-red-600 font-bold animate-pulse';
  };

  const getPredictedPrepTime = (order: FoodOrder) => {
    // Base time: 8 mins
    let predicted = 8;
    
    // Complexity: +2 mins per unique item
    predicted += (order.items?.length || 0) * 2;
    
    // Type overhead
    if (order.orderType === 'room_delivery') predicted += 5;
    if (order.orderType === 'takeaway') predicted += 3;
    
    // Kitchen Load penalty: +1 min for every other order currently preparing
    const activePreparing = orders.filter(o => o.status === 'preparing' && o.id !== order.id).length;
    predicted += activePreparing;
    
    return predicted;
  };

  const PrepProgressBar = ({ order }: { order: FoodOrder }) => {
    const elapsed = getElapsedTime(order.createdAt);
    const predicted = getPredictedPrepTime(order);
    const progress = Math.min(100, (elapsed / predicted) * 100);
    
    const barColor = progress > 80 ? 'bg-amber-500' : progress > 50 ? 'bg-blue-500' : 'bg-emerald-500';
    
    return (
      <div className="space-y-1.5 mt-3">
        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
          <span className="text-slate-400">Preparation Progress</span>
          <span className={getUrgencyColor(elapsed)}>{elapsed} / {predicted} MIN</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${barColor} transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      {/* Notification Panel */}
      {showNotification && notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 w-80 animate-in slide-in-from-right-5 duration-300">
          <div className="bg-white rounded-lg shadow-2xl border-l-4 border-l-red-500 overflow-hidden">
            <div className="bg-red-50 px-4 py-2 flex justify-between items-center border-b">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-red-600 animate-bounce" />
                <span className="text-sm font-semibold text-red-800">New Orders!</span>
                <Badge className="bg-red-600 text-white text-xs">{notifications.length}</Badge>
              </div>
              <button 
                onClick={clearAllNotifications}
                className="text-gray-400 hover:text-gray-600"
                title="Clear all notifications"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((order) => (
                <div 
                  key={order.id} 
                  className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedOrder(order);
                    setShowOrderModal(true);
                    clearNotification(order.id);
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {getOrderTypeIcon(order.orderType)}
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{getOrderTypeLabel(order.orderType)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(order.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{order.guestName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {order.items.length} item(s) • R{order.totalAmount}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Button 
                      size="sm" 
                      className="h-7 text-xs bg-red-600 hover:bg-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearNotification(order.id);
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KDS HEADER */}
      <header className="bg-[#1e3a5f] text-white px-6 py-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center relative">
              <ChefHat className="h-6 w-6" />
              {newOrderCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                  {newOrderCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold">Azure Horizon KDS</h1>
              <p className="text-xs text-white/60 uppercase tracking-widest font-medium italic">Resort Operations</p>
              <div className="flex gap-1 mt-2 bg-black/20 p-1 rounded-lg w-fit">
                <button onClick={() => setView('orders')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${view === 'orders' ? 'bg-white text-[#1e3a5f]' : 'text-white/70 hover:text-white'}`}>
                  Orders
                </button>
                <button onClick={() => setView('rescue')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${view === 'rescue' ? 'bg-white text-[#1e3a5f]' : 'text-white/70 hover:text-white'}`}>
                  Food Rescue
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold leading-none text-yellow-400">{pendingOrders.length}</p>
                <p className="text-[10px] text-white/50 uppercase font-bold mt-1">New Orders</p>
              </div>
              <div className="text-center border-l border-white/10 pl-6">
                <p className="text-2xl font-bold leading-none text-blue-400">{preparingOrders.length}</p>
                <p className="text-[10px] text-white/50 uppercase font-bold mt-1">In Prep</p>
              </div>
            </div>
            <div className="text-2xl font-mono bg-black/20 px-3 py-1 rounded border border-white/10">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </header>

      {/* KANBAN BOARD / FOOD-RESCUE WORKSPACE */}
      {view === 'rescue' ? (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            <DonationLoggingForm />
            <DonationAllocationWorkspace />
            <DonationLogisticsBoard />
            <CollectionVerification />
            {canManageWorkforce ? (
              <>
                <RosterBuilder />
                <LeaveManagement managerView />
                <SwapBoard managerView />
                <OpenShiftsBoard managerView />
              </>
            ) : (
              <p>Requires kitchen management access.</p>
            )}
          </div>
        </div>
      ) : (
      <div className="flex-1 p-6 overflow-hidden">
        <div className="grid grid-cols-3 gap-6 h-full">
          {/* PENDING COLUMN */}
          <KanbanColumn
            title="Pending"
            count={pendingOrders.length}
            color="bg-yellow-500"
            orders={pendingOrders}
            onOrderClick={(order) => { setSelectedOrder(order); setShowOrderModal(true); }}
            getOrderTypeIcon={getOrderTypeIcon}
            getOrderTypeLabel={getOrderTypeLabel}
            getElapsedTime={getElapsedTime}
            getUrgencyColor={getUrgencyColor}
            PrepProgressBar={PrepProgressBar}
            actionButton={{ label: 'Claim Order', variant: 'default', className: 'bg-yellow-600 hover:bg-yellow-700' }}
          />

          {/* PREPARING COLUMN */}
          <KanbanColumn
            title="In Preparation"
            count={preparingOrders.length}
            color="bg-blue-500"
            orders={preparingOrders}
            onOrderClick={(order) => { setSelectedOrder(order); setShowOrderModal(true); }}
            getOrderTypeIcon={getOrderTypeIcon}
            getOrderTypeLabel={getOrderTypeLabel}
            getElapsedTime={getElapsedTime}
            getUrgencyColor={getUrgencyColor}
            PrepProgressBar={PrepProgressBar}
            actionButton={{ label: 'Mark Ready', variant: 'default', className: 'bg-green-600 hover:bg-green-700' }}
          />

          {/* READY COLUMN */}
          <KanbanColumn
            title="Ready for Service"
            count={readyOrders.length}
            color="bg-green-500"
            orders={readyOrders}
            onOrderClick={(order) => { setSelectedOrder(order); setShowOrderModal(true); }}
            getOrderTypeIcon={getOrderTypeIcon}
            getOrderTypeLabel={getOrderTypeLabel}
            getElapsedTime={getElapsedTime}
            getUrgencyColor={getUrgencyColor}
            PrepProgressBar={PrepProgressBar}
            actionButton={null}
          />
        </div>
      </div>
      )}

      {/* ORDER DETAIL MODAL */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-lg bg-white border-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-serif">
              Order Details #{selectedOrder?.id?.slice(-4)}
              <Badge variant="secondary" className="uppercase text-[10px] bg-slate-100">
                {getOrderTypeLabel(selectedOrder?.orderType || 'dine_in')}
              </Badge>
            </DialogTitle>
            <DialogDescription className="font-medium text-[#1e3a5f]">
              {selectedOrder?.orderType === 'room_delivery' 
                ? `Delivery to Room ${selectedOrder.roomNumber}`
                : selectedOrder?.orderType === 'dine_in'
                ? `Service for Table ${selectedOrder.tableNumber}`
                : 'Customer Takeaway'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-slate-50 dark:bg-slate-800 p-2 rounded">
              <User className="h-4 w-4" />
              <span className="font-semibold">{selectedOrder?.guestName}</span>
              <span className="mx-2">|</span>
              <Clock className="h-4 w-4" />
              <span>Received {getElapsedTime(selectedOrder?.createdAt || '')} min ago</span>
            </div>

            <div className="border rounded-lg overflow-hidden border-slate-200 dark:border-slate-700">
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b dark:border-slate-700">
                <p className="text-xs font-bold uppercase text-slate-400">Kitchen Ticket</p>
              </div>
              <div className="p-4 space-y-3">
                {selectedOrder?.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-dashed border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 bg-blue-50 text-[#1e3a5f] rounded text-xs font-bold">
                        {item.quantity}
                      </span>
                      <span className="font-medium text-sm">{item.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" className="flex-1" onClick={() => setShowOrderModal(false)}>
                Back
              </Button>
              
              {selectedOrder?.status === 'pending' && (
                <>
                  <Button 
                    variant="destructive"
                    className="flex-1" 
                    onClick={() => {
                      setShowOrderModal(false);
                      setSelectedRejectOrder(selectedOrder);
                      setShowRejectModal(true);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                  <Button 
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white" 
                    onClick={() => handleClaimOrder(selectedOrder)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : <><Flame className="mr-2 h-4 w-4" /> Start Cooking</>}
                  </Button>
                </>
              )}
              
              {selectedOrder?.status === 'preparing' && (
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
                  onClick={() => handleMarkReady(selectedOrder)}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : <><CheckCircle className="mr-2 h-4 w-4" /> Mark Ready</>}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REJECT ORDER MODAL */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Reject Order
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting #{selectedRejectOrder?.id?.slice(-6)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="w-full min-h-[100px] p-3 border rounded-md"
              placeholder="Reason for rejection (e.g., Out of stock, Equipment issue, etc.)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleRejectOrder} disabled={!rejectReason}>
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// KANBAN COLUMN COMPONENT
interface KanbanColumnProps {
  title: string;
  count: number;
  color: string;
  orders: FoodOrder[];
  onOrderClick: (order: FoodOrder) => void;
  getOrderTypeIcon: (type: FoodOrder['orderType']) => React.ReactNode;
  getOrderTypeLabel: (type: FoodOrder['orderType']) => string;
  getElapsedTime: (createdAt: string) => number;
  getUrgencyColor: (elapsedMinutes: number) => string;
  PrepProgressBar: React.FC<{ order: FoodOrder }>;
  actionButton: { label: string; variant: 'default' | 'outline'; className: string; } | null;
}

function KanbanColumn({ 
  title, 
  count, 
  color, 
  orders, 
  onOrderClick, 
  getOrderTypeIcon, 
  getOrderTypeLabel, 
  getElapsedTime, 
  getUrgencyColor, 
  PrepProgressBar,
  actionButton 
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col h-full bg-gray-200/50 dark:bg-slate-900/50 rounded-lg border border-gray-200/80 dark:border-slate-800">
      <div className={`${color} text-white px-4 py-3 rounded-t-lg flex items-center justify-between shadow-sm`}>
        <h3 className="font-bold uppercase text-xs tracking-widest">{title}</h3>
        <Badge variant="secondary" className="bg-white/20 text-white border-none font-bold">{count}</Badge>
      </div>
      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        {orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-50">
             <Clock className="h-10 w-10 mb-2" />
             <p className="text-xs font-medium italic">Waiting for orders...</p>
          </div>
        ) : (
          orders.map((order) => {
            const elapsed = getElapsedTime(order.createdAt);
            const elapsedDisplay = isNaN(elapsed) ? '0' : elapsed;
            return (
              <Card key={order.id} className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98] border border-gray-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900" onClick={() => onOrderClick(order)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400">{getOrderTypeIcon(order.orderType)}</div>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">{getOrderTypeLabel(order.orderType)}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded ${getUrgencyColor(elapsed)}`}>
                      {elapsedDisplay} min
                    </span>
                  </div>
                  <p className="font-bold text-sm text-[#1e3a5f] dark:text-blue-400">{order.guestName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 mb-3 border-b border-gray-100 dark:border-slate-800 pb-2">
                    {order.orderType === 'room_delivery' ? `Room ${order.roomNumber}` : order.orderType === 'dine_in' ? `Table ${order.tableNumber}` : 'Takeaway Order'}
                  </p>
                  
                  {/* Order Items Summary */}
                  <div className="space-y-1 mb-2">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 dark:text-slate-300 truncate pr-2"><span className="font-semibold text-slate-400 mr-1">{item.quantity}x</span>{item.name}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-[10px] font-semibold text-slate-400 italic mt-1">+ {order.items.length - 3} more items...</p>
                    )}
                  </div>

                  {/* Smart ETA Progress */}
                  {(order.status === 'pending' || order.status === 'preparing') && (
                    <PrepProgressBar order={order} />
                  )}

                  {actionButton && (
                    <Button size="sm" className={`w-full mt-4 text-[10px] font-bold uppercase h-8 ${actionButton.className}`} onClick={(e) => { e.stopPropagation(); onOrderClick(order); }}>
                      {actionButton.label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}