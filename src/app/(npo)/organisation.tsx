// (npo) Organisation profile + registered facilities.
// Layer 8 presentation rebuild; addNpoFacility payload unchanged.
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations, addNpoFacility } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { DetailRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { LiveErrorBanner } from '@/components/detail-kit';

export default function NpoOrganisationScreen() {
  const theme = useAppTheme();
  const { profile } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();

  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [known, setKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');
  const [facName, setFacName] = useState('');
  const [facAddress, setFacAddress] = useState('');
  const [facCapacity, setFacCapacity] = useState('');
  const [facContact, setFacContact] = useState('');
  const [facError, setFacError] = useState('');
  const [facBusy, setFacBusy] = useState(false);

  useEffect(() => {
    if (!email) { setKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => { setLoadError(e.message); setKnown(true); };
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  const meals = items.filter((b) => b.status === 'collected_completed').reduce((sum, b) => sum + (b.portionCount || 0), 0);

  const submitFacility = async () => {
    if (!myNpo) return;
    if (!facName.trim()) { setFacError('Facility name is required.'); return; }
    setFacBusy(true);
    setFacError('');
    try {
      await addNpoFacility({
        npoDocId: myNpo.id, name: facName, address: facAddress,
        capacity: facCapacity ? Number(facCapacity) : undefined, contact: facContact,
      });
      setFacName(''); setFacAddress(''); setFacCapacity(''); setFacContact('');
    } catch (e: any) {
      setFacError(e?.message || 'Could not add facility.');
    } finally { setFacBusy(false); }
  };

  return (
    <Screen scroll>
      <PageHeader title="Facilities" subtitle={myNpo?.organisationName || 'Verification status & profile'} showBack fallback="/(npo)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />

      {!known ? (
        <ListSkeleton rows={3} />
      ) : !myNpo ? (
        loadError ? (
          <ErrorState title="Couldn't load organisation" message="Organisation data is unavailable right now." details={loadError} onRetry={() => setLoadError('')} />
        ) : (
          <EmptyState icon="hourglass-outline" title="Verification pending" message="No NPO record is linked to this account yet. Ask an administrator to verify your organisation (UC34)." />
        )
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md }}>
            <StatusPill status={myNpo.verificationStatus} />
          </View>
          {myNpo.rejectionReason ? (
            <AppText variant="caption" color={theme.colors.warningStrong} style={{ marginBottom: theme.space.sm }}>Reviewer note: {myNpo.rejectionReason}</AppText>
          ) : null}

          <Card>
            <DetailRow label="Contact" value={`${myNpo.contactName} · ${myNpo.phone}`} />
            <DetailRow label="Email" value={myNpo.email} />
            <DetailRow label="Registration" value={myNpo.registrationNumber} />
            {myNpo.pboNumber ? <DetailRow label="PBO" value={myNpo.pboNumber} /> : null}
            <DetailRow label="Service areas" value={(myNpo.serviceAreas || []).join(', ') || '—'} />
            <DetailRow label="Beneficiary capacity" value={String(myNpo.beneficiaryCapacity ?? '—')} />
            <DetailRow label="Transport" value={myNpo.transportType || '—'} />
            <DetailRow label="Refrigeration" value={myNpo.refrigerationAvailable ? 'Available' : 'Not available'} />
          </Card>

          <SectionHeader title="Registered facilities" />
          {(myNpo.facilities || []).length === 0 ? (
            <AppText variant="body" tone="muted">No facilities registered yet — add your receiving facility so kitchen staff can schedule deliveries to it.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {(myNpo.facilities || []).map((f, i) => (
                <View key={f.id} style={[{ paddingVertical: theme.space.md, gap: 2 }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
                  <AppText variant="bodyStrong">{f.name}{f.active ? '' : ' (inactive)'}</AppText>
                  {f.address ? <AppText variant="caption" tone="secondary">{f.address}</AppText> : null}
                  <AppText variant="caption" tone="muted">
                    {[f.capacity ? `capacity ${f.capacity}` : '', f.contact || ''].filter(Boolean).join(' · ') || '—'}
                  </AppText>
                </View>
              ))}
            </Card>
          )}

          <View style={{ gap: theme.space.sm, marginTop: theme.space.md }}>
            <Field label="Facility name *" value={facName} onChangeText={setFacName} placeholder="e.g. Bay 3 Community Kitchen" />
            <Field label="Address" value={facAddress} onChangeText={setFacAddress} placeholder="Street, suburb" />
            <Field label="Capacity (beneficiaries)" value={facCapacity} onChangeText={setFacCapacity} placeholder="e.g. 200" keyboardType="numeric" />
            <Field label="Contact person / phone" value={facContact} onChangeText={setFacContact} placeholder="Name · phone" />
            {facError ? <AppText variant="caption" tone="error">{facError}</AppText> : null}
            <Button label={facBusy ? 'Adding…' : 'Add facility'} onPress={submitFacility} loading={facBusy} />
          </View>

          <SectionHeader title="Lifetime" />
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <AppText variant="metric">{items.length}</AppText>
              <AppText variant="caption" tone="secondary">Allocations</AppText>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <AppText variant="metric">{meals}</AppText>
              <AppText variant="caption" tone="secondary">Meals received</AppText>
            </Card>
          </View>
        </>
      )}
      <View style={{ height: theme.space['4xl'] }} />
    </Screen>
  );
}
