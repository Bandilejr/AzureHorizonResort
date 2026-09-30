// UC35 mobile — Log Surplus Donation. Uses logDonationFromMobile (same
// donation_batches model, 4-check + photo gate enforced in the service).
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth } from '@/services/firebase-services';
import { logDonationFromMobile, listenDonationBatches, listenNpoPartners } from '@/services/increment2-services';
import { analyzeFoodImage, GeminiFoodResult, isGeminiConfigured, GEMINI_UNAVAILABLE_MESSAGE } from '@/services/gemini-food';
import type { DonationBatch, NpoPartner, SafetyChecklist } from '@/types/increment2';
import { usePermissions } from '@/context/PermissionsContext';
import { getTheme } from '@/constants/theme';
import { formatStatus } from '@/utils/status-labels';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, KV, SectionTitle, StatusBadge, LiveErrorBanner, ConfirmBlock, ModalButton } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

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
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
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
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  // Realtime: my submissions update live (e.g. web allocation moves them on).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoadError('');
    return listenDonationBatches((list) => {
      setRecent(list.filter((b) => b.createdBy === uid).slice(0, 5));
    }, undefined, (e) => setLoadError(e.message));
  }, [retryKey]);

  // §3.A: resolve allocated NPO ids to organisation names for the detail view.
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
    if (!isGeminiConfigured()) {
      setGeminiError(GEMINI_UNAVAILABLE_MESSAGE);
      return;
    }
    setGeminiBusy(true);
    try {
      const res = await analyzeFoodImage(uri, base64 ? { base64 } : undefined);
      if (res) {
        applyGeminiResult(res);
      } else {
        setGeminiError(GEMINI_UNAVAILABLE_MESSAGE);
      }
    } catch (e: any) {
      setGeminiError(e?.message || GEMINI_UNAVAILABLE_MESSAGE);
    } finally {
      setGeminiBusy(false);
    }
  };

  const pickImage = async (camera: boolean) => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showAlert({ title: 'Permission Denied', message: 'Photo permission is required for food-safety evidence.', type: 'warning' });
      return;
    }
    const opts = { allowsEditing: true, quality: 0.5, base64: true } as const;
    const result = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, ...opts });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const uri = asset.uri;
      setPhotoUri(uri);
      setPhotoBase64(asset.base64 || null);
      setGemini(null);
      setGeminiError(isGeminiConfigured() ? '' : GEMINI_UNAVAILABLE_MESSAGE);
      if (isGeminiConfigured()) {
        await runGeminiAnalysis(uri, asset.base64 || null);
      }
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
    } finally {
      setBusy(false);
    }
  };

  // Phase 2 (§2.B/§2.E): consequential submission is review-first — validate,
  // then show the confirmation block before executing.
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
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
          <Text style={styles.title}>Log Donation</Text>
        </View>
        <Text style={styles.muted}>Your role cannot log donations. Kitchen staff or managers only.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Log Surplus Food</Text>
      </View>

      {/* CAMERA-FIRST HERO */}
      <TouchableOpacity onPress={() => pickImage(true)} activeOpacity={0.8} style={styles.hero}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="camera" size={48} color={theme.colors.primary} />
            <Text style={styles.heroTitle}>Tap to take photo</Text>
            <Text style={styles.heroSub}>{isGeminiConfigured() ? 'AI can identify food type, quantity, allergens & use-by' : 'Food-safety photo evidence is required'}</Text>
          </View>
        )}
        {photoUri && <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Tap to retake</Text></View>}
      </TouchableOpacity>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.small, styles.secondary]} onPress={() => pickImage(true)}><Ionicons name="camera-outline" size={16} color={theme.colors.primary} /><Text style={styles.secondaryText}> Camera</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.small, styles.secondary]} onPress={() => pickImage(false)}><Ionicons name="images-outline" size={16} color={theme.colors.primary} /><Text style={styles.secondaryText}> Gallery</Text></TouchableOpacity>
      </View>
      {photoUri && !geminiBusy && isGeminiConfigured() && (
        <TouchableOpacity
          style={[styles.analyzeBtn, gemini && !geminiError ? styles.analyzeBtnDone : null]}
          onPress={() => runGeminiAnalysis(photoUri, photoBase64)}
          disabled={geminiBusy}
          activeOpacity={0.8}
        >
          <Ionicons name={gemini && !geminiError ? 'checkmark-circle' : 'sparkles'} size={18} color={gemini && !geminiError ? '#166534' : '#fff'} />
          <Text style={[styles.analyzeBtnText, gemini && !geminiError ? { color: '#166534' } : null]}>
            {geminiBusy ? 'Analyzing…' : gemini && !geminiError ? 'Re-analyze with AI' : 'Analyze with AI'}
          </Text>
        </TouchableOpacity>
      )}
      {geminiBusy && (
        <View style={styles.analyzingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.muted}>Gemini analyzing image…</Text>
        </View>
      )}
      {!geminiBusy && geminiError && photoUri && (
        <View style={styles.aiErrorBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.aiErrorText}>{geminiError}</Text>
        </View>
      )}
      {gemini && !geminiBusy && (
        <View style={[styles.aiCard, { borderColor: gemini.confidence == null || gemini.confidence < 0.6 ? theme.colors.warning : theme.colors.primary }]}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={styles.aiTitle}>AI Suggestion</Text>
            <View style={[styles.confBadge, {backgroundColor: gemini.confidence == null || gemini.confidence < 0.6 ? '#fef3c7' : '#dcfce7'}]}>
              <Text style={[styles.confText, {color: gemini.confidence == null || gemini.confidence < 0.6 ? '#92400e' : '#16a34a'}]}>{gemini.confidence == null ? '—' : `${(gemini.confidence*100).toFixed(0)}%`}{gemini.confidence != null && gemini.confidence < 0.6 ? ' • Low' : gemini.confidence == null ? ' • Unverified' : ''}</Text>
            </View>
          </View>
          <Text style={styles.aiNote}>{gemini.notes}</Text>
          <View style={styles.aiGrid}>
            <View style={styles.aiItem}><Text style={styles.aiLabel}>Food</Text><Text style={styles.aiValue}>{gemini.itemName || '—'}</Text></View>
            <View style={styles.aiItem}><Text style={styles.aiLabel}>Category</Text><Text style={styles.aiValue}>{gemini.category}</Text></View>
            <View style={styles.aiItem}><Text style={styles.aiLabel}>Portions</Text><Text style={styles.aiValue}>{gemini.estimatedPortions ?? '—'}</Text></View>
            <View style={styles.aiItem}><Text style={styles.aiLabel}>Weight</Text><Text style={styles.aiValue}>{gemini.estimatedWeightKg ?? '—'} kg</Text></View>
          </View>
          <Text style={styles.aiAllergens}>Allergens: {(gemini.allergens||[]).join(', ')||'none'}</Text>
          {(gemini.confidence == null || gemini.confidence < 0.6) && <Text style={styles.aiWarn}>⚠ {gemini.confidence == null ? 'AI did not report confidence' : 'Low confidence'} — please verify category, portions, allergens & use-by</Text>}
          <Text style={styles.muted}>Auto-filled — review & edit below.</Text>
        </View>
      )}
      {!gemini && !geminiBusy && !photoUri && (
        <View style={styles.infoBox}>
          <Ionicons name="bulb-outline" size={16} color="#0284c7"/>
          <Text style={styles.infoText}>{isGeminiConfigured() ? 'Take a photo first — AI will suggest details. Or fill manually below.' : 'Fill in the details below — a photo is required as evidence.'}</Text>
        </View>
      )}

      {/* REVIEW & EDIT */}
      <Text style={styles.section}>Review & Edit {gemini? '· AI-assisted':''}</Text>
      <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="Food item *" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={mealCategory} onChangeText={setMealCategory} placeholder="Meal category *" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.halfRow}>
        <TextInput style={[styles.input, styles.half]} value={portions} onChangeText={setPortions} placeholder="Portions *" keyboardType="numeric" placeholderTextColor={theme.colors.textMuted} />
        <TextInput style={[styles.input, styles.half]} value={weight} onChangeText={setWeight} placeholder="Weight kg *" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} />
      </View>
      <TextInput style={styles.input} value={allergens} onChangeText={setAllergens} placeholder="Allergens (comma-separated)" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.halfRow}>
        <TouchableOpacity style={[styles.input, styles.half, { justifyContent: 'center' }]} onPress={() => setShowPreparedPicker(true)}>
          <Text style={{ color: theme.colors.text }}>{preparedAt || 'Prepared — tap to pick'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.input, styles.half, { justifyContent: 'center' }]} onPress={() => setShowExpiryPicker(true)}>
          <Text style={{ color: theme.colors.text }}>{expiryAt || 'Expiry — tap to pick'}</Text>
        </TouchableOpacity>
      </View>
      {showPreparedPicker && (
        <DateTimePicker
          value={preparedAt ? new Date(preparedAt) : new Date()}
          mode="datetime" display="default"
          onChange={(_, d) => { setShowPreparedPicker(false); if (d) setPreparedAt(isoLocal(d)); }}
        />
      )}
      {showExpiryPicker && (
        <DateTimePicker
          value={expiryAt ? new Date(expiryAt) : new Date(Date.now() + 24 * 3600000)}
          mode="datetime" display="default"
          onChange={(_, d) => { setShowExpiryPicker(false); if (d) setExpiryAt(isoLocal(d)); }}
        />
      )}

      <Text style={styles.section}>Safety checklist (all four required)</Text>
      {CHECKS.map((c) => (
        <View key={c.key} style={styles.row}>
          <Text style={styles.checkLabel}>{c.label}</Text>
          <Switch value={checks[c.key]} onValueChange={(v) => setChecks((p) => ({ ...p, [c.key]: v }))} />
        </View>
      ))}

      {busy ? <ActivityIndicator size="large" color={theme.colors.primary} /> : (
        <TouchableOpacity style={styles.button} onPress={reviewAndSubmit}><Text style={styles.buttonText}>Review safety & log batch</Text></TouchableOpacity>
      )}

      <Text style={styles.section}>My recent batches ({recent.length})</Text>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {recent.length === 0 && <Text style={styles.muted}>Nothing logged yet.</Text>}
      {recent.map((b) => (
        <TouchableOpacity key={b.id} style={styles.card} onPress={() => setInspected(b)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
          <Text style={styles.muted}>{formatStatus(b.status)} · {b.portionCount} portions · {b.estimatedWeightKg}kg</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}
      <DetailModal visible={inspected !== null} title={inspected ? `${inspected.batchId} — ${inspected.itemName}` : ''} onClose={() => setInspected(null)}>
        {inspected && (
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
            {!!inspected.safetyPhotoUrl && (
              <>
                <SectionTitle>PHOTO</SectionTitle>
                <Image source={{ uri: inspected.safetyPhotoUrl }} style={styles.photo} resizeMode="cover" />
              </>
            )}
            <SectionTitle>LIFECYCLE</SectionTitle>
            <KV label="Status" value={formatStatus(inspected.status)} />
            <KV label="NPO" value={(npos.find((n) => n.npoId === inspected.allocatedNpoId)?.organisationName) || inspected.allocatedNpoId || '—'} />
            <KV label="Facility" value={inspected.receivingFacility || '—'} />
            <KV label="Pickup" value={inspected.pickupWindowStart ? `${new Date(inspected.pickupWindowStart).toLocaleString()} · ${inspected.loadingBay || ''}` : '—'} />
          </View>
        )}
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
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surface },
  halfRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  checkLabel: { color: theme.colors.text, flex: 1, marginRight: 8 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  small: { padding: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
  secondary: { borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontWeight: '600' },
  button: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  photo: { width: '100%', height: 180, borderRadius: 8, marginTop: 4 },
  hero:{height:220, borderRadius:16, overflow:'hidden', backgroundColor:theme.colors.surface, borderWidth:2, borderColor:theme.colors.border, borderStyle:'dashed', marginBottom:8},
  heroImage:{width:'100%', height:'100%'},
  heroPlaceholder:{flex:1, alignItems:'center', justifyContent:'center', gap:8, padding:16},
  heroTitle:{fontSize:18, fontWeight:'700', color:theme.colors.text, marginTop:4},
  heroSub:{fontSize:12, color:theme.colors.textMuted, textAlign:'center'},
  heroBadge:{position:'absolute', bottom:8, right:8, backgroundColor:'rgba(0,0,0,0.6)', paddingHorizontal:8, paddingVertical:4, borderRadius:12},
  heroBadgeText:{color:'#fff', fontSize:11, fontWeight:'600'},
  aiCard:{backgroundColor:theme.colors.surface, borderRadius:12, padding:12, marginTop:8, borderWidth:1.5},
  aiTitle:{fontSize:13, fontWeight:'700', color:theme.colors.text, letterSpacing:0.5, textTransform:'uppercase'},
  aiNote:{fontSize:12, color:theme.colors.textSecondary, marginTop:4, fontStyle:'italic'},
  aiGrid:{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8},
  aiItem:{width:'48%', backgroundColor:theme.colors.surfaceVariant, borderRadius:8, padding:8, borderWidth:1, borderColor:theme.colors.border},
  aiLabel:{fontSize:10, fontWeight:'600', color:theme.colors.textMuted, textTransform:'uppercase', letterSpacing:0.5},
  aiValue:{fontSize:14, fontWeight:'700', color:theme.colors.text, marginTop:2},
  aiAllergens:{fontSize:12, color:theme.colors.textSecondary, marginTop:8},
  aiWarn:{fontSize:12, color:'#92400e', fontWeight:'600', marginTop:6, backgroundColor:'#fef3c7', padding:6, borderRadius:6},
  confBadge:{paddingHorizontal:8, paddingVertical:3, borderRadius:12, borderWidth:1, borderColor:'#e2e8f0'},
  confText:{fontSize:11, fontWeight:'700'},
  analyzeBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#0f172a', paddingVertical:14, borderRadius:12, marginTop:4, marginBottom:8},
  analyzeBtnDone:{backgroundColor:'#dcfce7', borderWidth:1, borderColor:'#86efac'},
  analyzeBtnText:{color:'#fff', fontWeight:'700', fontSize:14},
  analyzingRow:{flexDirection:'row', alignItems:'center', gap:8, marginTop:8, marginBottom:4},
  aiErrorBox:{flexDirection:'row', gap:8, alignItems:'flex-start', backgroundColor:'#fef3c7', borderWidth:1, borderColor:'#fde68a', borderRadius:8, padding:10, marginTop:8, marginBottom:4},
  aiErrorText:{flex:1, fontSize:12, color:'#92400e', fontWeight:'600'},
  infoBox:{flexDirection:'row', gap:8, alignItems:'center', backgroundColor:'#e0f2fe', borderWidth:1, borderColor:'#bae6fd', borderRadius:8, padding:10, marginTop:8},
  infoText:{flex:1, fontSize:12, color:'#0369a1', fontWeight:'500'},
});
