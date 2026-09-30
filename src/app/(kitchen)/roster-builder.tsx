// (kitchen) UC42 — Roster builder.
// Layer 8: pickers for week/date/times, searchable staff sheet (no manual UID),
// cached names. saveRosterMobile / publishRosterMobile payloads unchanged.
import React, { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { listenAllAvailability, listenLeaveRequests, listenShiftRosters, saveRosterMobile, publishRosterMobile } from '@/services/increment2-services';
import { todayISO, addDaysISO, parseISOLocal } from '@/utils/dates';
import { dateToStored, timeToStored, storedDateToDate, storedTimeToDate } from '@/utils/datetime-input';
import { usePermissions } from '@/context/PermissionsContext';
import type { RosterShift, ShiftRoster, StaffAvailability, LeaveRequest } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { PickerSheet } from '@/components/ui/sheets';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';

type PickerTarget = 'week' | 'date' | 'start' | 'end' | null;
const WD = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function KitchenRosterBuilderScreen() {
  const theme = useAppTheme();
  const [weekStart, setWeekStart] = useState(() => todayISO());
  const [department, setDepartment] = useState('Food & Beverage');
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [draft, setDraft] = useState({ staffId: '', date: '', startTime: '08:00', endTime: '17:00', role: '', skill: '' });
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [staffPicker, setStaffPicker] = useState(false);
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<ShiftRoster | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();
  const staffNames = useStaffNames();

  useEffect(() => {
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenAllAvailability((l) => { setAvailability(l); setLoaded(true); }, onErr);
    const u2 = listenLeaveRequests(setLeave, undefined, onErr);
    const u3 = listenShiftRosters(setRosters, weekStart, onErr);
    return () => { u1(); u2(); u3(); };
  }, [weekStart, retryKey]);

  const knownStaff = [...new Map(availability.map((a) => [a.staffId, a.staffName || staffNameOf(staffNames, a.staffId)])).entries()];

  // Read-only week overview (saved rosters only) — no writes.
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);
  const weekShifts = useMemo(() => rosters.flatMap((r) => r.shifts || []), [rosters]);
  const weekStaff = useMemo(() => [...new Set(weekShifts.map((s) => s.staffId))], [weekShifts]);

  const addShift = () => {
    if (!draft.staffId.trim() || !draft.date || !draft.role.trim()) {
      showAlert({ title: 'Incomplete shift', message: 'Staff, date and role are required.', type: 'error' });
      return;
    }
    if (draft.startTime >= draft.endTime) {
      showAlert({ title: 'Invalid shift', message: 'End time must be after start time.', type: 'error' });
      return;
    }
    const entry: RosterShift = {
      shiftId: `SH-${Date.now().toString(36).toUpperCase()}`,
      staffId: draft.staffId.trim(), date: draft.date,
      startTime: draft.startTime, endTime: draft.endTime, role: draft.role.trim(),
    };
    if (draft.skill.trim()) entry.requiredSkill = draft.skill.trim();
    setShifts((p) => [...p, entry]);
    setDraft({ staffId: '', date: '', startTime: '08:00', endTime: '17:00', role: '', skill: '' });
  };

  const save = async () => {
    if (shifts.length === 0) { showAlert({ title: 'Nothing to save', message: 'Add at least one shift first.', type: 'error' }); return; }
    setBusy(true);
    try {
      const { warnings: w } = await saveRosterMobile({
        weekStart, department, shifts, availability,
        approvedLeave: leave.filter((l) => l.status === 'approved'),
      });
      setWarnings(w);
      showAlert({
        title: w.length ? 'Draft saved with warnings' : 'Roster validated',
        message: w.length ? `${w.length} conflict(s) must be resolved before publishing.` : 'No conflicts — ready to publish.',
        type: w.length ? 'warning' : 'success',
      });
    } catch (e: any) {
      showAlert({ title: 'Save failed', message: e?.message || 'Could not save.', type: 'error' });
    } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await publishRosterMobile(selected.id);
      setSelected(null); setConfirming(false);
      showAlert({ title: 'Roster published', message: 'Assigned staff notified. Roster locked.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Publish blocked', message: e?.message || 'Could not publish.', type: 'error' });
    } finally { setBusy(false); }
  };

  if (!hasPermission('roster_manage')) {
    return (
      <Screen>
        <PageHeader title="Roster builder" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Roster management is restricted to kitchen managers." />
      </Screen>
    );
  }

  const prettyWeek = storedDateToDate(weekStart).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  const prettyDraftDate = draft.date ? storedDateToDate(draft.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick date';

  return (
    <Screen scroll>
      <PageHeader title="Roster builder" subtitle="Build, validate & publish the week" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load roster data" message="Roster data is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <View style={{ gap: theme.space.sm }}>
            <TouchableOpacity onPress={() => setPicker('week')}>
              <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="label" tone="secondary">Week starting</AppText>
                <AppText variant="bodyStrong" tone="primary">{prettyWeek}</AppText>
              </Card>
            </TouchableOpacity>
            <Field label="Department" value={department} onChangeText={setDepartment} placeholder="Food & Beverage" />
          </View>

          <SectionHeader title="Week overview" />
          {weekShifts.length === 0 ? (
            <AppText variant="body" tone="muted">No saved shifts for this week yet.</AppText>
          ) : (
            <Card padding="md">
              <View style={{ flexDirection: 'row', marginBottom: theme.space.xs }}>
                <View style={{ width: 88 }} />
                {weekDates.map((d, i) => (
                  <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                    <AppText variant="micro" tone="muted" weight="700">{WD[i]}</AppText>
                    <AppText variant="micro" tone="muted">{parseISOLocal(d).getDate()}</AppText>
                  </View>
                ))}
              </View>
              {weekStaff.map((uid) => (
                <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <View style={{ width: 88, paddingRight: 4 }}>
                    <AppText variant="caption" numberOfLines={1}>{staffNameOf(staffNames, uid)}</AppText>
                  </View>
                  {weekDates.map((d) => {
                    const cellShifts = weekShifts.filter((s) => s.staffId === uid && s.date === d);
                    const onLeave = leave.some((l) => l.status === 'approved' && d >= l.startDate && d <= l.endDate);
                    const overlap = cellShifts.some((a, i) => cellShifts.some((b, j) => i < j && a.startTime < b.endTime && b.startTime < a.endTime));
                    const bar = overlap ? theme.colors.error : cellShifts.length ? theme.colors.primary : onLeave ? theme.colors.textMuted : 'transparent';
                    return (
                      <View key={d} style={{ flex: 1, paddingHorizontal: 2 }}>
                        <View style={{ height: 14, borderRadius: 4, backgroundColor: bar }} />
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, justifyContent: 'center', marginTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.space.sm }}>
                {([['Shift', theme.colors.primary], ['Leave', theme.colors.textMuted], ['Conflict', theme.colors.error]] as [string, string][]).map(([label, color]) => (
                  <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                    <AppText variant="micro" tone="muted" weight="600">{label}</AppText>
                  </View>
                ))}
              </View>
            </Card>
          )}

          <SectionHeader title="Add shift" />
          <View style={{ gap: theme.space.sm }}>
            <TouchableOpacity onPress={() => setStaffPicker(true)}>
              <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="label" tone="secondary">Staff member</AppText>
                <AppText variant="bodyStrong" tone={draft.staffId ? 'primary' : 'muted'}>
                  {draft.staffId ? (knownStaff.find(([uid]) => uid === draft.staffId)?.[1] || staffNameOf(staffNames, draft.staffId)) : 'Select staff'}
                </AppText>
              </Card>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPicker('date')}>
              <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="label" tone="secondary">Date</AppText>
                <AppText variant="bodyStrong" tone={draft.date ? 'primary' : 'muted'}>{prettyDraftDate}</AppText>
              </Card>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('start')}>
                <Card padding="md" style={{ alignItems: 'center' }}>
                  <AppText variant="micro" tone="muted">START</AppText>
                  <AppText variant="bodyStrong">{draft.startTime}</AppText>
                </Card>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('end')}>
                <Card padding="md" style={{ alignItems: 'center' }}>
                  <AppText variant="micro" tone="muted">END</AppText>
                  <AppText variant="bodyStrong">{draft.endTime}</AppText>
                </Card>
              </TouchableOpacity>
            </View>
            <Field label="Role" value={draft.role} onChangeText={(v) => setDraft((p) => ({ ...p, role: v }))} placeholder="e.g. chef" />
            <Field label="Required skill (optional)" value={draft.skill} onChangeText={(v) => setDraft((p) => ({ ...p, skill: v }))} placeholder="e.g. Food safety" />
          </View>

          {picker === 'week' ? <DateTimePicker value={storedDateToDate(weekStart)} mode="date" display="default" onChange={(_, d) => { setPicker(null); if (d) setWeekStart(dateToStored(d)); }} /> : null}
          {picker === 'date' ? <DateTimePicker value={storedDateToDate(draft.date)} mode="date" display="default" onChange={(_, d) => { setPicker(null); if (d) setDraft((p) => ({ ...p, date: dateToStored(d) })); }} /> : null}
          {picker === 'start' ? <DateTimePicker value={storedTimeToDate(draft.startTime)} mode="time" is24Hour display="default" onChange={(_, d) => { setPicker(null); if (d) setDraft((p) => ({ ...p, startTime: timeToStored(d) })); }} /> : null}
          {picker === 'end' ? <DateTimePicker value={storedTimeToDate(draft.endTime)} mode="time" is24Hour display="default" onChange={(_, d) => { setPicker(null); if (d) setDraft((p) => ({ ...p, endTime: timeToStored(d) })); }} /> : null}

          <View style={{ marginTop: theme.space.md }}>
            <ModalButton label={`Add shift (${shifts.length})`} kind="secondary" onPress={addShift} />
          </View>

          {shifts.length > 0 ? (
            <Card padding="none" style={{ marginTop: theme.space.md, paddingHorizontal: theme.space.lg }}>
              {shifts.map((s, i) => (
                <View key={s.shiftId} style={[{ flexDirection: 'row', alignItems: 'center' }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
                  <View style={{ flex: 1 }}>
                    <ListRow
                      title={`${s.date} ${s.startTime}–${s.endTime}`}
                      subtitle={`${knownStaff.find(([uid]) => uid === s.staffId)?.[1] || staffNameOf(staffNames, s.staffId)} · ${s.role}${s.requiredSkill ? ` · ${s.requiredSkill}` : ''}`}
                      showChevron={false}
                    />
                  </View>
                  <TouchableOpacity onPress={() => setShifts((p) => p.filter((x) => x.shiftId !== s.shiftId))} accessibilityLabel="Remove shift" hitSlop={8}>
                    <Ionicons name="trash-outline" size={theme.iconSize.md} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          ) : null}

          {warnings.length > 0 ? (
            <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft, marginTop: theme.space.md }}>
              <AppText variant="label" color={theme.colors.warningStrong} weight="700">Resolve before publishing</AppText>
              {warnings.map((w, i) => (
                <AppText key={i} variant="caption" color={theme.colors.warningStrong} style={{ marginTop: 2 }}>• {w}</AppText>
              ))}
            </Card>
          ) : null}

          <View style={{ marginTop: theme.space.md }}>
            <ModalButton label="Validate & save" onPress={save} busy={busy} />
          </View>

          <SectionHeader title={`Week rosters (${rosters.length})`} />
          {rosters.length === 0 ? (
            <AppText variant="body" tone="muted">No rosters saved for this week yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {rosters.map((r, i) => (
                <View key={r.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={r.rosterId}
                    subtitle={`${r.shifts.length} shifts · ${r.department}`}
                    status={<StatusPill status={r.published ? 'published' : r.validationStatus} size="sm" />}
                    onPress={() => { setSelected(r); setConfirming(false); }}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <PickerSheet
        visible={staffPicker}
        title="Select staff member"
        searchable
        options={knownStaff.map(([uid, name]) => ({ value: uid, label: name }))}
        onSelect={(uid) => setDraft((p) => ({ ...p, staffId: uid }))}
        onClose={() => setStaffPicker(false)}
        emptyMessage="No staff with submitted availability. Ask staff to submit availability first."
      />

      <DetailModal visible={selected !== null} title={selected?.rosterId || ''} onClose={() => setSelected(null)}>
        {selected && !confirming ? (
          <View>
            <StatusBadge status={selected.published ? 'published' : selected.validationStatus} />
            <KV label="Week" value={selected.weekStart} />
            <KV label="Department" value={selected.department} />
            {selected.publishedBy ? <KV label="Published" value={selected.publishedAt ? new Date(selected.publishedAt).toLocaleString() : 'Yes'} /> : null}
            <SectionTitle>{`SHIFTS (${selected.shifts.length})`}</SectionTitle>
            {(selected.shifts || []).map((s) => (
              <View key={s.shiftId} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 }}>
                <AppText variant="bodyStrong">{s.date} {s.startTime}–{s.endTime}</AppText>
                <AppText variant="caption" tone="muted">{staffNameOf(staffNames, s.staffId)} · {s.role}{s.requiredSkill ? ` · ${s.requiredSkill}` : ''}</AppText>
              </View>
            ))}
            <SectionTitle>VALIDATION</SectionTitle>
            {(selected.validationWarnings || []).length === 0 ? (
              <AppText variant="body" tone="muted">No warnings — ready to publish.</AppText>
            ) : (
              (selected.validationWarnings || []).map((w, i) => (
                <AppText key={i} variant="caption" color={theme.colors.warningStrong} style={{ marginTop: 2 }}>• {w}</AppText>
              ))
            )}
            {!selected.published ? (
              <View style={{ marginTop: theme.space.md }}>
                <ModalButton label="Review publication" onPress={() => setConfirming(true)} />
              </View>
            ) : null}
          </View>
        ) : null}
        {selected && confirming ? (
          <ConfirmBlock
            title={`Publish ${selected.rosterId}?`}
            rows={[
              ['Week', selected.weekStart], ['Department', selected.department],
              ['Shifts', String(selected.shifts.length)],
              ['Staff notified', String(new Set(selected.shifts.map((s) => s.staffId)).size)],
              ['Effect', 'Roster locks; staff see it in My Roster'],
            ]}
            warning="Publishing notifies every assigned staff member. Re-validated live before locking."
            confirmLabel="Confirm publication" onConfirm={publish} onCancel={() => setConfirming(false)} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
