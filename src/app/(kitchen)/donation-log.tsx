// UC35 mobile — Log Surplus Donation. Layer 9: token-based guided form
// (What is it? / How much? / Safety / Photo & AI / Review). AI output is
// advisory only and never blocks manual entry. logDonationFromMobile payload
// unchanged (preparedAt/expiryAt ISO, safetyChecklist, photoUri).
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth } from '@/services/firebase-services';
import { logDonationFromMobile, listenDonationBatches, listenNpoPartners } from '@/services/increment2-services';
import { analyzeFoodImage, GeminiFoodResult, isGeminiConfigured, GEMINI_UNAVAILABLE_MESSAGE } from '@/services/gemini-food';
import type { DonationBatch, NpoPartner, SafetyChecklist } from '@/types/increment2';
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
  const [expiryAt, setExpiryAt] = useState(() => isoLocal(new Date(Date.now() + 24 * 3600000)));
  const [checks, setChecks] = useState<SafetyChecklist>({
    coreTemperatureVerified: false, packagingIntegrityVerified: false,
    allergenLabelsVerified: false, safePreparationWindowVerified: false,
  });
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [gemini, setGemini] = useState<GeminiFoodResult | null>(null);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiError, setGeminiError] = useState('');
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showPreparedPicker, setShowPreparedPicker] = useState(false);
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

  const applyGeminiResult = (res: GeminiFoodResult) => {
    setGemini(res);
    if (res.itemName) setItemName(res.itemName);
    if (res.category) setMealCategory(res.category);
    if (res.estimatedPortions) setPortions(String(res.estimatedPortions));
    if (res.estimatedWeightKg) setWeight(String(res.estimatedWeightKg));
    if (res.allergens?.length) setAllergens(res.allergens.join(', '));
    if (res.expiryHoursFromNow) {
      const exp = new Date(Date.now() + res.expiryHoursFromNow * 3600000);
      setExpiryAt(isoLocal(exp));
    }
  };

  const runGeminiAnalysis = async (uri: string, base64?: string | null) => {
    if (!uri || geminiBusy) return;
    setGemini(null);
    setGeminiError('');
    if (!isGeminiConfigured()) { setGeminiError(GEMINI_UNAVAILABLE_MESSAGE); return; }
    setGeminiBusy(true);
    try {
      const res = await analyzeFoodImage(uri, base64 ? { base64 } : undefined);
      if (res) applyGeminiResult(res);
      else setGeminiError(GEMINI_UNAVAILABLE_MESSAGE);
    } catch (e: any) {
      setGeminiError(e?.message || GEMINI_UNAVAILABLE_MESSAGE);
    } finally { setGeminiBusy(false); }
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
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64 || null);
      setGemini(null);
      setGeminiError(isGeminiConfigured() ? '' : GEMINI_UNAVAILABLE_MESSAGE);
      if (isGeminiConfigured()) await runGeminiAnalysis(asset.uri, asset.base64 || null);
    }
  };

  const submit = async () => {
    if (!itemName.trim()) { showAlert({ title: 'Incomplete', message: 'Food item name is required.', type: 'error' }); return; }
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
      setGemini(null); setGeminiError('');
      setChecks({ coreTemperatureVerified: false, packagingIntegrityVerified: false, allergenLabelsVerified: false, safePreparationWindowVerified: false });
      setConfirming(false);
    } catch (e: any) {
      showAlert({ title: 'Submission failed', message: e?.message || 'Could not log donation.', type: 'error' });
    } finally { setBusy(false); }
  };

  const validateForm = (): string => {
    if (!itemName.trim()) return 'Food item name is required.';
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
            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(16,24,40,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill }}>
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
        <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="alert-circle-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
          <AppText variant="caption" color={theme.colors.warningStrong} style={{ flex: 1 }}>{geminiError}</AppText>
          <TouchableOpacity onPress={() => runGeminiAnalysis(photoUri, photoBase64)} accessibilityRole="button">
            <AppText variant="label" color={theme.colors.warningStrong} weight="700">Retry</AppText>
          </TouchableOpacity>
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
          <AppText variant="caption" tone="secondary">Allergens: {(gemini.allergens || []).join(', ') || 'none'}</AppText>
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
        <Field label="Food item *" value={itemName} onChangeText={setItemName} placeholder="e.g. Cooked chicken curry" />
        <Field label="Meal category *" value={mealCategory} onChangeText={setMealCategory} placeholder="Cooked meals" />
      </View>

      {/* HOW MUCH? */}
      <SectionHeader title="How much?" />
      <View style={{ gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          <View style={{ flex: 1 }}><Field label="Portions *" value={portions} onChangeText={setPortions} keyboardType="numeric" placeholder="10" /></View>
          <View style={{ flex: 1 }}><Field label="Weight kg *" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="5" /></View>
        </View>
        <Field label="Allergens (comma-separated)" value={allergens} onChangeText={setAllergens} placeholder="e.g. dairy, nuts" />
      </View>

      {/* SAFETY */}
      <SectionHeader title="Safety & freshness" />
      <View style={{ flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.sm }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPreparedPicker(true)}>
          <Card padding="md" style={{ alignItems: 'center' }}>
            <AppText variant="micro" tone="muted">PREPARED</AppText>
            <AppText variant="bodyStrong">{preparedAt ? new Date(preparedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pick'}</AppText>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowExpiryPicker(true)}>
          <Card padding="md" style={{ alignItems: 'center' }}>
            <AppText variant="micro" tone="muted">USE BY</AppText>
            <AppText variant="bodyStrong">{expiryAt ? new Date(expiryAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pick'}</AppText>
          </Card>
        </TouchableOpacity>
      </View>
      {showPreparedPicker ? <DateTimePicker value={preparedAt ? new Date(preparedAt) : new Date()} mode="datetime" display="default" onChange={(_, d) => { setShowPreparedPicker(false); if (d) setPreparedAt(isoLocal(d)); }} /> : null}
      {showExpiryPicker ? <DateTimePicker value={expiryAt ? new Date(expiryAt) : new Date(Date.now() + 24 * 3600000)} mode="datetime" display="default" onChange={(_, d) => { setShowExpiryPicker(false); if (d) setExpiryAt(isoLocal(d)); }} /> : null}

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

      <DetailModal visible={inspected !== null} title={inspected ? `${inspected.batchId} — ${inspected.itemName}` : ''} onClose={() => setInspected(null)}>
        {inspected ? (
          <View>
            <StatusBadge status={inspected.status} />
            <SectionTitle>BATCH</SectionTitle>
            <KV label="Category" value={inspected.mealCategory} />
            <KV label="Portions" value={String(inspected.portionCount)} />
            <KV label="Weight" value={`${inspected.estimatedWeightKg} kg`} />
            <KV label="Allergens" value={(inspected.allergens || []).join(', ') || 'none'} />
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
      </DetailModal>

      <DetailModal visible={confirming} title="Review donation batch" onClose={() => setConfirming(false)}>
        <ConfirmBlock
          title="Log this batch as Safety Verified?"
          rows={[
            ['Item', `${itemName || '—'} (${mealCategory})`],
            ['Quantity', `${portions} portions · ${weight}kg`],
            ['Allergens', allergens.split(',').map((s) => s.trim()).filter(Boolean).join(', ') || 'none'],
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
