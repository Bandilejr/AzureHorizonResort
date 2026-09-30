import React, { useState, useEffect, Fragment } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, Modal, RefreshControl, useColorScheme, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal } from '@/components/CustomAlertModal';
import {
  db, processRefund
} from '../../services/firebase-services';
import {
  collection, getDocs, doc, getDoc, query, where
} from 'firebase/firestore';
import { InvoiceViewerModal } from '../../components/invoice-viewer-modal';

let statusConfig = (theme: any, status: string) => {
    switch (status) {
      case 'approved':
        return {
          color: theme.colors.success,
          bg: theme.colors.successLight,
          label: 'Approved',
          icon: 'checkmark-circle'
        };
      case 'rejected':
        return {
          color: theme.colors.error,
          bg: theme.colors.errorLight,
          label: 'Rejected',
          icon: 'close-circle'
        };
      default:
        return {
          color: theme.colors.primary,
          bg: '#fef3c7',
          label: 'Pending',
          icon: 'time'
        };
    }
  };

async function fetchRefundRequests() {
  const snap = await getDocs(collection(db, 'refund_requests'));
  const raw: any[] = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  // Compute average requested amount for risk scoring
  const amounts = raw.map(r => r.requestedAmount || 0).filter(a => a > 0);
  const avgAmount = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

  // Enrich with event & guest names + risk score
  const enriched: any[] = [];
  for (const reqDoc of raw) {
    const req = reqDoc as any;
    let eventName = req.eventId ? `Booking #${req.eventId.slice(-6)}` : 'Event Booking';
    let guestName = req.guestName;
    let guestEmail = req.guestEmail;
    if (req.eventId) {
      try {
        const evSnap = await getDoc(doc(db, 'event_bookings', req.eventId));
        if (evSnap.exists()) {
          const ed = evSnap.data() as any;
          eventName = `${ed.venueName || 'Venue'} — ${ed.eventType || 'Event'}`;
          if (!guestName || guestName.includes('_') || guestName.length > 25) {
            guestName = ed.guestName || ed.contactName || guestName;
          }
          if (!guestEmail) {
            guestEmail = ed.guestEmail || ed.contactEmail;
          }
        }
      } catch {/* skip */}
    }
    if (req.guestId && (!guestName || guestName === req.guestId || guestName.includes('_'))) {
      try {
        const uSnap = await getDoc(doc(db, 'users', req.guestId));
        if (uSnap.exists()) {
          const ud = uSnap.data() as any;
          guestName = ud.displayName || ud.fullName || ud.name || ud.email;
          guestEmail = guestEmail || ud.email;
        }
      } catch {}
    }
    if (!guestName || guestName.includes('_')) {
      guestName = 'Mpho Resident (Guest)';
    }

    // ── Risk Scoring Algorithm (UC33 fraud-detection heuristic) ──
    // Each factor adds to a 0–100 point risk score.
    let riskScore = 0;
    const riskFactors: string[] = [];

    // Factor 1: Amount > 1.5× average (30 pts)
    if (avgAmount > 0 && (req.requestedAmount || 0) > avgAmount * 1.5) {
      riskScore += 30;
      riskFactors.push('Amount above 150% of avg');
    }
    // Factor 2: Active damage record on same booking (25 pts)
    if (req.hasDamageRecord || req.damageCost) {
      riskScore += 25;
      riskFactors.push('Damage claim on booking');
    }
    // Factor 3: Guest has >1 previous refund request (20 pts)
    try {
      const prevSnap = await getDocs(query(collection(db, 'refund_requests'), where('guestId', '==', req.guestId)));
      if (prevSnap.size > 1) {
        riskScore += 20;
        riskFactors.push(`${prevSnap.size} prior requests`);
      }
    } catch {/* skip */}
    // Factor 4: Filed within 24h of event (15 pts)
    if (req.eventDate && req.createdAt) {
      const eventTs = req.eventDate?.seconds ? req.eventDate.seconds * 1000 : new Date(req.eventDate).getTime();
      const createdTs = req.createdAt?.seconds ? req.createdAt.seconds * 1000 : new Date(req.createdAt).getTime();
      const hoursAfterEvent = (createdTs - eventTs) / 3600000;
      if (hoursAfterEvent >= 0 && hoursAfterEvent < 24) {
        riskScore += 15;
        riskFactors.push('Filed <24h after event');
      }
    }
    // Factor 5: Full refund requested (10 pts)
    if (req.totalAmount && req.requestedAmount >= req.totalAmount) {
      riskScore += 10;
      riskFactors.push('Full refund requested');
    }
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
    enriched.push({
      ...req,
      eventName,
      guestName,
      guestEmail,
      riskScore,
      riskLevel,
      riskFactors
    });
  }

  // Sort: pending first (high-risk pending at top), then by createdAt desc
  enriched.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    if (a.status === 'pending' && b.status === 'pending') return (b.riskScore || 0) - (a.riskScore || 0);
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  return enriched;
}

  function RefundManagementAdminScreen() {
    let router = useRouter();
    let {
      profile
    } = useAuth();
    let colorScheme = useColorScheme();
    let theme = getTheme(colorScheme as any);
    let S = createStyles(theme);
    let [requests, setRequests] = useState<any[]>([]);
    let [loading, setLoading] = useState(true);
    let [refreshing, setRefreshing] = useState(false);
    let [filterStatus, setFilterStatus] = useState('all');
    let [showInvoiceModal, setShowInvoiceModal] = useState(false);
    let [showRiskInfoModal, setShowRiskInfoModal] = useState(false);
    let [selectedProofImage, setSelectedProofImage] = useState(null);

    // Reject modal
    let [rejectTarget, setRejectTarget] = useState<any>(null);
    let [rejectReason, setRejectReason] = useState('');
    let [isProcessing, setIsProcessing] = useState(false);
    useEffect(() => {
      let cancelled = false;
      fetchRefundRequests()
        .then(data => {
          if (!cancelled) setRequests(data);
        })
        .catch(e => console.error(e))
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setRefreshing(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []);
    let onRefresh = async () => {
      setRefreshing(true);
      try {
        const data = await fetchRefundRequests();
        setRequests(data);
      } catch (e) {
        console.error(e);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    };
    let [alertConfig, setAlertConfig] = useState({
      visible: false,
      title: '',
      message: ''
    });
    let showAlert = (config: any) => {
      setAlertConfig({
        ...config,
        visible: true
      });
    };
    let handleApprove = (req_0: any) => {
      let riskWarning = req_0.riskLevel === 'high' ? `\n\n🚨 HIGH RISK REQUEST (Score: ${req_0.riskScore}/100)\nFactors: ${(req_0.riskFactors || []).join(', ')}\n\nThis request requires extra scrutiny before approval.` : req_0.riskLevel === 'medium' ? `\n\n⚠️ MEDIUM RISK (Score: ${req_0.riskScore}/100): ${(req_0.riskFactors || []).join(', ')}` : '';
      let warningText = `Approve R${(req_0.requestedAmount || 0).toLocaleString()} refund for ${req_0.guestName}?\n\nThis will mark the refund as processed.${riskWarning}`;
      if (req_0.hasDamageRecord || req_0.damageCost) {
        warningText = `⚠️ DAMAGE CONFLICT WARNING!\n\nThis event booking has a recorded damage claim of R ${(req_0.damageCost || 0).toLocaleString()} (UC30).\n\nAre you sure you want to approve a refund of R${(req_0.requestedAmount || 0).toLocaleString()} without deducting damage fees?${riskWarning}`;
      }
      showAlert({
        title: 'Approve Refund',
        message: warningText,
        type: 'warning',
        confirmText: 'Approve',
        cancelText: 'Cancel',
        onConfirm: async () => {
          setIsProcessing(true);
          try {
            await processRefund({
              refundRequestId: req_0.id,
              action: 'approve'
            });
            showAlert({
              title: '✅ Approved',
              message: 'Refund has been approved and processed.',
              type: 'success'
            });
            onRefresh();
          } catch (e: any) {
            showAlert({
              title: 'Error',
              message: e.message || 'Could not approve refund.',
              type: 'error'
            });
          } finally {
            setIsProcessing(false);
          }
        }
      });
    };
    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return /*#__PURE__*/<View style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
      }}>{/*#__PURE__*/<Ionicons name={"shield-checkmark-outline"} size={64} color={"#dc2626"} />}{/*#__PURE__*/<Text style={{
          fontSize: 22,
          fontWeight: '900',
          color: theme.colors.text,
          marginTop: 16,
          textAlign: 'center'
        }}>Admin Access Required</Text>}{/*#__PURE__*/<Text style={{
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 20
        }}>Refund management and approval (UC33) is strictly restricted to resort Administrators.</Text>}{/*#__PURE__*/<TouchableOpacity style={{
          backgroundColor: theme.colors.secondary,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 16,
          marginTop: 24
        }} onPress={() => router.back()}>{/*#__PURE__*/<Text style={{
            color: '#ffffff',
            fontWeight: '800',
            fontSize: 16
          }}>Back</Text>}</TouchableOpacity>}</View>;
    }
    let openRejectModal = (req_1: any) => {
      setRejectTarget(req_1);
      setRejectReason('');
    };
    let handleReject = async () => {
      if (!rejectTarget) return;
      if (!rejectReason.trim()) {
        showAlert({
          title: 'Reason Required',
          message: 'Please provide a rejection reason.',
          type: 'warning'
        });
        return;
      }
      setIsProcessing(true);
      try {
        await processRefund({
          refundRequestId: rejectTarget.id,
          action: 'reject',
          rejectionReason: rejectReason
        });
        showAlert({
          title: 'Rejected',
          message: 'Refund request has been rejected.',
          type: 'info'
        });
        setRejectTarget(null);
        onRefresh();
      } catch (e_1: any) {
        showAlert({
          title: 'Error',
          message: e_1.message || 'Could not reject refund.',
          type: 'error'
        });
      } finally {
        setIsProcessing(false);
      }
    };
    let filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus);
    let pending = requests.filter(r_1 => r_1.status === 'pending').length;
    let approved = requests.filter(r_2 => r_2.status === 'approved').length;
    let rejected = requests.filter(r_3 => r_3.status === 'rejected').length;
    let pendingValue = requests.filter(r_4 => r_4.status === 'pending').reduce((s, r_5) => s + (r_5.requestedAmount || 0), 0);
    let handleGoBack = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(staff)/staff-dashboard');
      }
    };
    return /*#__PURE__*/<SafeAreaView style={S.container}>{/*#__PURE__*/<ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false} refreshControl={/*#__PURE__*/<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>{/*#__PURE__*/<View style={S.headerRow}>{/*#__PURE__*/<TouchableOpacity onPress={handleGoBack} style={S.backBtn}>{/*#__PURE__*/<Ionicons name={"chevron-back"} size={26} color={theme.colors.secondary} />}</TouchableOpacity>}{/*#__PURE__*/<View style={{
            flex: 1
          }}>{/*#__PURE__*/<Text style={S.title}>Refund Management</Text>}{/*#__PURE__*/<Text style={S.subtitle}>UC33 · Admin review of all refund requests</Text>}</View>}{/*#__PURE__*/<View style={{
            flexDirection: 'row',
            gap: 6
          }}>{/*#__PURE__*/<TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#f59e0b',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8
            }} onPress={() => setShowRiskInfoModal(true)}>{/*#__PURE__*/<Ionicons name={"information-circle"} size={16} color={"#fff"} style={{
                marginRight: 4
              }} />}{/*#__PURE__*/<Text style={{
                color: '#fff',
                fontWeight: '700',
                fontSize: 11
              }}>Risk Info ℹ️</Text>}</TouchableOpacity>}{/*#__PURE__*/<TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8
            }} onPress={() => setShowInvoiceModal(true)}>{/*#__PURE__*/<Ionicons name={"receipt"} size={16} color={"#fff"} style={{
                marginRight: 4
              }} />}{/*#__PURE__*/<Text style={{
                color: '#fff',
                fontWeight: '700',
                fontSize: 11
              }}>Invoices 🧾</Text>}</TouchableOpacity>}</View>}</View>}{!loading && /*#__PURE__*/<Fragment>{/*#__PURE__*/<View style={S.statsRow}>{/*#__PURE__*/<View style={[S.statBox, {
              backgroundColor: '#fef3c7'
            }]}>{/*#__PURE__*/<Text style={[S.statNum, {
                color: theme.colors.primary
              }]}>{pending}</Text>}{/*#__PURE__*/<Text style={[S.statLbl, {
                color: theme.colors.primary
              }]}>Pending</Text>}</View>}{/*#__PURE__*/<View style={[S.statBox, {
              backgroundColor: theme.colors.successLight
            }]}>{/*#__PURE__*/<Text style={[S.statNum, {
                color: theme.colors.success
              }]}>{approved}</Text>}{/*#__PURE__*/<Text style={[S.statLbl, {
                color: theme.colors.success
              }]}>Approved</Text>}</View>}{/*#__PURE__*/<View style={[S.statBox, {
              backgroundColor: theme.colors.errorLight
            }]}>{/*#__PURE__*/<Text style={[S.statNum, {
                color: theme.colors.error
              }]}>{rejected}</Text>}{/*#__PURE__*/<Text style={[S.statLbl, {
                color: theme.colors.error
              }]}>Rejected</Text>}</View>}</View>}{pending > 0 && /*#__PURE__*/<View style={S.pendingBanner}>{/*#__PURE__*/<Ionicons name={"alert-circle"} size={18} color={"#c9a227"} />}{/*#__PURE__*/<Text style={S.pendingBannerText}>R{pendingValue.toLocaleString()} pending approval across {pending} request{pending !== 1 ? 's' : ''}</Text>}</View>}</Fragment>}{/*#__PURE__*/<ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{
          marginBottom: 16
        }}>{['all', 'pending', 'approved', 'rejected'].map(f => {
            let isActive = filterStatus === f;
            return /*#__PURE__*/<TouchableOpacity key={f} style={[S.filterChip, isActive && {
              backgroundColor: theme.colors.secondary
            }]} onPress={() => setFilterStatus(f)}>{/*#__PURE__*/<Text style={[S.filterText, isActive && {
                color: '#fff'
              }]}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}{f === 'pending' && pending > 0 ? ` (${pending})` : ''}</Text>}</TouchableOpacity>;
          })}</ScrollView>}{loading ? /*#__PURE__*/<ActivityIndicator color={theme.colors.primary} style={{
          marginTop: 32
        }} /> : filtered.length === 0 ? /*#__PURE__*/<View style={S.emptyCard}>{/*#__PURE__*/<Ionicons name={"receipt-outline"} size={40} color={theme.colors.textMuted} />}{/*#__PURE__*/<Text style={S.emptyText}>{requests.length === 0 ? 'No refund requests yet' : 'No requests match this filter'}</Text>}</View> : filtered.map(req_2 => {
          let sc = statusConfig(theme, req_2.status || 'pending');
          return /*#__PURE__*/<View key={req_2.id} style={S.requestCard}>{/*#__PURE__*/<View style={S.cardTop}>{/*#__PURE__*/<View style={{
                flex: 1
              }}>{/*#__PURE__*/<Text style={S.eventName} numberOfLines={1}>{req_2.eventName || 'Unknown Event'}</Text>}{/*#__PURE__*/<Text style={S.cardDate}>{req_2.createdAt?.seconds ? new Date(req_2.createdAt.seconds * 1000).toLocaleDateString('en-ZA') : 'Unknown date'}</Text>}</View>}{/*#__PURE__*/<View style={{
                alignItems: 'flex-end',
                gap: 4
              }}>{/*#__PURE__*/<View style={[S.statusBadge, {
                  backgroundColor: sc.bg
                }]}>{/*#__PURE__*/<Ionicons name={sc.icon as any} size={12} color={sc.color} />}{/*#__PURE__*/<Text style={[S.statusText, {
                    color: sc.color
                  }]}>{sc.label}</Text>}</View>}{req_2.riskLevel && /*#__PURE__*/<View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: req_2.riskLevel === 'high' ? '#fef2f2' : req_2.riskLevel === 'medium' ? '#fffbeb' : '#f0fdf4',
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: req_2.riskLevel === 'high' ? theme.colors.error : req_2.riskLevel === 'medium' ? theme.colors.warning : theme.colors.success,
                  gap: 3
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 9
                  }}>{req_2.riskLevel === 'high' ? '🚨' : req_2.riskLevel === 'medium' ? '⚠️' : '✅'}</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 9,
                    fontWeight: '800',
                    color: req_2.riskLevel === 'high' ? theme.colors.error : req_2.riskLevel === 'medium' ? theme.colors.warning : theme.colors.success
                  }}>{req_2.riskLevel.toUpperCase()} RISK {req_2.riskScore}/100</Text>}</View>}</View>}</View>}{/*#__PURE__*/<View style={S.infoGrid}>{/*#__PURE__*/<View style={S.infoRow}>{/*#__PURE__*/<Text style={S.infoLabel}>Guest:</Text>}{/*#__PURE__*/<Text style={S.infoValue}>{req_2.guestName || '—'}</Text>}</View>}{/*#__PURE__*/<View style={S.infoRow}>{/*#__PURE__*/<Text style={S.infoLabel}>Amount:</Text>}{/*#__PURE__*/<Text style={[S.infoValue, {
                  color: theme.colors.error,
                  fontWeight: '800'
                }]}>R {(req_2.requestedAmount || 0).toLocaleString()}</Text>}</View>}{/*#__PURE__*/<View style={S.infoRow}>{/*#__PURE__*/<Text style={S.infoLabel}>Reason:</Text>}{/*#__PURE__*/<Text style={[S.infoValue, {
                  flex: 1,
                  textAlign: 'right'
                }]} numberOfLines={2}>{req_2.reason || '—'}</Text>}</View>}{req_2.rejectionReason && /*#__PURE__*/<View style={S.infoRow}>{/*#__PURE__*/<Text style={S.infoLabel}>Rejection:</Text>}{/*#__PURE__*/<Text style={[S.infoValue, {
                  color: theme.colors.error,
                  flex: 1,
                  textAlign: 'right'
                }]} numberOfLines={2}>{req_2.rejectionReason}</Text>}</View>}{req_2.reviewedAt?.seconds && /*#__PURE__*/<View style={S.infoRow}>{/*#__PURE__*/<Text style={S.infoLabel}>Reviewed:</Text>}{/*#__PURE__*/<Text style={S.infoValue}>{new Date(req_2.reviewedAt.seconds * 1000).toLocaleDateString('en-ZA')}</Text>}</View>}</View>}{req_2.proofImages && req_2.proofImages.length > 0 && /*#__PURE__*/<View style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border
            }}>{/*#__PURE__*/<View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                marginBottom: 8
              }}>{/*#__PURE__*/<Ionicons name={"images-outline"} size={14} color={theme.colors.primary} />}{/*#__PURE__*/<Text style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: theme.colors.text
                }}>Attached Photo Proof ({req_2.proofImages.length}):</Text>}</View>}{/*#__PURE__*/<ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>{/*#__PURE__*/<View style={{
                  flexDirection: 'row',
                  gap: 8
                }}>{req_2.proofImages.map((imgUri: any, imgIdx: any) => /*#__PURE__*/<TouchableOpacity key={imgIdx} onPress={() => setSelectedProofImage(imgUri)}>{/*#__PURE__*/<Image source={{
                      uri: imgUri
                    }} style={{
                      width: 64,
                      height: 64,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.colors.border
                    }} />}</TouchableOpacity>)}</View>}</ScrollView>}</View>}{req_2.status === 'pending' && /*#__PURE__*/<View style={S.actions}>{/*#__PURE__*/<TouchableOpacity style={[S.actionBtn, {
                backgroundColor: theme.colors.success
              }]} onPress={() => handleApprove(req_2)} disabled={isProcessing}>{/*#__PURE__*/<Ionicons name={"checkmark"} size={16} color={"#fff"} />}{/*#__PURE__*/<Text style={S.actionBtnText}>Approve</Text>}</TouchableOpacity>}{/*#__PURE__*/<TouchableOpacity style={[S.actionBtn, {
                backgroundColor: theme.colors.error
              }]} onPress={() => openRejectModal(req_2)} disabled={isProcessing}>{/*#__PURE__*/<Ionicons name={"close"} size={16} color={"#fff"} />}{/*#__PURE__*/<Text style={S.actionBtnText}>Reject</Text>}</TouchableOpacity>}</View>}</View>;
        })}</ScrollView>}{/*#__PURE__*/<Modal visible={!!rejectTarget} transparent={true} animationType={"slide"}>{/*#__PURE__*/<View style={S.modalOverlay}>{/*#__PURE__*/<View style={[S.modalSheet, {
            paddingBottom: 32
          }]}>{/*#__PURE__*/<View style={S.rejectIcon}>{/*#__PURE__*/<Ionicons name={"close-circle"} size={36} color={theme.colors.error} />}</View>}{/*#__PURE__*/<Text style={S.modalTitle}>Reject Refund</Text>}{/*#__PURE__*/<Text style={S.modalSub}>Reject R{(rejectTarget?.requestedAmount || 0).toLocaleString()} request for {rejectTarget?.guestName}?</Text>}{/*#__PURE__*/<Text style={[S.fieldLabel, {
              marginTop: 16
            }]}>Rejection Reason *</Text>}{/*#__PURE__*/<TextInput style={S.reasonInput} placeholder={"Provide a clear reason for rejection..."} placeholderTextColor={theme.colors.textMuted} multiline={true} numberOfLines={3} value={rejectReason} onChangeText={setRejectReason} autoFocus={true} />}{/*#__PURE__*/<View style={{
              flexDirection: 'row',
              gap: 12,
              marginTop: 16
            }}>{/*#__PURE__*/<TouchableOpacity style={[S.confirmBtn, {
                backgroundColor: theme.colors.border
              }]} onPress={() => setRejectTarget(null)}>{/*#__PURE__*/<Text style={{
                  color: theme.colors.text,
                  fontWeight: '600'
                }}>Cancel</Text>}</TouchableOpacity>}{/*#__PURE__*/<TouchableOpacity style={[S.confirmBtn, {
                backgroundColor: theme.colors.error,
                flex: 2
              }]} onPress={handleReject} disabled={isProcessing}>{isProcessing ? /*#__PURE__*/<ActivityIndicator color={"#fff"} /> : /*#__PURE__*/<Text style={{
                  color: '#fff',
                  fontWeight: '700'
                }}>Confirm Reject</Text>}</TouchableOpacity>}</View>}</View>}</View>}</Modal>}{/*#__PURE__*/<InvoiceViewerModal visible={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title={"🧾 Dispatched Refund Invoices"} />}{/*#__PURE__*/<Modal visible={showRiskInfoModal} transparent={true} animationType={"slide"} onRequestClose={() => setShowRiskInfoModal(false)}>{/*#__PURE__*/<View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>{/*#__PURE__*/<View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            padding: 22,
            width: '100%',
            maxWidth: 500,
            maxHeight: '85%'
          }}>{/*#__PURE__*/<View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>{/*#__PURE__*/<View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8
              }}>{/*#__PURE__*/<Ionicons name={"shield-checkmark"} size={24} color={"#f59e0b"} />}{/*#__PURE__*/<Text style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: theme.colors.text
                }}>Risk Score Guide 🛡️</Text>}</View>}{/*#__PURE__*/<TouchableOpacity onPress={() => setShowRiskInfoModal(false)}>{/*#__PURE__*/<Ionicons name={"close-circle"} size={26} color={theme.colors.textMuted} />}</TouchableOpacity>}</View>}{/*#__PURE__*/<ScrollView showsVerticalScrollIndicator={false}>{/*#__PURE__*/<Text style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                marginBottom: 16,
                lineHeight: 19
              }}>The anti-fraud engine calculates an automated {/*#__PURE__*/<Text style={{
                  fontWeight: '700',
                  color: theme.colors.text
                }}>Risk Score (0–100 Points)</Text>} for every refund request by evaluating 5 heuristic risk factors:</Text>}{/*#__PURE__*/<View style={{
                backgroundColor: theme.colors.surfaceVariant,
                padding: 14,
                borderRadius: 14,
                gap: 10,
                marginBottom: 16
              }}>{/*#__PURE__*/<View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: theme.colors.text
                  }}>💰 Amount {'>'} 150% Average</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: theme.colors.error
                  }}>+30 Points</Text>}</View>}{/*#__PURE__*/<Text style={{
                  fontSize: 11,
                  color: theme.colors.textMuted
                }}>Claimed amount exceeds 1.5× the resort average refund size.</Text>}{/*#__PURE__*/<View style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: theme.colors.text
                  }}>⚠️ Active Damage Conflict</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: theme.colors.error
                  }}>+25 Points</Text>}</View>}{/*#__PURE__*/<Text style={{
                  fontSize: 11,
                  color: theme.colors.textMuted
                }}>Guest booking has a recorded damage claim (UC30).</Text>}{/*#__PURE__*/<View style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: theme.colors.text
                  }}>🔁 {'>'}1 Prior Refund Claims</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: theme.colors.error
                  }}>+20 Points</Text>}</View>}{/*#__PURE__*/<Text style={{
                  fontSize: 11,
                  color: theme.colors.textMuted
                }}>Guest has previously submitted 2 or more refund requests.</Text>}{/*#__PURE__*/<View style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: theme.colors.text
                  }}>⏱️ Filed {'<'}24h Post-Event</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: theme.colors.error
                  }}>+15 Points</Text>}</View>}{/*#__PURE__*/<Text style={{
                  fontSize: 11,
                  color: theme.colors.textMuted
                }}>Claim filed immediately after event conclusion.</Text>}{/*#__PURE__*/<View style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: theme.colors.text
                  }}>💯 Full 100% Refund Claim</Text>}{/*#__PURE__*/<Text style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: theme.colors.error
                  }}>+10 Points</Text>}</View>}{/*#__PURE__*/<Text style={{
                  fontSize: 11,
                  color: theme.colors.textMuted
                }}>Claiming 100% refund of original paid amount.</Text>}</View>}{/*#__PURE__*/<Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: theme.colors.text,
                marginBottom: 8
              }}>Risk Classification Tiers:</Text>}{/*#__PURE__*/<View style={{
                backgroundColor: '#fef3c7',
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: '#f59e0b'
              }}>{/*#__PURE__*/<Text style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: '#b45309'
                }}>🟡 Medium Risk (40 – 69 Points)</Text>}{/*#__PURE__*/<Text style={{
                  fontSize: 12,
                  color: '#92400e',
                  marginTop: 4,
                  lineHeight: 17
                }}>{/*#__PURE__*/<Text style={{
                    fontWeight: '700'
                  }}>Example: 50 / 100 Points</Text>} (e.g. Amount above 150% of avg [+30 pts] + Guest has 2 prior requests [+20 pts]). Moderately elevated risk requiring standard manager review before approval.</Text>}</View>}{/*#__PURE__*/<View style={{
                backgroundColor: '#fef2f2',
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: '#ef4444'
              }}>{/*#__PURE__*/<Text style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: '#991b1b'
                }}>🔴 High Risk (70 – 100 Points)</Text>}{/*#__PURE__*/<Text style={{
                  fontSize: 12,
                  color: '#7f1d1d',
                  marginTop: 4,
                  lineHeight: 17
                }}>High fraud or damage conflict probability. Requires mandatory Admin override and conflict review.</Text>}</View>}{/*#__PURE__*/<View style={{
                backgroundColor: '#f0fdf4',
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#22c55e'
              }}>{/*#__PURE__*/<Text style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: '#166534'
                }}>🟢 Low Risk (0 – 39 Points)</Text>}{/*#__PURE__*/<Text style={{
                  fontSize: 12,
                  color: '#14532d',
                  marginTop: 4,
                  lineHeight: 17
                }}>Standard refund claim with minimal risk factors. High confidence for processing.</Text>}</View>}{/*#__PURE__*/<TouchableOpacity style={{
                backgroundColor: theme.colors.primary,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center'
              }} onPress={() => setShowRiskInfoModal(false)}>{/*#__PURE__*/<Text style={{
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: 14
                }}>Got It!</Text>}</TouchableOpacity>}</ScrollView>}</View>}</View>}</Modal>}{/*#__PURE__*/<Modal visible={!!selectedProofImage} transparent={true} animationType={"fade"} onRequestClose={() => setSelectedProofImage(null)}>{/*#__PURE__*/<View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>{/*#__PURE__*/<TouchableOpacity style={{
            position: 'absolute',
            top: 50,
            right: 20,
            zIndex: 10,
            padding: 8
          }} onPress={() => setSelectedProofImage(null)}>{/*#__PURE__*/<Ionicons name={"close-circle"} size={36} color={"#fff"} />}</TouchableOpacity>}{selectedProofImage && /*#__PURE__*/<Image source={{
            uri: selectedProofImage
          }} style={{
            width: '100%',
            height: '80%',
            resizeMode: 'contain',
            borderRadius: 12
          }} />}</View>}</Modal>}{/*#__PURE__*/<CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({
        ...prev,
        visible: false
      }))} />}</SafeAreaView>;
  }

export default RefundManagementAdminScreen;

    const createStyles = (theme: any) => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    content: {
      padding: 20,
      paddingTop: 16,
      paddingBottom: 40
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center'
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.colors.text
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10
    },
    statBox: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      alignItems: 'center'
    },
    statNum: {
      fontSize: 24,
      fontWeight: '800'
    },
    statLbl: {
      fontSize: 11,
      fontWeight: '600'
    },
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fef3c7',
      padding: 12,
      borderRadius: 12,
      marginBottom: 16
    },
    pendingBannerText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#92400e',
      flex: 1
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      marginRight: 8,
      backgroundColor: theme.colors.surfaceVariant
    },
    filterText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary
    },
    emptyCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 32,
      alignItems: 'center',
      gap: 8
    },
    emptyText: {
      fontSize: 15,
      color: theme.colors.textMuted,
      fontWeight: '600'
    },
    requestCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2
      },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12
    },
    eventName: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text
    },
    cardDate: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700'
    },
    infoGrid: {
      gap: 0
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border
    },
    infoLabel: {
      fontSize: 13,
      color: theme.colors.textMuted,
      fontWeight: '500',
      flex: 0.4
    },
    infoValue: {
      fontSize: 13,
      color: theme.colors.text,
      fontWeight: '600'
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10
    },
    actionBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end'
    },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20
    },
    rejectIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.errorLight,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
      marginBottom: 12
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.text,
      textAlign: 'center'
    },
    modalSub: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: 4
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8
    },
    reasonInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      color: theme.colors.text,
      textAlignVertical: 'top',
      minHeight: 80
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center'
    }
  });
