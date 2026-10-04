// Donation Logging Form (kitchen staff). 4-check + photo gate, DON- batch id.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, Camera, CheckCircle2 } from 'lucide-react';
import { logDonationBatch } from '@/services/increment2-services';
import { uploadImage } from '@/services/firebase-services';
import type { SafetyChecklist } from '@/types/increment2';

const CHECKS: { key: keyof SafetyChecklist; label: string }[] = [
  { key: 'coreTemperatureVerified', label: 'Core temperature within safe bounds' },
  { key: 'packagingIntegrityVerified', label: 'Packaging / seal integrity' },
  { key: 'allergenLabelsVerified', label: 'Allergen labelling' },
  { key: 'safePreparationWindowVerified', label: 'Safe preparation window' },
];

export function DonationLoggingForm({ onLogged }: { onLogged?: (batchId: string) => void }) {
  const [form, setForm] = useState({
    itemName: '', mealCategory: 'Cooked meals', portionCount: 10, estimatedWeightKg: 5,
    allergens: '', preparedAt: '', expiryAt: '',
  });
  const [checks, setChecks] = useState<SafetyChecklist>({
    coreTemperatureVerified: false, packagingIntegrityVerified: false,
    allergenLabelsVerified: false, safePreparationWindowVerified: false,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  const set = (k: keyof typeof form, v: string | number) => setForm((p) => ({ ...p, [k]: v }));
  const allChecked = CHECKS.every((c) => checks[c.key]);
  const canSubmit = allChecked && !!photoFile && form.itemName.trim() && form.preparedAt && form.expiryAt && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setAlert({ open: true, title: 'Incomplete', message: !allChecked ? 'All four food-safety checks must be verified.' : !photoFile ? 'Food-safety photo evidence is required.' : 'Complete all required food fields.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      // Reuse existing Storage pipeline (File → Storage path → download URL)
      const { url: photoUrl, error: uploadErr } = await uploadImage(
        photoFile as File,
        `donation-safety/${Date.now()}_${(photoFile as File).name}`
      );
      if (uploadErr || !photoUrl) throw new Error(uploadErr || 'Photo upload failed.');
      const { batchId } = await logDonationBatch({
        itemName: form.itemName, mealCategory: form.mealCategory,
        portionCount: Number(form.portionCount), estimatedWeightKg: Number(form.estimatedWeightKg),
        allergens: form.allergens.split(',').map((s) => s.trim()).filter(Boolean),
        preparedAt: new Date(form.preparedAt).toISOString(), expiryAt: new Date(form.expiryAt).toISOString(),
        safetyChecklist: checks, safetyPhotoUrl: photoUrl,
        photoMeta: { url: photoUrl, fileName: photoFile.name, mimeType: photoFile.type || 'image/jpeg', size: photoFile.size, uploadedAt: new Date().toISOString(), uploadedBy: 'web' },
      });
      setAlert({ open: true, title: 'Donation logged', message: `Batch ${batchId} is now Safety Verified — Unassigned.`, type: 'success' });
      onLogged?.(batchId);
      setForm({ itemName: '', mealCategory: 'Cooked meals', portionCount: 10, estimatedWeightKg: 5, allergens: '', preparedAt: '', expiryAt: '' });
      setChecks({ coreTemperatureVerified: false, packagingIntegrityVerified: false, allergenLabelsVerified: false, safePreparationWindowVerified: false });
      setPhotoFile(null);
    } catch (e) {
      setAlert({ open: true, title: 'Submission failed', message: e instanceof Error ? e.message : 'Could not log donation.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Log Surplus Donation</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Food item *</Label><Input value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Chicken curry + rice" /></div>
          <div><Label>Meal category *</Label><Input value={form.mealCategory} onChange={(e) => set('mealCategory', e.target.value)} /></div>
          <div><Label>Portions *</Label><Input type="number" min={1} value={form.portionCount} onChange={(e) => set('portionCount', Number(e.target.value))} /></div>
          <div><Label>Est. weight (kg) *</Label><Input type="number" min={0.1} step={0.1} value={form.estimatedWeightKg} onChange={(e) => set('estimatedWeightKg', Number(e.target.value))} /></div>
          <div><Label>Allergens (comma-separated)</Label><Input value={form.allergens} onChange={(e) => set('allergens', e.target.value)} placeholder="nuts, dairy" /></div>
          <div><Label>Safety photo *</Label><Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} /></div>
          <div><Label>Prepared at *</Label><Input type="datetime-local" value={form.preparedAt} onChange={(e) => set('preparedAt', e.target.value)} /></div>
          <div><Label>Expiry at *</Label><Input type="datetime-local" value={form.expiryAt} onChange={(e) => set('expiryAt', e.target.value)} /></div>
        </div>
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold">Safety checklist (all four required)</p>
          {CHECKS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={checks[c.key]} onChange={(e) => setChecks((p) => ({ ...p, [c.key]: e.target.checked }))} className="h-4 w-4" />
              {c.label}
            </label>
          ))}
        </div>
        <Button onClick={submit} disabled={!canSubmit} className="bg-[#1e3a5f]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {busy ? 'Submitting…' : 'Verify safety & log batch'}
        </Button>
        {!canSubmit && <p className="text-xs text-slate-500">Submission unlocks when all four checks pass, a photo is attached, and required fields are valid.</p>}
      </CardContent>
    </Card>
  );
}
