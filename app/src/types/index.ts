// src/types/index.ts

// User Roles (extended for Increment 2: kitchen_manager capability + npo_rep portal + staff)
export type UserRole = 'admin' | 'guest' | 'front_desk' | 'chef' | 'kitchen_manager' | 'npo_rep' | 'staff' | 'waitstaff' | 'delivery' | 'maintenance' | 'housekeeping' | 'tour_guide' | 'spa_staff' | 'event_manager' | null;

// User Interface
export interface User {
  uid: string;
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  roomNumber?: string;
  checkInDate?: string;
  checkOutDate?: string;
  // NEW: Essential for the Visitor vs Resident gatekeeping
  status?: 'visitor' | 'resident' | 'staff'; 
  isAuthenticated?: boolean;
  // Loyalty System
// Add these inside your User interface
  loyaltyPoints?: number;
  loyaltyTier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  heldPoints?: number; // Mobile-compatible: points locked in pending vouchers
}

// Room Types
export interface Room {
  id: string;
  name: string;
  type: 'ocean_view' | 'garden' | 'penthouse' | 'family' | 'beachfront' | 'mountain_view' | 'accessible';
  price: number;
  capacity: number;
  description: string;
  amenities: string[];
  images: string[];
  isAvailable: boolean;
}

// Booking Types
export interface Booking {
  id: string;
  uid?: string; // Firebase UID for auth linkage
  guestId: string;
  guestEmail?: string;  // ← ADD THIS LINE
  guestName: string;
  roomId: string;
  roomName: string;
  roomNumber: string; // Ensure this exists for UI mapping
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  specialRequests?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  totalAmount: number;
  depositPaid?: number;
  balanceDue?: number; // Amount remaining to be paid
  paymentStatus: 'pending' | 'deposit_paid' | 'paid' | 'refunded' ;
  lastPaidAt?: string; // Timestamp of last bill payment for tracking paid vs unpaid charges
  createdAt: string;
}

// Room Service Request Types
export type RequestType = 'housekeeping' | 'maintenance';
export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface RoomServiceRequest {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  type: RequestType;
  description: string;
  status: RequestStatus;
  imageUrl?: string;  // Keep as optional string (undefined when not provided)
  priority?: 'low' | 'medium' | 'high'; 
  createdAt: string;
  completedAt?: string;
}

// Restaurant Types
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'appetizers' | 'mains' | 'desserts' | 'beverages';
  image?: string;
  dietary?: string[];
}

export interface TableReservation {
  id: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  specialRequests?: string;
  status: 'confirmed' | 'cancelled' | 'completed';
}

export type OrderType = 'dine_in' | 'takeaway' | 'room_delivery';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';

export interface OrderItem {
  menuItemId?: string; // Optional if adding custom items
  name: string;
  quantity: number;
  price: number;
  specialInstructions?: string;
}

export interface FoodOrder {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  tableNumber?: string;
  orderType: OrderType;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;  // ← This should use OrderStatus type
  assignedTo?: string;
  createdAt: string;
  estimatedReadyTime?: string;
}

// Chat Message Types
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'guest' | 'concierge' | 'system';
  message: string;
  timestamp: string;
  isRead: boolean;
}

// Guide Content Types
export interface GuideSection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

// Incidentals for Check-out
export interface IncidentalCharge {
  id: string;
  description: string;
  amount: number;
  date: string;
}

// ==========================================
// TOUR TYPES
// ==========================================

export interface TourScheduleSlot {
  date: string;        // ISO date string e.g. "2026-04-25"
  time: string;        // e.g. "09:00"
  capacity: number;
  bookedCount: number;
}

export interface TourPricingTier {
  adult: number;
  child: number;       // Under 12
  pensioner: number;   // 60+
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  duration: string;    // e.g. "3 hours"
  locations: string;   // e.g. "Harbour → Whale Rock → Sunset Bay"
  images: string[];
  pricing: TourPricingTier;
  schedules: TourScheduleSlot[];
  isActive: boolean;
  createdAt: string;
}

export interface TourTicket {
  type: 'adult' | 'child' | 'pensioner';
  quantity: number;
  priceEach: number;
}

export type TourBookingStatus = 'confirmed' | 'checked_in' | 'no_show' | 'cancelled';

export interface TourBooking {
  id: string;
  tourId: string;
  tourName: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  tickets: TourTicket[];
  totalAmount: number;
  status: TourBookingStatus;
  bookingReference: string;
  createdAt: string;
}

// ==========================================
// ACTIVITY BOARD (Social Feature)
// ==========================================

export interface ActivityPost {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  message: string;
  likes: number;
  likedBy?: string[]; // Array of guestIds who liked this post
  createdAt: string;
}

// ==========================================
// LOYALTY LOG
// =========================================

// ==========================================
// LOYALTY SYSTEM TYPES
// ==========================================

export interface RewardItem {
  id: string;
  title: string;
  pts: number;
  description?: string;
  category?: string;
  minTier?: string;
  tierRank?: number;
  validityDays: number;
  terms: string;
  howToRedeem: string;
  isActive: boolean;
}

export interface RedemptionVoucher {
  id: string;
  guestId: string;
  userEmail: string;
  userDocId?: string; // users doc id the points are held on (mobile-compatible)
  rewardId: string;
  rewardTitle: string;
  ptsSpent?: number;
  pointsSpent?: number; // mobile-app field alias
  voucherCode: string;
  status: 'active' | 'redeemed' | 'expired' | 'pending' | 'expired_refunded';
  claimed?: boolean; // mobile-app field
  claimedAt?: string;
  claimedByStaff?: string;
  howToRedeem?: string;
  terms?: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs?: number; // mobile-app field (24h expiry)
}

export interface LoyaltyLogEntry {
  id: string;
  guestId: string;
  points: number;
  reason: string;
  createdAt: string;
}