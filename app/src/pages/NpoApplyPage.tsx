// Public NPO application page. Reachable without an account at /npo-apply.
//
// Why an anonymous session rather than an open, unauthenticated write: the
// Firestore create rule requires request.auth != null so the submission is
// attributable to a uid and abuse is traceable to a session. Signing in
// anonymously needs no user interaction and creates no account, and it is
// already the mechanism this app uses for guest browsing.
//
// This page writes to `npo_applications`, never to `npo_partners`. An admin
// reviews it in the NPO Verification Queue and promotes it. Nothing here can
// set a verification status, so a public submit can never self-approve.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { submitPublicNpoApplication, validatePublicApplication, NPO_TRANSPORT_OPTIONS, MAX_UPLOAD_COUNT, MAX_UPLOAD_BYTES, ACCEPTED_UPLOAD_TYPES } from '@/services/increment2-services';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';

import {
  ArrowLeft, Building2, CheckCircle2, HandHeart, Loader2, Leaf, Paperclip,
  ShieldCheck, Truck, X,
} from 'lucide-react';

const EMPTY = {
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

const STEPS = [
  {
    icon: Building2,
    title: 'Submit your application',
    body: 'Tell us about your organisation and the communities you serve. No account needed.',
  },
  {
    icon: ShieldCheck,
    title: 'We verify it',
    body: 'An administrator reviews your registration details and supporting documents.',
  },
  {
    icon: HandHeart,
    title: 'Join the rescue network',
    body: 'Once approved you receive portal credentials and can claim surplus food from the resort.',
  },
];

export function NpoApplyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY, v: string | boolean) => {
    setForm((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  // Validates against the same limits the Storage rule enforces, so an
  // oversized or unsupported file is refused before any bytes are sent. The
  // rules remain authoritative; this only saves a wasted upload.
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list);

    const badType = incoming.filter(
      (f) => !(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(f.type),
    );
    if (badType.length) {
      setFileWarning(
        `${badType.length === 1 ? badType[0].name : `${badType.length} files`} ${
          badType.length === 1 ? 'is' : 'are'
        } not a supported type. Use PDF, JPEG, PNG or WebP.`,
      );
      return;
    }

    const tooBig = incoming.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) {
      setFileWarning(
        `${tooBig.length === 1 ? tooBig[0].name : `${tooBig.length} files`} exceed${
          tooBig.length === 1 ? 's' : ''
        } ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }

    setFiles((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length > MAX_UPLOAD_COUNT) {
        setFileWarning(`You can attach at most ${MAX_UPLOAD_COUNT} documents.`);
        return prev;
      }
      setFileWarning(null);
      return merged;
    });
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setFileWarning(null);
  };

  const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
      : `${Math.max(1, Math.round(bytes / 1024))}KB`;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const serviceAreas = form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean);
    const beneficiaryCapacity = Number(form.beneficiaryCapacity);

    const missing = validatePublicApplication({
      organisationName: form.organisationName,
      registrationNumber: form.registrationNumber,
      contactName: form.contactName,
      email: form.email,
      serviceAreas,
      beneficiaryCapacity,
      transportType: form.transportType,
    });
    if (missing.length) {
      setError(`Still needed: ${missing.join(', ')}.`);
      return;
    }

    setBusy(true);
    try {
      // The create rule requires an authenticated session. Anonymous sign-in is
      // silent and creates no account; if a session already exists (the visitor
      // came from a logged-in page) it is reused as-is.
      const createdSession = !auth.currentUser;
      if (createdSession) await signInAnonymously(auth);

      const { id, uploaded, failed } = await submitPublicNpoApplication({
        organisationName: form.organisationName,
        registrationNumber: form.registrationNumber,
        pboNumber: form.pboNumber || undefined,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        serviceAreas,
        beneficiaryCapacity,
        transportType: form.transportType,
        refrigerationAvailable: form.refrigerationAvailable,
        documents: files,
      });

      setReference(id);
      setForm(EMPTY);
      setFiles([]);
      // The application is stored either way; say plainly when documents did
      // not make it, rather than implying a clean submit.
      setUploadNotice(
        failed > 0
          ? `Your application was received, but ${failed} of ${files.length} document${
              files.length === 1 ? '' : 's'
            } failed to upload${
              uploaded > 0 ? ` (${uploaded} attached)` : ''
            }. An administrator can still proceed on your registration details, or you can email the documents to us.`
          : uploaded > 0
            ? `${uploaded} document${uploaded === 1 ? '' : 's'} attached for review.`
            : null,
      );

      // Release the throwaway session. AuthContext resolves ANY signed-in user —
      // including an anonymous one — into a role-less visitor, and the app
      // shell renders nothing for those, so leaving it in place would send the
      // visitor to a blank page when they click "Back to Azure Horizon".
      // A real session (e.g. a staff member testing the form) is left alone.
      if (createdSession && auth.currentUser?.isAnonymous) {
        try { await signOut(auth); } catch { /* the session expires anyway */ }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not submit your application.';
      setError(
        /permission/i.test(message)
          ? 'The resort could not accept your submission right now. This is usually a connectivity or configuration issue rather than a problem with your details — please try again shortly.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  if (reference) {
    return (
      <div className="npo-light-page text-foreground min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-white/95 backdrop-blur-sm shadow-2xl border-0">
          <CardHeader>
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle className="text-[#1e3a5f]">Application received</CardTitle>
            </div>
            <CardDescription>
              Thank you. An administrator will review your details and contact you at the email you
              provided.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploadNotice && (
              <p
                className={`text-sm rounded-lg border p-3 ${
                  uploadNotice.includes('failed to upload')
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {uploadNotice}
              </p>
            )}
            <p className="text-sm text-slate-600">
              Keep this reference if you need to follow up:
            </p>
            <p className="rounded-md bg-slate-50 border border-slate-200 p-3 font-mono text-xs break-all">
              {reference}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => navigate('/')} className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white">
                Back to Azure Horizon
              </Button>
              <Button variant="outline" onClick={() => setReference(null)} className="text-[#1e3a5f]">
                Submit another application
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="npo-light-page text-foreground min-h-screen bg-slate-100 font-sans py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center">
          <Leaf className="h-9 w-9 text-[#c9a227] mx-auto mb-3" />
          <h1 className="text-3xl sm:text-4xl font-serif font-bold italic text-[#1e3a5f]">Become a Food Rescue Partner</h1>
          <p className="text-slate-700 mt-2 max-w-2xl mx-auto">
            Azure Horizon donates safe surplus food to registered non-profits. Apply to receive
            collections and help us waste nothing.
          </p>
        </header>

        <div className="grid sm:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <Card key={s.title} className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <s.icon className="h-7 w-7 text-[#c9a227] mb-3" />
                <p className="font-semibold text-sm text-[#1e3a5f]">{s.title}</p>
                <p className="text-xs text-slate-700 mt-1">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-white shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle className="text-[#1e3a5f] flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Organisation details
            </CardTitle>
            <CardDescription>
              Fields marked <span className="text-red-500">*</span> are required. Your submission is
              reviewed by an administrator before you receive portal access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-8">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <section className="space-y-4">
                <p className="text-sm font-semibold text-[#1e3a5f]">Organisation</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="org">Organisation name *</Label>
                    <Input id="org" value={form.organisationName} onChange={(e) => set('organisationName', e.target.value)} placeholder="e.g. Ubuntu Community Trust" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg">Registration number *</Label>
                    <Input id="reg" value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} placeholder="e.g. NPO-2024-1183" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pbo">PBO number (optional)</Label>
                    <Input id="pbo" value={form.pboNumber} onChange={(e) => set('pboNumber', e.target.value)} placeholder="e.g. PBO/2025/0912" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Beneficiary capacity *</Label>
                    <Input id="capacity" type="number" min={1} value={form.beneficiaryCapacity} onChange={(e) => set('beneficiaryCapacity', e.target.value)} placeholder="Approximate people served per collection" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="areas">Service areas * (comma-separated)</Label>
                  <Textarea
                    id="areas"
                    rows={2}
                    value={form.serviceAreas}
                    onChange={(e) => set('serviceAreas', e.target.value)}
                    placeholder="e.g. Soweto, Orange Farm, Diepkloof"
                  />
<p className="text-xs text-slate-700">
                    These determine which collections you are matched to, so be as specific as you can.
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <p className="text-sm font-semibold text-[#1e3a5f]">Primary contact</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact">Contact name *</Label>
                    <Input id="contact" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="e.g. Thandi Mokoena" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Contact email *</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="coordinator@organisation.org" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. +27 11 555 0134" />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <p className="text-sm font-semibold text-[#1e3a5f] flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Collection capability
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transport">Transport type *</Label>
                    <Select value={form.transportType} onValueChange={(v) => set('transportType', v)}>
                      <SelectTrigger id="transport"><SelectValue /></SelectTrigger>
                      {/* Portaled to <body>, so it escapes .npo-light-page — keep it light explicitly. */}
            <SelectContent className="bg-white text-slate-900">
                        {NPO_TRANSPORT_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label htmlFor="reefer" className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        id="reefer"
                        type="checkbox"
                        checked={form.refrigerationAvailable}
                        onChange={(e) => set('refrigerationAvailable', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Cold-chain / refrigeration available
                    </label>
                  </div>
                </div>
                {!form.refrigerationAvailable && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Perishable donations will be ranked lower for your organisation. This is not a
                    disqualification — chilled items still become available when stock allows.
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <Label htmlFor="documents">Supporting documents (optional)</Label>
                <p className="text-xs text-slate-700">
                  Registration certificate, bank confirmation letter or proof of address. Up to{' '}
                  {MAX_UPLOAD_COUNT} files, PDF/JPEG/PNG/WebP, {MAX_UPLOAD_BYTES / 1024 / 1024}MB
                  each. Only an administrator can open what you attach.
                </p>
                <Input
                  id="documents"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => addFiles(e.target.files)}
                  className="bg-white dark:bg-white text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 cursor-pointer"
                />
                {fileWarning && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {fileWarning}
                  </p>
                )}
                {files.length > 0 && (
                  <ul className="space-y-2">
                    {files.map((f) => (
                      <li
                        key={`${f.name}-${f.size}`}
                        className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {f.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-600">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(f.name)}
                          aria-label={`Remove ${f.name}`}
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button type="submit" disabled={busy} className="bg-[#c9a227] hover:bg-[#b8941f] text-white">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {busy ? 'Submitting…' : 'Submit application'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate('/')} className="text-[#1e3a5f] hover:bg-slate-100">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              </div>

              <p className="text-xs text-slate-700">
                Submitting this form creates no account. Your details are stored so an administrator
                can verify them, and you will be contacted at the email provided.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}