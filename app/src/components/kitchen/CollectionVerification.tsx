// Collection verification: courier QR → verify window/bay/status → seal + sign → dispatch.
// Reuses StaffQRTools html5-qrcode scanner pattern + manual entry fallback.
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, ScanLine, CheckCircle2 } from 'lucide-react';
import { verifyCollectionQR } from '@/services/increment2-services';
import { useAuth } from '@/hooks/useAuth';

const SCANNER_ID = 'donation-qr-reader-region';

export function CollectionVerification() {
  const { user } = useAuth();
  const [manual, setManual] = useState('');
  const [courier, setCourier] = useState('');
  const [signature, setSignature] = useState('');
  const [seal, setSeal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string; manifest?: string[] } | null>(null);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);

  const stop = async () => {
    if (scannerRef.current && scanning) {
      try { await scannerRef.current.stop(); } catch { /* stopped */ }
      setScanning(false);
    }
  };
  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setCamError('');
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      const devices = await Html5Qrcode.getCameras();
      if (devices.length === 0) { setCamError('No camera found. Use manual entry below.'); return; }
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text) => {
          if (busyRef.current) return;
          busyRef.current = true;
          try { await scanner.stop(); setScanning(false); setManual(text); } finally { busyRef.current = false; }
        }, () => {});
      setScanning(true);
    } catch (err: unknown) {
      setCamError(err instanceof Error && err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access or use manual entry below.'
        : 'Camera unavailable. Use manual entry below.');
    }
  };

  const verify = async () => {
    if (!user) return;
    if (!manual.trim()) { setAlert({ open: true, title: 'QR required', message: 'Scan or paste the collection pass.', type: 'error' }); return; }
    setBusy(true);
    setResult(null);
    try {
      const r = await verifyCollectionQR({
        qrPayload: manual.trim(), sealVerified: seal,
        courierName: courier, signature, verifierUid: user.uid || user.id,
      });
      setResult({ ok: r.valid, message: r.message, manifest: r.manifest });
      if (r.valid) setAlert({ open: true, title: 'Dispatch complete', message: r.message, type: 'success' });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Verification failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Collection Verification</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div id={SCANNER_ID} className="w-full max-w-sm mx-auto" />
        {camError && <p className="text-xs text-amber-600 text-center">{camError}</p>}
        <div className="flex gap-2 justify-center">
          {!scanning
            ? <Button variant="outline" size="sm" onClick={start}>Start camera</Button>
            : <Button variant="outline" size="sm" onClick={stop}>Stop camera</Button>}
        </div>
        <div><Label>Collection pass (manual entry)</Label><Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder='Paste {"type":"DONATION_COLLECTION",…}' /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Courier name *</Label><Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier full name" /></div>
          <div><Label>Courier acceptance signature *</Label><Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Type full name as signature" /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={seal} onChange={(e) => setSeal(e.target.checked)} className="h-4 w-4" />
          Physical seal / packaging integrity confirmed
        </label>
        <Button onClick={verify} disabled={busy} className="bg-[#1e3a5f]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Verify & complete dispatch
        </Button>
        {result && (
          <div className={`border rounded-lg p-3 text-sm ${result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <Badge className={result.ok ? 'bg-emerald-600' : 'bg-red-600'}>{result.ok ? 'COLLECTED' : 'FAILED'}</Badge>
            <p className="mt-2">{result.message}</p>
            {result.manifest?.map((m, i) => <p key={i} className="text-xs text-slate-600">• {m}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
