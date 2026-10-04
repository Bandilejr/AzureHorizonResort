// UC35 mobile — Log Surplus Donation. Layer 9: token-based guided form
// (What is it? / How much? / Safety / Photo & AI / Review). AI output is
// advisory only and never blocks manual entry. logDonationFromMobile payload
// unchanged (preparedAt/expiryAt ISO, safetyChecklist, photoUri).
import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Pressable, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth } from '@/services/firebase-services';
import { logDonationFromMobile, listenDonationBatches, listenNpoPartners } from '@/services/increment2-services';
import { analyzeFoodImage, GeminiFoodResult, isGeminiConfigured, GEMINI_UNAVAILABLE_MESSAGE } from '@/services/gemini-food';
import { geminiToDonationForm, mergeSuggestionIntoForm } from '@/utils/gemini-fill';
import type { DonationBatch, NpoPartner, SafetyChecklist } from '@/types/increment2';
import { parseLocalDateTime, isValidDate, localDateISO, localDateTimeISO, pickerDate, formatLocalDateTime, todayISO } from '@/utils/dates';
import { usePermissions } from '@/context/PermissionsContext';
import { useAppTheme } from '@/design/use-app-theme';
import { formatStatus } from '@/utils/status-labels';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card, Surface } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, KV, SectionTitle, StatusBadge, LiveErrorBanner, ConfirmBlock } from '@/components/detail-kit';
import { DetailScreen } from '@/components/ui/detail-screen';

const CHECKS: { key: keyof SafetyChecklist; label: string }[] = [
  { key: 'coreTemperatureVerified', label: 'Core temperature within safe bounds' },
  { key: 'packagingIntegrityVerified', label: 'Packaging / seal integrity' },
  { key: 'allergenLabelsVerified', label: 'Allergen labelling' },
  { key: 'safePreparationWindowVerified', label: 'Safe preparation window' },
];

const isoLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function DonationLogScreen() {
  const theme = useAppTheme();
  const { hasPermission } = usePermissions();
  const canLog = hasPermission('donation_log');

  const [itemName, setItemName] = useState('');
  const [mealCategory, setMealCategory] = useState('Cooked meals');
  const [portions, setPortions] = useState('10');
  const [weight, setWeight] = useState('5');
  const [allergens, setAllergens] = useState('');
  const [preparedAt, setPreparedAt] = useState(() => isoLocal(new Date()));
  // Use-by starts EMPTY — staff must set it (a printed label date, a quick
  // chip, or the picker). No now+24h default is ever pre-filled.
  const [expiryAt, setExpiryAt] = useState('');
  const [checks, setChecks] = useState<SafetyChecklist>({
    coreTemperatureVerified: false, packagingIntegrityVerified: false,
    allergenLabelsVerified: false, safePreparationWindowVerified: false,
  });
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [gemini, setGemini] = useState<GeminiFoodResult | null>(null);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiError, setGeminiError] = useState('');
  // Advisory AI use-by estimate (computed when the result arrives, never during
  // render). Shown as a hint only — never pre-filled into the form.
  const [aiEstimateAt, setAiEstimateAt] = useState<string | null>(null);
  // Fields the user has edited (AI must never overwrite these) and the fields
  // the current AI suggestion actually filled (for the "AI suggestion" tag).
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  // Monotonic request id: a late AI response is discarded after a retake or
  // after leaving the screen.
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  // Android has no combined datetime dialog: mode="datetime" silently opens a
  // date-only picker, and unmount cleanup then throws because the library maps
  // only 'date' and 'time'. Run date first, then chain into time.
  const [picker, setPicker] = useState<{ field: 'preparedAt' | 'expiryAt'; step: 'date' | 'time' } | null>(null);
  const [recent, setRecent] = useState<DonationBatch[]>([]);
  const [inspected, setInspected] = useState<DonationBatch | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [npos, setNpos] = useState<NpoPartner[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoaded(true); return; }
    setLoadError('');
    setLoaded(false);
    return listenDonationBatches((list) => {
      setRecent(list.filter((b) => b.createdBy === uid).slice(0, 5));
      setLoaded(true);
    }, undefined, (e) => { setLoadError(e.message); setLoaded(true); });
  }, [retryKey]);

  useEffect(() => listenNpoPartners(setNpos, undefined), []);

  // Discard any in-flight AI response when the screen unmounts.
  useEffect(() => () => { mounted.current = false; }, []);

  const markTouched = (key: string) =>
    setTouched((prev) => { const n = new Set(prev); n.add(key); return n; });

  // ---- PREPARED / USE-BY pickers (date, then time) ----
  const stampOf = (field: 'preparedAt' | 'expiryAt') => (field === 'preparedAt' ? preparedAt : expiryAt);
  const seedOf = (field: 'preparedAt' | 'expiryAt') =>
    (field === 'preparedAt' ? isoLocal(new Date()) : isoLocal(new Date(Date.now() + 24 * 3600000)));
  const writeStamp = (field: 'preparedAt' | 'expiryAt', stamp: string) => {
    if (field === 'expiryAt') { markTouched('expiryAt'); setExpiryAt(stamp); }
    else setPreparedAt(stamp);
  };

  const pickerValue = React.useMemo(() => {
    const field = picker?.field;
    const seed = parseLocalDateTime(field ? stampOf(field) : seedOf('expiryAt'));
    return pickerDate(seed, new Date(field === 'preparedAt' ? Date.now() : Date.now() + 24 * 3600000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.field, preparedAt, expiryAt]);

  const onPickerChange = (_: unknown, picked: Date | null | undefined) => {
    if (!picker) return;
    if (!picked) { setPicker(null); return; }
    const { field, step } = picker;
    const seed = parseLocalDateTime(stampOf(field));
    const base = isValidDate(seed) ? seed : new Date(Date.now() + 24 * 3600000);
    const next = new Date(base);
    if (step === 'date') {
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      writeStamp(field, localDateTimeISO(next));
      setPicker({ field, step: 'time' });
    } else {
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      writeStamp(field, localDateTimeISO(next));
      setPicker(null);
    }
  };

  const applyGeminiResult = (res: GeminiFoodResult) => {
    setGemini(res);
    setAiEstimateAt(res.expiryHoursFromNow != null && res.expiryHoursFromNow > 0
      ? isoLocal(new Date(Date.now() + res.expiryHoursFromNow * 3600000))
      : null);
    const suggestion = geminiToDonationForm(res);
    const current = { itemName, mealCategory, portions, weight, allergens, expiryAt };
    const { next, applied } = mergeSuggestionIntoForm(current, suggestion, touched);
    if (applied.includes('itemName')) setItemName(next.itemName);
    if (applied.includes('mealCategory')) setMealCategory(next.mealCategory);
    if (applied.includes('portions')) setPortions(next.portions);
    if (applied.includes('weight')) setWeight(next.weight);
    if (applied.includes('allergens')) setAllergens(next.allergens);
    if (applied.includes('expiryAt')) setExpiryAt(next.expiryAt);
    setAiFields(new Set(applied));
  };

  const runGeminiAnalysis = async (uri: string, base64?: string | null) => {
    if (!uri) return;
    const seq = ++requestSeq.current;
    setGemini(null);
    setGeminiError('');
    if (!isGeminiConfigured()) { setGeminiError(GEMINI_UNAVAILABLE_MESSAGE); return; }
    setGeminiBusy(true);
    try {
      const res = await analyzeFoodImage(uri, base64 ? { base64 } : undefined);
      if (seq !== requestSeq.current || !mounted.current) return; // late response discarded
      if (res) applyGeminiResult(res);
      else setGeminiError(GEMINI_UNAVAILABLE_MESSAGE);
    } catch (e: any) {
      if (seq !== requestSeq.current || !mounted.current) return;
      setGeminiError(e?.message || GEMINI_UNAVAILABLE_MESSAGE);
    } finally {
      if (seq === requestSeq.current && mounted.current) setGeminiBusy(false);
    }
  };

  const pickImage = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showAlert({
        title: 'Photo access needed',
        message: camera ? 'Camera access is unavailable. You can still add the photo from your gallery or enter details manually.' : 'Photo library access is unavailable. You can still enter details manually.',
        type: 'warning',
      });
      return;
    }
    const opts = { allowsEditing: true, quality: 0.5, base64: true } as const;
    const result = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, ...opts });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      requestSeq.current++; // invalidate any in-flight analysis from the previous photo
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64 || null);
      setGemini(null);
      setAiEstimateAt(null);
      setAiFields(new Set());
      setGeminiError(isGeminiConfigured() ? '' : GEMINI_UNAVAILABLE_MESSAGE);
      if (isGeminiConfigured()) await runGeminiAnalysis(asset.uri, asset.base64 || null);
    }
  };

  const submit = async () => {
    if (!itemName.trim()) { showAlert({ title: 'Incomplete', message: 'Food item name is required.', type: 'error' }); return; }
    if (!expiryAt) { showAlert({ title: 'Incomplete', message: 'Set a use-by time for the batch.', type: 'error' }); return; }
    const missing = CHECKS.filter((c) => !checks[c.key]);
    if (missing.length > 0) { showAlert({ title: 'Safety checks incomplete', message: `All four food-safety checks must be verified. Missing: ${missing.map((m) => m.label).join('; ')}.`, type: 'error' }); return; }
    if (!photoUri) { showAlert({ title: 'Photo required', message: 'Food-safety photo evidence is required.', type: 'error' }); return; }
    setBusy(true);
    try {
      const { batchId } = await logDonationFromMobile({
        itemName, mealCategory,
        portionCount: Number(portions), estimatedWeightKg: Number(weight),
        allergens: allergens.split(',').map((s) => s.trim()).filter(Boolean),
        preparedAt: new Date(preparedAt).toISOString(), expiryAt: new Date(expiryAt).toISOString(),
        safetyChecklist: checks, photoUri,
      });
      showAlert({ title: 'Donation logged', message: `Batch ${batchId} is now Safety Verified — Unassigned. The kitchen allocation board updates automatically.`, type: 'success' });
      setItemName(''); setAllergens(''); setPortions('10'); setWeight('5'); setPhotoUri(null); setPhotoBase64(null);
      setGemini(null); setAiEstimateAt(null); setGeminiError('');
      setExpiryAt('');
      setChecks({ coreTemperatureVerified: false, packagingIntegrityVerified: false, allergenLabelsVerified: false, safePreparationWindowVerified: false });
      setConfirming(false);
    } catch (e: any) {
      showAlert({ title: 'Submission failed', message: e?.message || 'Could not log donation.', type: 'error' });
    } finally { setBusy(false); }
  };

  const validateForm = (): string => {
    if (!itemName.trim()) return 'Food item name is required.';
    if (!expiryAt) return 'Set a use-by time for the batch.';
    const missing = CHECKS.filter((c) => !checks[c.key]);
    if (missing.length > 0) return `All four food-safety checks must be verified. Missing: ${missing.map((m) => m.label).join('; ')}.`;
    if (!photoUri) return 'Food-safety photo evidence is required.';
    return '';
  };

  const reviewAndSubmit = () => {
    const err = validateForm();
    if (err) { showAlert({ title: 'Incomplete', message: err, type: 'error' }); return; }
    setConfirming(true);
  };

  if (!canLog) {
    return (
      <Screen>
        <PageHeader title="Log donation" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Your role cannot log donations. Kitchen staff or managers only." />
      </Screen>
    );
  }

  const lowConfidence = gemini != null && (gemini.confidence == null || gemini.confidence < 0.6);
  // Advisory AI estimate only — shown as a hint, never pre-filled into the form.
  const aiEstimate = aiEstimateAt ? new Date(aiEstimateAt) : null;

  return (
    <Screen scroll>
      <PageHeader title="Log surplus food" subtitle="Capture → analyze → safety → review" showBack fallback="/(kitchen)/dashboard" />

      {/* PHOTO & AI */}
      <TouchableOpacity onPress={() => pickImage(true)} activeOpacity={0.85}>
        <View style={{ height: 220, borderRadius: theme.radius.lg, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border, borderStyle: 'dashed', marginBottom: theme.space.sm }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.sm, padding: theme.space.lg }}>
              <Ionicons name="camera" size={48} color={theme.colors.primary} />
              <AppText variant="subtitle">Take a photo</AppText>
              <AppText variant="caption" tone="secondary" align="center">AI can suggest food type, quantity, allergens & use-by — advisory only.</AppText>
            </View>
          )}
          {photoUri ? (
            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: theme.colors.overlay, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill }}>
              <AppText variant="micro" color={theme.colors.textInverse} weight="600">Tap to retake</AppText>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.sm }}>
        <Button label="Camera" icon="camera-outline" variant="secondary" onPress={() => pickImage(true)} fullWidth={false} style={{ flex: 1 }} />
        <Button label="Gallery" icon="images-outline" variant="secondary" onPress={() => pickImage(false)} fullWidth={false} style={{ flex: 1 }} />
      </View>

      {geminiBusy ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="sparkles" size={theme.iconSize.md} color={theme.colors.primary} />
          <AppText variant="body" tone="secondary">Analyzing food image…</AppText>
        </Card>
      ) : null}

      {!geminiBusy && geminiError && photoUri ? (
        <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft, gap: theme.space.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Ionicons name="alert-circle-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
            <AppText variant="bodyStrong" color={theme.colors.warningStrong} style={{ flex: 1 }}>AI assistance unavailable. Continue manually.</AppText>
            <TouchableOpacity onPress={() => runGeminiAnalysis(photoUri, photoBase64)} accessibilityRole="button">
              <AppText variant="label" color={theme.colors.warningStrong} weight="700">Retry</AppText>
            </TouchableOpacity>
          </View>
          {geminiError && geminiError !== 'AI assistance unavailable. Continue manually.' ? (
            <AppText variant="caption" color={theme.colors.warningStrong}>{geminiError}</AppText>
          ) : null}
        </Card>
      ) : null}

      {gemini && !geminiBusy ? (
        <Card style={{ borderColor: lowConfidence ? theme.colors.warning : theme.colors.primary, borderWidth: 1.5, gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="micro" tone="muted" weight="700">AI SUGGESTION — ADVISORY ONLY</AppText>
            <StatusPill
              status={lowConfidence ? 'pending' : 'approved'}
              size="sm"
              label={gemini.confidence == null ? 'Unverified' : `${Math.round(gemini.confidence * 100)}%${lowConfidence ? ' • Low' : ''}`}
            />
          </View>
          {gemini.notes ? <AppText variant="caption" tone="secondary" style={{ fontStyle: 'italic' }}>{gemini.notes}</AppText> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            <Surface tone="variant" radius="sm" padding="sm" style={{ width: '48%' }}>
              <AppText variant="micro" tone="muted">FOOD</AppText>
              <AppText variant="bodyStrong">{gemini.itemName || '—'}</AppText>
            </Surface>
            <Surface tone="variant" radius="sm" padding="sm" style={{ width: '48%' }}>
              <AppText variant="micro" tone="muted">CATEGORY</AppText>
              <AppText variant="bodyStrong">{gemini.category}</AppText>
            </Surface>
            <Surface tone="variant" radius="sm" padding="sm" style={{ width: '48%' }}>
              <AppText variant="micro" tone="muted">PORTIONS</AppText>
              <AppText variant="bodyStrong">{gemini.estimatedPortions ?? '—'}</AppText>
            </Surface>
            <Surface tone="variant" radius="sm" padding="sm" style={{ width: '48%' }}>
              <AppText variant="micro" tone="muted">WEIGHT</AppText>
              <AppText variant="bodyStrong">{gemini.estimatedWeightKg ?? '—'} kg</AppText>
            </Surface>
          </View>
          <AppText variant="caption" tone="secondary">Possible allergens (AI), verify: {(gemini.allergens || []).join(', ') || 'None listed by AI, verify manually'}</AppText>
          {lowConfidence ? (
            <AppText variant="caption" color={theme.colors.warningStrong}>⚠ {gemini.confidence == null ? 'AI did not report confidence' : 'Low confidence'} — verify category, portions, allergens & use-by</AppText>
          ) : null}
          <AppText variant="micro" tone="muted">Auto-filled below — review & edit.</AppText>
        </Card>
      ) : null}

      {!gemini && !geminiBusy && !photoUri ? (
        <Card style={{ backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.infoSoft, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="bulb-outline" size={theme.iconSize.md} color={theme.colors.infoStrong} />
          <AppText variant="caption" color={theme.colors.infoStrong} style={{ flex: 1 }}>Take a photo first — AI will suggest details. Or fill manually below.</AppText>
        </Card>
      ) : null}

      {/* WHAT IS IT? */}
      <SectionHeader title="What is it?" />
      <View style={{ gap: theme.space.sm }}>
        <Field label="Food item *" value={itemName} onChangeText={(v) => { markTouched('itemName'); setItemName(v); }} placeholder="e.g. Cooked chicken curry" hint={aiFields.has('itemName') ? <AiTag /> : undefined} />
        <Field label="Meal category *" value={mealCategory} onChangeText={(v) => { markTouched('mealCategory'); setMealCategory(v); }} placeholder="Cooked meals" hint={aiFields.has('mealCategory') ? <AiTag /> : undefined} />
      </View>

      {/* HOW MUCH? */}
      <SectionHeader title="How much?" />
      <View style={{ gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          <View style={{ flex: 1 }}><Field label="Portions *" value={portions} onChangeText={(v) => { markTouched('portions'); setPortions(v); }} keyboardType="numeric" placeholder="10" hint={aiFields.has('portions') ? <AiTag /> : undefined} /></View>
          <View style={{ flex: 1 }}><Field label="Weight kg *" value={weight} onChangeText={(v) => { markTouched('weight'); setWeight(v); }} keyboardType="numeric" placeholder="5" hint={aiFields.has('weight') ? <AiTag /> : undefined} /></View>
        </View>
        <Field label="Allergens (comma-separated)" value={allergens} onChangeText={(v) => { markTouched('allergens'); setAllergens(v); }} placeholder="e.g. dairy, nuts" hint={aiFields.has('allergens') ? <AiTag /> : undefined} />
      </View>

      {/* SAFETY */}
      <SectionHeader title="Safety & freshness" />
      <View style={{ flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.sm }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker({ field: 'preparedAt', step: 'date' })}>
          <Card padding="md" style={{ alignItems: 'center' }}>
            <AppText variant="micro" tone="muted">PREPARED</AppText>
            <AppText variant="bodyStrong">{preparedAt ? formatLocalDateTime(preparedAt) : 'Pick'}</AppText>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker({ field: 'expiryAt', step: 'date' })}>
          <Card padding="md" style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="micro" tone="muted">USE BY</AppText>
              {aiFields.has('expiryAt') ? <AiTag /> : null}
            </View>
            <AppText variant="bodyStrong">{expiryAt ? formatLocalDateTime(expiryAt) : 'Pick'}</AppText>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Use-by quick set — staff must tap a chip or pick a time. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginBottom: theme.space.xs }}>
        {([['+4h', 4], ['+12h', 12], ['+24h', 24]] as const).map(([label, h]) => (
          <Chip key={label} label={label} onPress={() => { markTouched('expiryAt'); setExpiryAt(isoLocal(new Date(Date.now() + h * 3600000))); }} />
        ))}
        <Chip label="Custom" icon="calendar-outline" onPress={() => setPicker({ field: 'expiryAt', step: 'date' })} />
      </View>
      {!expiryAt && aiEstimate ? (
        <AppText variant="caption" color={theme.colors.warningStrong} style={{ marginBottom: theme.space.sm }}>
          Estimated, verify: {aiEstimate.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — set the real use-by above.
        </AppText>
      ) : null}
      {!expiryAt ? (
        <AppText variant="caption" tone="error" style={{ marginBottom: theme.space.sm }}>Use-by is required.</AppText>
      ) : null}
      {picker ? (
        <DateTimePicker
          key={`${picker.field}-${picker.step}`}
          value={pickerValue}
          mode={picker.step === 'date' ? 'date' : 'time'}
          display="default"
          {...(picker.step === 'time'
            ? { is24Hour: true }
            : { minimumDate: parseLocalDateTime(`${picker.field === 'expiryAt' && preparedAt ? localDateISO(new Date(preparedAt)) : todayISO()}T00:00`) })}
          onChange={onPickerChange}
        />
      ) : null}

      <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
        {CHECKS.map((c, i) => (
          <View key={c.key} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md, paddingVertical: theme.space.md }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
            <AppText variant="body" style={{ flex: 1 }}>{c.label}</AppText>
            <Switch value={checks[c.key]} onValueChange={(v) => setChecks((p) => ({ ...p, [c.key]: v }))} />
          </View>
        ))}
      </Card>
      <AppText variant="micro" tone="muted" style={{ marginTop: theme.space.xs }}>All four checks are required. Food-safety certification is your responsibility.</AppText>

      <Button label="Review safety & log batch" onPress={reviewAndSubmit} loading={busy} style={{ marginTop: theme.space.lg }} />

      {/* RECENT */}
      <SectionHeader title={`My recent batches (${recent.length})`} />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {!loaded ? (
        <ListSkeleton rows={2} />
      ) : loadError && recent.length === 0 ? (
        <ErrorState title="Couldn't load your batches" message="Recent batches are unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : recent.length === 0 ? (
        <AppText variant="body" tone="muted">Nothing logged yet.</AppText>
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {recent.map((b, i) => (
            <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={`${b.batchId} — ${b.itemName}`}
                subtitle={`${b.portionCount} portions · ${b.estimatedWeightKg}kg`}
                status={<StatusPill status={b.status} size="sm" />}
                onPress={() => setInspected(b)}
              />
            </View>
          ))}
        </Card>
      )}

      <DetailScreen
        visible={inspected !== null}
        title={inspected ? inspected.itemName : 'Batch'}
        subtitle={inspected?.batchId}
        status={inspected ? <StatusPill status={inspected.status} /> : undefined}
        onClose={() => setInspected(null)}
      >
        {inspected ? (
          <View>
            <StatusBadge status={inspected.status} />
            <SectionTitle>BATCH</SectionTitle>
            <KV label="Category" value={inspected.mealCategory} />
            <KV label="Portions" value={String(inspected.portionCount)} />
            <KV label="Weight" value={`${inspected.estimatedWeightKg} kg`} />
            <KV label="Allergens" value={(inspected.allergens || []).join(', ') || 'None recorded'} />
            <KV label="Prepared" value={inspected.preparedAt ? new Date(inspected.preparedAt).toLocaleString() : '—'} />
            <KV label="Use by" value={inspected.expiryAt ? new Date(inspected.expiryAt).toLocaleString() : '—'} />
            <SectionTitle>SAFETY</SectionTitle>
            <KV label="Temperature" value={inspected.safetyChecklist?.coreTemperatureVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Packaging" value={inspected.safetyChecklist?.packagingIntegrityVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Allergen labels" value={inspected.safetyChecklist?.allergenLabelsVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Prep window" value={inspected.safetyChecklist?.safePreparationWindowVerified ? 'Verified ✓' : 'NOT verified'} />
            {inspected.safetyPhotoUrl ? (
              <>
                <SectionTitle>PHOTO</SectionTitle>
                <Image source={{ uri: inspected.safetyPhotoUrl }} style={{ width: '100%', height: 180, borderRadius: theme.radius.sm, marginTop: 4 }} resizeMode="cover" />
              </>
            ) : null}
            <SectionTitle>LIFECYCLE</SectionTitle>
            <KV label="Status" value={formatStatus(inspected.status)} />
            <KV label="NPO" value={npos.find((n) => n.npoId === inspected.allocatedNpoId)?.organisationName || 'Not yet allocated'} />
            <KV label="Facility" value={inspected.receivingFacility || '—'} />
            <KV label="Pickup" value={inspected.pickupWindowStart ? `${new Date(inspected.pickupWindowStart).toLocaleString()} · ${inspected.loadingBay || ''}` : '—'} />
          </View>
        ) : null}
      </DetailScreen>

      <DetailModal visible={confirming} title="Review donation batch" onClose={() => setConfirming(false)}>
        <ConfirmBlock
          title="Log this batch as Safety Verified?"
          rows={[
            ['Item', `${itemName || '—'} (${mealCategory})`],
            ['Quantity', `${portions} portions · ${weight}kg`],
            ['Allergens', allergens.split(',').map((s) => s.trim()).filter(Boolean).join(', ') || 'None recorded'],
            ['Prepared', preparedAt ? new Date(preparedAt).toLocaleString() : '—'],
            ['Use by', expiryAt ? new Date(expiryAt).toLocaleString() : '—'],
            ['Photo evidence', photoUri ? 'attached' : 'missing'],
            ['Effect', 'Batch enters the allocation board for NPO matching'],
          ]}
          warning="Food-safety certification is your responsibility — the AI suggestion is advisory only."
          confirmLabel="Confirm & log batch" onConfirm={submit} onCancel={() => setConfirming(false)} busy={busy}
        />
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}

// Small tag shown next to fields that were pre-filled by the AI (advisory only).
function AiTag() {
  return <AppText variant="micro" tone="primary" weight="600">AI suggestion</AppText>;
}

// Compact quick-set chip (design tokens only; no hardcoded colors).
function Chip({ label, onPress, icon }: { label: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.primaryBorder, backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={theme.iconSize.xs} color={theme.colors.primary} /> : null}
      <AppText variant="label" tone="primary" weight="600">{label}</AppText>
    </Pressable>
  );
}
