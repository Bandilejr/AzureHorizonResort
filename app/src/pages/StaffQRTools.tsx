import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ScanLine, Ticket, UserCheck, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Award, ChevronLeft, QrCode, Camera, Keyboard, Truck
} from 'lucide-react';
import {
  validateLoyaltyQR,
  redeemVoucherByStaff,
  validateAttendeeQR,
  awardLoyaltyPoints
} from '@/services/firebase-services';
import { auth } from '@/lib/firebase';
import { CollectionVerification } from '@/components/kitchen/CollectionVerification';

type ScannerTab = 'member' | 'voucher' | 'attendee' | 'donation';

const SCANNER_ID = 'staff-qr-reader-region';

function useQrScanner(onDecode: (text: string) => Promise<void> | void) {
  const [camerasReady, setCamerasReady] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
      } catch { /* already stopped */ }
      setIsScanning(false);
    }
  };

  const startScanner = async () => {
    setCameraError('');
    setCamerasReady(null);
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      const devices = await Html5Qrcode.getCameras();
      if (devices.length === 0) {
        setCamerasReady(false);
        setCameraError('No camera found. Use manual entry below.');
        return;
      }
      setCamerasReady(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            await scanner.stop();
            setIsScanning(false);
            await onDecode(decodedText);
          } finally {
            busyRef.current = false;
          }
        },
        () => { /* ignore per-frame errors */ }
      );
      setIsScanning(true);
    } catch (err: any) {
      console.warn('Camera start failed:', err);
      setCamerasReady(false);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access or use manual entry below.'
          : 'Camera unavailable in this browser/context. Use manual entry below.'
      );
    }
  };

  const resetScanner = () => {
    scannerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); scannerRef.current.clear(); } catch { /* noop */ }
      }
    };
  }, []);

  return { camerasReady, isScanning, cameraError, startScanner, stopScanner, resetScanner, scanAgain: startScanner };
}

interface MemberResult {
  valid: boolean;
  message?: string;
  reason?: string;
  guest?: any;
}

interface ScanResult {
  kind: ScannerTab;
  ok: boolean;
  title: string;
  message: string;
  payload: any;
}

export function StaffQRTools({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<ScannerTab>('member');
  const [manualInput, setManualInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  // member tab extras
  const [memberResult, setMemberResult] = useState<MemberResult | null>(null);
  const [bonusPoints, setBonusPoints] = useState('50');
  const [isAwarding, setIsAwarding] = useState(false);

  const handleDecode = async (text: string) => {
    setResult(null);
    setMemberResult(null);

    if (tab === 'member') {
      try {
        const res = await validateLoyaltyQR({ qrPayload: text });
        setMemberResult(res);
        setResult({
          kind: 'member',
          ok: res.valid,
          title: res.valid ? 'Guest Verified' : 'Verification Failed',
          message: res.message || '',
          payload: res.guest,
        });
      } catch (err: any) {
        setResult({ kind: 'member', ok: false, title: 'Scan Error', message: err?.message || 'Failed to parse QR', payload: null });
      }
    }

    if (tab === 'voucher') {
      try {
        let voucherCode = text.trim();
        try {
          const parsed = JSON.parse(text);
          voucherCode = (parsed.voucherCode || '').trim();
        } catch { /* raw code entry */ }
        if (!voucherCode) throw new Error('No voucher code found in QR.');
        const staffUid = auth.currentUser?.uid || 'staff-web';
        const res = await redeemVoucherByStaff(voucherCode, staffUid);
        setResult({
          kind: 'voucher',
          ok: true,
          title: 'Voucher Redeemed',
          message: res.message,
          payload: res.voucher,
        });
      } catch (err: any) {
        setResult({
          kind: 'voucher',
          ok: false,
          title: 'Redemption Failed',
          message: err?.message || 'Invalid voucher QR.',
          payload: null,
        });
      }
    }

    if (tab === 'attendee') {
      try {
        const res = await validateAttendeeQR({ qrPayload: text });
        setResult({
          kind: 'attendee',
          ok: res.valid,
          title: res.valid ? 'Check-In Successful' : 'Check-In Denied',
          message: res.message || '',
          payload: res.attendee,
        });
      } catch (err: any) {
        setResult({ kind: 'attendee', ok: false, title: 'Scan Error', message: err?.message || 'Failed to validate pass', payload: null });
      }
    }
  };

  const {
    camerasReady, isScanning, cameraError, stopScanner, resetScanner, scanAgain
  } = useQrScanner(handleDecode);

  useEffect(() => {
    resetScanner();
    setResult(null);
    setMemberResult(null);
    setManualInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) return;
    setIsSubmitting(true);
    try {
      await handleDecode(manualInput.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAwardBonus = async () => {
    if (!memberResult?.guest?.guestId || !memberResult?.guest?.email) return;
    setIsAwarding(true);
    try {
      const pts = parseInt(bonusPoints, 10);
      if (!pts || pts <= 0) throw new Error('Enter a valid point amount.');
      const res = await awardLoyaltyPoints(
        memberResult.guest.guestId,
        memberResult.guest.email,
        pts,
        'Staff bonus awarded via web scanner'
      );
      if (!res.success) throw new Error(res.error || 'Failed to award points');
      setResult({
        kind: 'member',
        ok: true,
        title: `+${pts} Points Awarded`,
        message: `Bonus points credited to ${memberResult.guest.email}`,
        payload: null,
      });
      setMemberResult(null);
    } catch (err: any) {
      setResult({ kind: 'member', ok: false, title: 'Award Failed', message: err?.message || 'Unknown error', payload: null });
    } finally {
      setIsAwarding(false);
    }
  };

  const TABS: { id: ScannerTab; label: string; icon: React.ElementType }[] = [
    { id: 'member', label: 'Member QR', icon: QrCode },
    { id: 'voucher', label: 'Voucher Redemption', icon: Ticket },
    { id: 'attendee', label: 'Attendee Check-In', icon: UserCheck },
    { id: 'donation', label: 'Donation Collection (UC39)', icon: Truck },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="text-[#1e3a5f]">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-slate-100">Staff QR Tools</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Scans the exact same QR codes used by the mobile app — web and mobile are interchangeable.
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-slate-700 text-[#1e3a5f] dark:text-slate-100 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'donation' ? (
        <CollectionVerification />
      ) : (
      <Card className="border-none shadow-md bg-white dark:bg-slate-900">
        <CardContent className="p-6 space-y-5">
          {!isScanning && !result && (
            <div className="space-y-4">
              <div
                id={SCANNER_ID}
                className={`w-full rounded-xl overflow-hidden border-2 border-dashed transition-all ${
                  camerasReady ? 'border-emerald-300' : 'border-gray-300'
                }`}
              ></div>

              {camerasReady && !isScanning && (
                <p className="text-xs text-gray-400 text-center">Position the guest's QR inside the frame.</p>
              )}

              {!isScanning && (
                <Button className="w-full bg-[#1e3a5f] text-white gap-2" onClick={scanAgain} disabled={camerasReady === null}>
                  <Camera className="h-4 w-4" /> {camerasReady === null ? 'Initializing Camera…' : 'Start Camera Scan'}
                </Button>
              )}

              {isScanning && (
                <Button className="w-full bg-red-600 text-white gap-2" onClick={stopScanner}>
                  <XCircle className="h-4 w-4" /> Stop Scanning
                </Button>
              )}

              {cameraError && (
                <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5" /> Manual Entry
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder={tab === 'voucher' ? 'Enter voucher code (AZURE-REWARD-XXXXXX)' : 'Paste scanned QR payload'}
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  />
                  <Button onClick={handleManualSubmit} disabled={isSubmitting || !manualInput.trim()} className="bg-[#c9a227] text-white gap-1.5">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                    Check
                  </Button>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className={`rounded-xl border p-5 flex items-start gap-4 ${
                result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
                {result.ok
                  ? <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                  : <XCircle className="h-8 w-8 text-red-600 shrink-0" />}
                <div>
                  <h3 className={`font-bold text-lg ${result.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                    {result.title}
                  </h3>
                  <p className="text-sm mt-0.5 text-gray-700">{result.message}</p>

                  {result.kind === 'member' && memberResult?.guest && (
                    <div className="mt-3 bg-white rounded-lg border border-emerald-100 p-3 text-sm text-gray-800 space-y-1">
                      <p><span className="font-semibold">Name:</span> {memberResult.guest.name || '—'}</p>
                      <p><span className="font-semibold">Email:</span> {memberResult.guest.email || '—'}</p>
                      <p><span className="font-semibold">Loyalty Points:</span> {memberResult.guest.loyaltyPoints ?? '—'}</p>
                      <p><span className="font-semibold">Held Points:</span> {memberResult.guest.heldPoints ?? 0}</p>
                      <p className="capitalize"><span className="font-semibold">Tier:</span> {memberResult.guest.loyaltyTier || '—'}</p>
                    </div>
                  )}

                  {result.kind === 'member' && memberResult?.guest && (
                    <div className="mt-4 flex items-end gap-2 bg-white rounded-lg border border-emerald-100 p-3">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Award Bonus Points</p>
                        <Input
                          type="number"
                          value={bonusPoints}
                          onChange={(e) => setBonusPoints(e.target.value)}
                          className="w-28"
                        />
                      </div>
                      <Button className="bg-emerald-600 text-white gap-1.5" onClick={handleAwardBonus} disabled={isAwarding}>
                        {isAwarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                        Award
                      </Button>
                    </div>
                  )}

                  {result.kind === 'voucher' && result.payload && (
                    <div className="mt-3 bg-white rounded-lg border border-emerald-100 p-3 text-sm text-gray-800 space-y-1">
                      <p><span className="font-semibold">Reward:</span> {result.payload.rewardTitle || '—'}</p>
                      <p><span className="font-semibold">Code:</span> {result.payload.voucherCode}</p>
                      <p><span className="font-semibold">Points:</span> {result.payload.pointsSpent ?? result.payload.ptsSpent ?? '—'}</p>
                      {result.payload.expiresAtMs && (
                        <p><span className="font-semibold">Expires:</span> {new Date(result.payload.expiresAtMs).toLocaleString()}</p>
                      )}
                    </div>
                  )}

                  {result.kind === 'attendee' && result.payload && (
                    <div className="mt-3 bg-white rounded-lg border border-emerald-100 p-3 text-sm text-gray-800 space-y-1">
                      <p><span className="font-semibold">Attendee:</span> {result.payload.inviteeName || 'Guest'}</p>
                      <p><span className="font-semibold">Email:</span> {result.payload.inviteeEmail || '—'}</p>
                      {result.payload.checkedInAt && (
                        <p><span className="font-semibold">Checked In:</span> {String(result.payload.checkedInAt)}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Button className="w-full bg-[#1e3a5f] text-white gap-2" onClick={() => { setResult(null); scanAgain(); }}>
                <ScanLine className="h-4 w-4" /> Scan Next
              </Button>
            </div>
          )}

          <div className="text-xs text-gray-400 flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] font-mono">UC21 · Loyalty Member QR (60s, signed)</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">UC22 · Voucher (held-points model)</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">UC27 · Invitation check-in</Badge>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
