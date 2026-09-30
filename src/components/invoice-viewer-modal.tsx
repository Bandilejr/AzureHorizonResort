import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { db } from '../services/firebase-services';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { generateAndSendInvoice, InvoiceRecord } from '../services/invoice-service';

interface InvoiceViewerModalProps {
  visible: boolean;
  onClose: () => void;
  guestId?: string;
  recordIdFilter?: string;
  title?: string;
}

export const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  visible,
  onClose,
  guestId,
  recordIdFilter,
  title = '🧾 My Invoices & Receipts',
}) => {
  const theme = useAppTheme();
  const S = createStyles(theme);

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    let q: any;

    if (recordIdFilter) {
      q = query(collection(db, 'invoices'), where('recordId', '==', recordIdFilter));
    } else if (guestId) {
      q = query(collection(db, 'invoices'), where('guestId', '==', guestId));
    } else {
      q = query(collection(db, 'invoices'), orderBy('sentAt', 'desc'));
    }

    const unsub = onSnapshot(
      q,
      (snap: any) => {
        const list: InvoiceRecord[] = [];
        snap.forEach((d: any) => {
          list.push({ id: d.id, ...d.data() });
        });
        // Sort descending by sentAt
        list.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        setInvoices(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Invoice listener error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [visible, guestId, recordIdFilter]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleResendEmail = async (inv: InvoiceRecord) => {
    setResendingId(inv.id || inv.invoiceNumber);
    try {
      const updated = await generateAndSendInvoice({
        type: inv.type,
        recordId: inv.recordId,
        overrideRecipientEmail: inv.guestEmail,
      });

      showAlert({
        title: '📧 Email Dispatched!',
        message: `Invoice #${updated.invoiceNumber} re-sent to ${updated.guestEmail}.\n\nMessage ID: ${updated.messageId || 'N/A'}${
          updated.previewUrl ? `\nPreview URL: ${updated.previewUrl}` : ''
        }`,
        type: 'success',
      });
    } catch (e: any) {
      showAlert({ title: 'Dispatch Error', message: e.message || 'Could not re-send invoice.', type: 'error' });
    } finally {
      setResendingId(null);
    }
  };

  const formatTypeLabel = (type: string) => {
    if (type === 'damage') return '🛠️ Damage Claim Invoice';
    if (type === 'refund') return '💸 Approved Refund Invoice';
    return '🏨 Booking Confirmation';
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={S.modalOverlay}>
        <View style={S.modalSheet}>
          <View style={S.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={S.modalTitle}>{title}</Text>
              <Text style={S.modalSubtitle}>System-generated itemized financial artifacts</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={S.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {selectedInvoice ? (
            /* ── Detailed Invoice View ── */
            <ScrollView style={{ flex: 1, padding: 16 }}>
              <TouchableOpacity
                onPress={() => setSelectedInvoice(null)}
                style={S.backBtn}
              >
                <Ionicons name="arrow-back" size={18} color={theme.colors.primary} />
                <Text style={S.backBtnText}>Back to Invoices List</Text>
              </TouchableOpacity>

              <View style={S.invCard}>
                <View style={S.invCardHeader}>
                  <Text style={S.invHeaderBrand}>AZURE HORIZON</Text>
                  <Text style={S.invHeaderSub}>RESORT & SPA</Text>
                  <Text style={S.invNum}>Invoice #{selectedInvoice.invoiceNumber}</Text>
                  <Text style={S.invType}>{formatTypeLabel(selectedInvoice.type)}</Text>
                </View>

                <View style={S.gridSection}>
                  <View style={S.gridItem}>
                    <Text style={S.gridLabel}>Guest Name</Text>
                    <Text style={S.gridVal}>{selectedInvoice.guestName || 'Valued Guest'}</Text>
                  </View>
                  <View style={S.gridItem}>
                    <Text style={S.gridLabel}>Guest Email</Text>
                    <Text style={S.gridVal}>{selectedInvoice.guestEmail}</Text>
                  </View>
                  <View style={S.gridItem}>
                    <Text style={S.gridLabel}>Date Sent</Text>
                    <Text style={S.gridVal}>
                      {new Date(selectedInvoice.sentAt).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={S.gridItem}>
                    <Text style={S.gridLabel}>Email Status</Text>
                    <Text style={[S.gridVal, { color: theme.colors.success, fontWeight: '700' }]}>
                      {selectedInvoice.emailStatus === 'sent' ? '🟢 Emailed (Delivered)' : '🔴 Delivery Pending'}
                    </Text>
                  </View>
                </View>

                {/* Line Items Table */}
                <Text style={S.tableTitle}>📋 Line Item Breakdown</Text>
                <View style={S.tableContainer}>
                  <View style={S.tableHeader}>
                    <Text style={[S.th, { flex: 2 }]}>Description</Text>
                    <Text style={[S.th, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>Subtotal</Text>
                  </View>
                  {(selectedInvoice.lineItems || []).map((item, idx) => (
                    <View key={idx} style={S.tableRow}>
                      <Text style={[S.td, { flex: 2 }]}>{item.name}</Text>
                      <Text style={[S.td, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                      <Text style={[S.td, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>
                        R {Number(item.subtotal).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Totals Summary */}
                <View style={S.totalsBox}>
                  {selectedInvoice.subtotal != null && (
                    <View style={S.totalRow}>
                      <Text style={S.totalLabel}>Subtotal</Text>
                      <Text style={S.totalVal}>R {Number(selectedInvoice.subtotal).toFixed(2)}</Text>
                    </View>
                  )}
                  {selectedInvoice.tax != null && selectedInvoice.tax > 0 && (
                    <View style={S.totalRow}>
                      <Text style={S.totalLabel}>VAT (15%)</Text>
                      <Text style={S.totalVal}>R {Number(selectedInvoice.tax).toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={[S.totalRow, S.grandTotalRow]}>
                    <Text style={S.grandTotalLabel}>TOTAL AMOUNT</Text>
                    <Text style={S.grandTotalVal}>R {Number(selectedInvoice.amount).toFixed(2)}</Text>
                  </View>
                </View>

                {/* Re-send Action */}
                <TouchableOpacity
                  style={S.resendBtn}
                  onPress={() => handleResendEmail(selectedInvoice)}
                  disabled={resendingId === (selectedInvoice.id || selectedInvoice.invoiceNumber)}
                >
                  {resendingId === (selectedInvoice.id || selectedInvoice.invoiceNumber) ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="mail" size={18} color={theme.colors.textInverse} style={{ marginRight: 8 }} />
                      <Text style={S.resendBtnText}>Re-send Invoice Email</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* ── Invoices List View ── */
            <FlatList
              data={invoices}
              keyExtractor={(item, index) => item.id || item.invoiceNumber || String(index)}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={S.invoiceListItem}
                  onPress={() => setSelectedInvoice(item)}
                >
                  <View style={S.itemIconBg}>
                    <Ionicons
                      name={item.type === 'damage' ? 'construct' : item.type === 'refund' ? 'cash' : 'calendar'}
                      size={24}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={S.itemTitle}>{formatTypeLabel(item.type)}</Text>
                    <Text style={S.itemNum}>Invoice #{item.invoiceNumber}</Text>
                    <Text style={S.itemMeta}>
                      {new Date(item.sentAt).toLocaleDateString()} • {item.guestEmail}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={S.itemAmount}>R {Number(item.amount).toLocaleString()}</Text>
                    <View style={S.sentBadge}>
                      <Text style={S.sentBadgeText}>🟢 Emailed</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
                ) : (
                  <View style={{ alignItems: 'center', marginTop: 40 }}>
                    <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={S.emptyText}>No invoices generated yet.</Text>
                  </View>
                )
              }
            />
          )}
        </View>

        <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
      </View>
    </Modal>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      minHeight: '60%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
    modalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
    closeBtn: { padding: 4 },
    backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backBtnText: { color: theme.colors.primary, fontWeight: '700', marginLeft: 6 },

    invCard: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    invCardHeader: { alignItems: 'center', borderBottomWidth: 2, borderBottomColor: theme.colors.primary, paddingBottom: 16, marginBottom: 20 },
    invHeaderBrand: { fontSize: 22, fontWeight: '800', color: theme.colors.primary, letterSpacing: 1 },
    invHeaderSub: { fontSize: 11, fontWeight: '700', color: theme.colors.gold, letterSpacing: 2, marginTop: 2 },
    invNum: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 10 },
    invType: { fontSize: 13, fontWeight: '600', color: theme.colors.primary, marginTop: 4 },

    gridSection: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: theme.colors.surface, padding: 14, borderRadius: 10, marginBottom: 20, gap: 12 },
    gridItem: { width: '45%' },
    gridLabel: { fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', fontWeight: '700' },
    gridVal: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 2 },

    tableTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
    tableContainer: { backgroundColor: theme.colors.surface, borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
    tableHeader: { flexDirection: 'row', backgroundColor: theme.colors.primary, padding: 10 },
    th: { color: theme.colors.textInverse, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    td: { color: theme.colors.text, fontSize: 13 },

    totalsBox: { backgroundColor: theme.colors.surface, padding: 14, borderRadius: 10, marginBottom: 20 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totalLabel: { color: theme.colors.textMuted, fontSize: 13 },
    totalVal: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
    grandTotalRow: { borderTopWidth: 2, borderTopColor: theme.colors.primary, paddingTop: 10, marginTop: 6 },
    grandTotalLabel: { fontSize: 15, fontWeight: '800', color: theme.colors.primary },
    grandTotalVal: { fontSize: 17, fontWeight: '800', color: theme.colors.primary },

    resendBtn: { backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12 },
    resendBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 14 },

    invoiceListItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border },
    itemIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    itemTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    itemNum: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginTop: 2 },
    itemMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
    itemAmount: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
    sentBadge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.colors.successSoft },
    sentBadgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.successStrong },
    emptyText: { color: theme.colors.textMuted, fontSize: 14, marginTop: 8 },
  });
