import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  fetchRewardsFromDB, 
  listenForUserVouchers, 
  redeemRewardTransaction,
  calculateLoyaltyTier,
  generateLoyaltyQR,
  db 
} from '@/services/firebase-services';
import { doc, onSnapshot } from 'firebase/firestore';
import type { RewardItem, RedemptionVoucher, User as AppUser } from '@/types';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  ChevronLeft, Gift, Search, Ticket, Check, 
  Copy, AlertCircle, Sparkles, Calendar, Info, 
  CheckCircle2, Loader2, QrCode
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type AuthUserBridge = AppUser & { uid?: string };

interface LoyaltyStoreProps {
  onBack?: () => void;
}

const DEFAULT_REWARDS: RewardItem[] = [
  {
    id: 'reward-1',
    title: 'Complimentary Dessert & Coffee',
    pts: 100,
    minTier: 'Bronze',
    tierRank: 1,
    howToRedeem: 'Show your QR voucher to the waiter at any Azure Horizon dining outlet.',
    terms: 'Valid on main course orders over R150. Single use.',
    validityDays: 30,
    isActive: true,
  },
  {
    id: 'reward-2',
    title: 'Complimentary Welcome Drink',
    pts: 150,
    minTier: 'Bronze',
    tierRank: 2,
    howToRedeem: 'Show your QR voucher at the Sunset Lounge bar to receive your welcome drink.',
    terms: 'Single use. Non-alcoholic option available on request.',
    validityDays: 30,
    isActive: true,
  },
  {
    id: 'reward-3',
    title: '2-for-1 Cocktails at Sunset Lounge',
    pts: 200,
    minTier: 'Bronze',
    tierRank: 3,
    howToRedeem: 'Show your QR voucher at the Sunset Lounge bar to get two cocktails for the price of one.',
    terms: 'Valid on house cocktails. Single use per table.',
    validityDays: 30,
    isActive: true,
  },
  {
    id: 'reward-4',
    title: 'Dessert Platter for Two',
    pts: 250,
    minTier: 'Bronze',
    tierRank: 4,
    howToRedeem: 'Show your QR voucher to the waiter to receive a sharing dessert platter for two.',
    terms: 'Served at main dining outlets. Single use.',
    validityDays: 30,
    isActive: true,
  },
  {
    id: 'reward-5',
    title: '10% Dining Discount Voucher',
    pts: 300,
    minTier: 'Bronze',
    tierRank: 5,
    howToRedeem: 'Show your QR voucher to the waiter before paying and 10% will be deducted from your dining bill.',
    terms: 'Valid on food and non-alcoholic beverages. Cannot be combined with other offers.',
    validityDays: 30,
    isActive: true,
  },
];

export function LoyaltyStore({ onBack }: LoyaltyStoreProps) {
  const { user, login } = useAuth();
  const currentUser = user as AuthUserBridge;

  const [rewards, setRewards] = useState<RewardItem[]>(DEFAULT_REWARDS);
  const [vouchers, setVouchers] = useState<RedemptionVoucher[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'vouchers'>('catalog');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Live Database Points Sync state
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [liveHeldPoints, setLiveHeldPoints] = useState<number | null>(null);

  // Member QR state (rotating, mobile-compatible)
  const [showMemberQR, setShowMemberQR] = useState(false);
  const [memberQRPayload, setMemberQRPayload] = useState<string | null>(null);
  const [memberQRGenerating, setMemberQRGenerating] = useState(false);

  // Modals state
  const [confirmReward, setConfirmReward] = useState<RewardItem | null>(null);
  const [lockedRewardAlert, setLockedRewardAlert] = useState<RewardItem | null>(null);
  const [activeVoucherModal, setActiveVoucherModal] = useState<RedemptionVoucher | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Live points fallback chain: Firestore Live State -> Auth Context State -> 0
  const totalPoints = livePoints !== null ? livePoints : (currentUser?.loyaltyPoints || 0);
  const heldPoints = liveHeldPoints !== null ? liveHeldPoints : (currentUser?.heldPoints || 0);
  // Mobile-compatible: only points NOT held in pending vouchers are available to spend
  const points = Math.max(0, totalPoints - heldPoints);
  
  // Always calculate effective tier dynamically from points balance
  const effectiveTier = calculateLoyaltyTier(points);
  const userTier = effectiveTier.toLowerCase();

  // Listen to live user profile changes in Firestore to sync exact points
  useEffect(() => {
    const guestId = currentUser?.id || currentUser?.uid || currentUser?.email;
    if (!guestId) return;

    const userRef = doc(db, 'users', guestId);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.loyaltyPoints === 'number') {
          setLivePoints(data.loyaltyPoints);
        }
        if (typeof data.heldPoints === 'number') {
          setLiveHeldPoints(data.heldPoints);
        } else {
          setLiveHeldPoints(0);
        }
      }
    }, (error) => {
      console.warn("Error listening to live user points:", error);
    });

    return () => unsubscribeUser();
  }, [currentUser?.id, currentUser?.uid, currentUser?.email]);

  // Load Rewards from DB with fallback
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const fetched = await fetchRewardsFromDB();
        if (isMounted && fetched && fetched.length > 0) {
          setRewards(fetched);
        }
      } catch (err) {
        console.error('Failed to load rewards catalog from DB:', err);
      } finally {
        if (isMounted) setLoadingRewards(false);
      }
    }
    loadCatalog();
    return () => { isMounted = false; };
  }, []);

  // Listen for user vouchers with safe fallback for user switching
  useEffect(() => {
    const guestId = currentUser?.id || currentUser?.uid || currentUser?.email;
    if (!guestId) return;
    const unsub = listenForUserVouchers(guestId, setVouchers);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [currentUser?.id, currentUser?.uid, currentUser?.email]);

  const copyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Build the exact voucher QR payload used by the mobile app so a web
  // voucher scans identically in the mobile staff loyalty scanner.
  const buildVoucherQRPayload = (v: RedemptionVoucher) => JSON.stringify({
    voucherCode: v.voucherCode,
    rewardTitle: v.rewardTitle,
    guestId: v.guestId,
    guestName: currentUser?.name || 'Guest',
    pts: v.ptsSpent,
    issuedAt: new Date().toISOString(),
  });

  const refreshMemberQR = useCallback(async () => {
    setMemberQRGenerating(true);
    try {
      const { qrPayload } = await generateLoyaltyQR();
      setMemberQRPayload(JSON.stringify(qrPayload));
    } catch (err) {
      console.error('Failed to generate member QR:', err);
      setMemberQRPayload(null);
    } finally {
      setMemberQRGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (!showMemberQR) return;
    refreshMemberQR();
    const interval = setInterval(refreshMemberQR, 30000); // rotate every 30s (mobile-compatible)
    return () => clearInterval(interval);
  }, [showMemberQR, refreshMemberQR]);

  const handleRedeemClick = (reward: RewardItem) => {
    if (points < reward.pts) {
      setLockedRewardAlert(reward);
      return;
    }
    setConfirmReward(reward);
  };

  const processRedemption = async () => {
    if (!confirmReward || !currentUser) return;

    const userEmail = currentUser.email || '';
    const guestId = currentUser.id || currentUser.uid || '';
    const userName = currentUser.name || 'Valued Guest';

    if (!userEmail) {
      alert('Unable to identify your account email. Please re-login.');
      return;
    }

    setIsProcessing(true);

    try {
      const { heldPoints: newHeldPoints, voucher } = await redeemRewardTransaction(
        userEmail,
        guestId,
        confirmReward,
        userName
      );

      // Update local state immediately & sync context user
      // loyaltyPoints stays unchanged — the spend is now HELD until staff scans the voucher QR
      setLiveHeldPoints(newHeldPoints);
      const updatedUser: AppUser = {
        ...currentUser,
        loyaltyPoints: livePoints !== null ? livePoints : currentUser?.loyaltyPoints,
        heldPoints: newHeldPoints,
        loyaltyTier: calculateLoyaltyTier(livePoints !== null ? livePoints : (currentUser?.loyaltyPoints || 0)),
      };
      login(updatedUser);

      setConfirmReward(null);
      setActiveVoucherModal(voucher);
    } catch (err: any) {
      alert(err?.message || 'Failed to complete reward redemption.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRewards = rewards.filter((reward) => {
    const minTier = reward.minTier || 'Bronze';
    const matchesTier =
      selectedTierFilter === 'all' ||
      minTier.toLowerCase() === selectedTierFilter.toLowerCase();
    const matchesSearch =
      reward.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (reward.terms && reward.terms.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTier && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} className="gap-2 text-[#1e3a5f]">
            <ChevronLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        ) : (
          <h2 className="text-xl font-bold font-serif text-[#1e3a5f]">Loyalty Rewards Store</h2>
        )}

        <div className="flex items-center gap-3">
          <Badge className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-mono">
            {points.toLocaleString()} PTS AVAILABLE
          </Badge>
        </div>
      </div>

      {/* Hero Banner */}
      <Card className="border-none bg-gradient-to-r from-[#1e3a5f] to-[#0f2440] text-white shadow-lg">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <span className="text-xs uppercase tracking-widest text-amber-300 font-bold">Rewards Marketplace</span>
            <h1 className="text-2xl md:text-3xl font-bold font-serif mt-1">Redeem Your Points</h1>
            <p className="text-sm text-gray-300 mt-1 max-w-md">
              Use your points to unlock room upgrades, free dining, spa sessions, and exclusive VIP perks.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-center shrink-0 min-w-[160px]">
            <p className="text-xs text-amber-200 uppercase font-semibold">Your Tier</p>
            <p className="text-xl font-bold capitalize mt-0.5">{userTier}</p>
            <p className="text-[10px] text-white/70 mt-1">{points} Available Points</p>
            {heldPoints > 0 && (
              <p className="text-[10px] text-white/50 mt-0.5">{heldPoints} held in pending vouchers</p>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="mt-3 bg-white/15 hover:bg-white/25 text-white text-xs gap-1"
              onClick={() => setShowMemberQR(true)}
            >
              <QrCode className="h-3.5 w-3.5" /> Show My QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'catalog' ? 'default' : 'ghost'}
            className={activeTab === 'catalog' ? 'bg-[#c9a227] hover:bg-[#b08d22] text-white' : ''}
            onClick={() => setActiveTab('catalog')}
          >
            <Gift className="h-4 w-4 mr-2" /> Rewards Catalog
          </Button>
          <Button
            variant={activeTab === 'vouchers' ? 'default' : 'ghost'}
            className={activeTab === 'vouchers' ? 'bg-[#c9a227] hover:bg-[#b08d22] text-white' : ''}
            onClick={() => setActiveTab('vouchers')}
          >
            <Ticket className="h-4 w-4 mr-2" /> My Vouchers ({vouchers.length})
          </Button>
        </div>

        {activeTab === 'catalog' && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search rewards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        )}
      </div>

      {/* TAB 1: CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Tier Filters */}
          <div className="flex flex-wrap gap-2">
            {['all', 'bronze', 'silver', 'gold', 'platinum'].map((tier) => (
              <Button
                key={tier}
                size="sm"
                variant={selectedTierFilter === tier ? 'default' : 'outline'}
                className={
                  selectedTierFilter === tier
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }
                onClick={() => setSelectedTierFilter(tier)}
              >
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </Button>
            ))}
          </div>

          {loadingRewards ? (
            <div className="py-12 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-[#c9a227]" /> Loading catalog...
            </div>
          ) : filteredRewards.length === 0 ? (
            <div className="py-12 text-center text-gray-400 italic bg-gray-50 rounded-xl border">
              No rewards found matching your criteria.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredRewards.map((reward) => {
                const canAfford = points >= reward.pts;
                const minTier = reward.minTier || 'Bronze';

                return (
                  <Card
                    key={reward.id}
                    className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col justify-between"
                  >
                    <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex items-start justify-between">
                          <Badge className="bg-amber-50 text-amber-800 border border-amber-200">
                            {minTier} Tier
                          </Badge>
                          <span className="text-xl font-bold font-mono text-[#c9a227]">
                            {reward.pts.toLocaleString()} pts
                          </span>
                        </div>

                        <h3 className="font-bold text-gray-900 text-lg mt-3">{reward.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{reward.terms}</p>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">
                          Valid for {reward.validityDays || 30} days
                        </span>

                        <Button
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => handleRedeemClick(reward)}
                          className={
                            canAfford
                              ? 'bg-[#c9a227] hover:bg-[#b08d22] text-white font-semibold'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }
                        >
                          {canAfford ? 'Redeem Reward' : `Need ${reward.pts - points} more pts`}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VOUCHERS */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          {vouchers.length === 0 ? (
            <Card className="border-dashed border-gray-300 bg-gray-50">
              <CardContent className="py-12 text-center text-gray-500">
                <Ticket className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-semibold text-gray-700">No Vouchers Found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Redeem rewards from the catalog to generate your digital vouchers.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {vouchers.map((v) => (
                <Card key={v.id} className="border border-gray-200 bg-white shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge
                          className={
                            v.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : v.status === 'redeemed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {v.status === 'pending' ? 'PENDING · SCAN TO REDEEM' : v.status.toUpperCase()}
                        </Badge>
                        <h4 className="font-bold text-gray-900 text-base mt-2">{v.rewardTitle}</h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-gray-400">{v.ptsSpent} pts</span>
                    </div>

                    {v.status === 'pending' && (
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center justify-center">
                        <QRCodeSVG value={buildVoucherQRPayload(v)} size={150} bgColor="#ffffff" fgColor="#1e3a5f" />
                      </div>
                    )}

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Voucher Code</p>
                        <p className="font-mono font-bold text-base text-[#1e3a5f]">{v.voucherCode}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => copyVoucherCode(v.voucherCode)}>
                        {copiedCode === v.voucherCode ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        Expires: {v.expiresAtMs ? new Date(v.expiresAtMs).toLocaleDateString() : new Date(v.expiresAt).toLocaleDateString()}
                      </p>
                      {v.status === 'pending' && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                          Present this QR to any staff member to redeem. Your {v.ptsSpent} pts are held until the staff scan.
                        </p>
                      )}
                      <p className="flex items-start gap-1">
                        <Info className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span>{v.howToRedeem}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      <Dialog open={!!confirmReward} onOpenChange={(open) => !open && setConfirmReward(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#c9a227]" /> Confirm Redemption
            </DialogTitle>
            <DialogDescription>
              Please review your point balance changes before proceeding.
            </DialogDescription>
          </DialogHeader>

          {confirmReward && (
            <div className="space-y-4 py-3">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <p className="text-xs uppercase font-semibold text-amber-800">Selected Reward</p>
                <h4 className="font-bold text-gray-900 text-lg mt-0.5">{confirmReward.title}</h4>
              </div>

              <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100 font-mono">
                <div className="flex justify-between text-gray-600">
                  <span>Current Points:</span>
                  <span>{points.toLocaleString()} pts</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Cost:</span>
                  <span>- {confirmReward.pts.toLocaleString()} pts</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between font-bold text-[#1e3a5f]">
                  <span>Remaining:</span>
                  <span>{(points - confirmReward.pts).toLocaleString()} pts</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReward(null)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={processRedemption}
              disabled={isProcessing}
              className="bg-[#c9a227] hover:bg-[#b08d22] text-white font-semibold"
            >
              {isProcessing ? 'Processing...' : 'Confirm & Redeem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOCKED REWARD DIALOG */}
      <Dialog open={!!lockedRewardAlert} onOpenChange={(open) => !open && setLockedRewardAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-amber-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" /> Reward Unavailable
            </DialogTitle>
          </DialogHeader>

          {lockedRewardAlert && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-gray-700">
                You do not have enough points to redeem <strong>{lockedRewardAlert.title}</strong>.
              </p>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-sm space-y-1 font-mono">
                <div className="flex justify-between text-gray-600">
                  <span>Required:</span>
                  <span>{lockedRewardAlert.pts} pts</span>
                </div>
                <div className="flex justify-between text-amber-800 font-bold">
                  <span>Your Points:</span>
                  <span>{points} pts</span>
                </div>
                <div className="pt-2 border-t border-amber-200 flex justify-between font-bold text-red-600">
                  <span>Points Needed:</span>
                  <span>{lockedRewardAlert.pts - points} pts</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setLockedRewardAlert(null)} className="bg-[#1e3a5f] text-white w-full">
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VOUCHER GENERATED DIALOG */}
      <Dialog open={!!activeVoucherModal} onOpenChange={(open) => !open && setActiveVoucherModal(null)}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif text-[#c9a227] text-center flex items-center justify-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" /> Reward Purchased!
            </DialogTitle>
            <DialogDescription className="text-center">
              {activeVoucherModal?.ptsSpent} pts are now held in this voucher. Show this QR (or the code) to any staff member to redeem your reward.
            </DialogDescription>
          </DialogHeader>

          {activeVoucherModal && (
            <div className="py-4 space-y-4">
              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-dashed border-gray-300 space-y-3">
                <div className="flex justify-center">
                  <QRCodeSVG value={buildVoucherQRPayload(activeVoucherModal)} size={180} bgColor="#ffffff" fgColor="#1e3a5f" />
                </div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Voucher Code</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-mono font-bold text-[#1e3a5f] tracking-wider">
                    {activeVoucherModal.voucherCode}
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => copyVoucherCode(activeVoucherModal.voucherCode)}>
                    {copiedCode === activeVoucherModal.voucherCode ? (
                      <Check className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Copy className="h-5 w-5 text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button onClick={() => setActiveVoucherModal(null)} className="w-full bg-[#1e3a5f] text-white">
            Done
          </Button>
        </DialogContent>
      </Dialog>

      {/* MEMBER QR DIALOG (mobile-compatible, rotates every 30s) */}
      <Dialog open={showMemberQR} onOpenChange={setShowMemberQR}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif text-[#1e3a5f] text-center">Your Loyalty QR</DialogTitle>
            <DialogDescription className="text-center">
              Staff scan this to look up your profile and award/check points. Refreshes every 30 seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center gap-3">
            {memberQRGenerating || !memberQRPayload ? (
              <div className="h-[220px] w-[220px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#c9a227]" />
              </div>
            ) : (
              <QRCodeSVG value={memberQRPayload} size={220} bgColor="#ffffff" fgColor="#1e3a5f" />
            )}
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="font-semibold text-gray-700">{currentUser?.name}</p>
              <p className="text-[10px]">{points} available pts · {userTier} tier</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}