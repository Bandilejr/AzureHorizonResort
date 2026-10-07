// NPO Application Form (admin intake).
//
// Admin-side counterpart to the public /npo-apply page. Used by the
// "Record walk-in" button in NpoVerificationQueue for an organisation that
// arrives in person, so an administrator types the details instead of waiting
// on a web submission.
//
// Why this writes to npo_partners directly, unlike the public page: the
// admin is already authenticated and hold the staff role the npo_partners
// create rule requires, and there is no verification queue entry to create.
// The record still lands at 'pending' — createNpoApplication pins that — so a
// walk-in cannot skip review either. Use reviewNpoApplication /
// promoteNpoApplication to advance it.
//
// Mirrors the createNpoApplication input exactly.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertModal } from '@/components/ui/AlertModal';
import { Building2, CheckCircle2, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { createNpoApplication, NPO_TRANSPORT_OPTIONS } from '@/services/increment2-services';
import { uploadImage } from '@/services/firebase-services';
import type { FileMeta } from '@/types/increment2';

const EMPTY_FORM = {
  organisationName: '',
  registrationNumber: '',
  pboNumber: '',
  contactName: '',
  email: '',
  phone: '',
  serviceAreas: '',
  beneficiaryCapacity: '',
  transportType: NPO_TRANSPORT_OPTIONS[0] as string,
  refrigerationAvailable: false,
};

export function NpoApplicationForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [documents, setDocuments] = useState<FileMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alert, setAlert] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, title: '', message: '', type: 'info' });

  const set = (k: keyof typeof EMPTY_FORM, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const attachDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: FileMeta[] = [];
      for (const file of Array.from(files)) {
        const { url, error } = await uploadImage(file, `npo-compliance/${Date.now()}_${file.name}`);
        if (error || !url) throw new Error(error || `Upload failed for ${file.name}.`);
        uploaded.push({
          url,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'npo-application',
        });
      }
      setDocuments((p) => [...p, ...uploaded]);
    } catch (e) {
      setAlert({ open: true, title: 'Upload failed', message: e instanceof Error ? e.message : 'Could not attach documents.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // createNpoApplication enforces name/registration/contact/email; the rest is
  // required here so the admin gets an inline message instead of a thrown Error.
  const validate = (): string | null => {
    if (!form.organisationName.trim()) return 'Organisation name is required.';
    if (!form.registrationNumber.trim()) return 'Registration number is required.';
    if (!form.contactName.trim()) return 'Contact name is required.';
    if (!form.email.trim()) return 'Contact email is required.';
    if (!form.serviceAreas.trim()) return 'At least one service area is required.';
    const capacity = Number(form.beneficiaryCapacity);
    if (!Number.isFinite(capacity) || capacity <= 0) return 'Beneficiary capacity must be a positive number.';
    return null;
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setDocuments([]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setAlert({ open: true, title: 'Check the form', message: problem, type: 'warning' });
      return;
    }

    setBusy(true);
    try {
      await createNpoApplication({
        organisationName: form.organisationName,
        registrationNumber: form.registrationNumber,
        pboNumber: form.pboNumber || undefined,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        serviceAreas: form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        beneficiaryCapacity: Number(form.beneficiaryCapacity),
        transportType: form.transportType,
        refrigerationAvailable: form.refrigerationAvailable,
        complianceDocuments: documents,
      });
      setAlert({
        open: true,
        title: 'Partner recorded',
        message: `${form.organisationName} was saved as pending. Advance it from the verification queue once documents check out.`,
        type: 'success',
      });
      reset();
    } catch (err) {
      setAlert({
        open: true,
        title: 'Could not save',
        message: err instanceof Error ? err.message : 'The partner could not be recorded.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-[#1e3a5f] flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Record a walk-in partner
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wo-org">Organisation name *</Label>
              <Input id="wo-org" value={form.organisationName} onChange={(e) => set('organisationName', e.target.value)} placeholder="e.g. Ubuntu Community Trust" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-reg">Registration number *</Label>
              <Input id="wo-reg" value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} placeholder="e.g. NPO-2024-1183" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-pbo">PBO number (optional)</Label>
              <Input id="wo-pbo" value={form.pboNumber} onChange={(e) => set('pboNumber', e.target.value)} placeholder="e.g. PBO/2025/0912" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-capacity">Beneficiary capacity *</Label>
              <Input id="wo-capacity" type="number" min={1} value={form.beneficiaryCapacity} onChange={(e) => set('beneficiaryCapacity', e.target.value)} placeholder="Approximate people served per collection" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wo-areas">Service areas * (comma-separated)</Label>
            <Input id="wo-areas" value={form.serviceAreas} onChange={(e) => set('serviceAreas', e.target.value)} placeholder="e.g. Soweto, Roodepoort" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wo-contact">Contact name *</Label>
              <Input id="wo-contact" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="e.g. Thandi Mokoena" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-email">Contact email *</Label>
              <Input id="wo-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="coordinator@organisation.org" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-phone">Phone</Label>
              <Input id="wo-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. +27 11 555 0134" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-transport">Transport type *</Label>
              <Select value={form.transportType} onValueChange={(v) => set('transportType', v)}>
                <SelectTrigger id="wo-transport"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NPO_TRANSPORT_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center pb-2">
            <label htmlFor="wo-reefer" className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                id="wo-reefer"
                checked={form.refrigerationAvailable}
                onCheckedChange={(v) => set('refrigerationAvailable', v === true)}
              />
              Cold-chain / refrigeration available
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wo-docs">Compliance documents</Label>
            <Input
              id="wo-docs"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              disabled={uploading}
              onChange={(e) => attachDocuments(e.target.files)}
              className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 cursor-pointer"
            />
            {uploading && (
              <p className="flex items-center gap-2 text-xs text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </p>
            )}
            {documents.length > 0 && (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li
                    key={d.url}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{d.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setDocuments((p) => p.filter((x) => x.url !== d.url))}
                      aria-label={`Remove ${d.fileName}`}
                      className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" disabled={busy || uploading} className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy ? 'Saving…' : 'Record partner'}
            </Button>
            <Button type="button" variant="outline" disabled={busy || uploading} onClick={reset} className="text-[#1e3a5f]">
              <FileText className="h-4 w-4" /> Clear form
            </Button>
          </div>
        </form>
      </CardContent>

      <AlertModal
        open={alert.open}
        onClose={() => setAlert((p) => ({ ...p, open: false }))}
        title={alert.title}
        message={alert.message}
        type={alert.type}
      />
    </Card>
  );
}
