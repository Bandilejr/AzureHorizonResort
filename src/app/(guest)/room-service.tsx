import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

// UPDATED IMPORTS: Consolidated and added Firestore query tools
import { auth, db, createServiceRequest, uploadImage, listenForServiceRequests } from '../../services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface RoomServiceProps {
  onBack?: () => void;
}

export default function RoomService({ onBack }: RoomServiceProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [requests, setRequests] = useState<any[]>([]);
  const [requestType, setRequestType] = useState<'housekeeping' | 'maintenance'>('housekeeping');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // NEW: State to hold the custom Firestore user profile
  const [userData, setUserData] = useState<any>(null);
  const user = auth.currentUser;

  // NEW: Fetch the custom user profile to get the real name and room number
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      try {
        const usersRef = collection(db, 'users'); 
        const q = query(usersRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setUserData(querySnapshot.docs[0].data());
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, [user]);

  // Listen for requests
  useEffect(() => {
    if (!user) return;

    const unsubscribe = listenForServiceRequests((allRequests: any[]) => {
      const myRequests = allRequests.filter(req => req.guestId === user.uid);
      setRequests(myRequests.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // Handle Native Image Picker (Camera & Gallery Options)
  const pickImage = () => {
    showAlert({
      title: "Add a Photo",
      message: "Would you like to take a new photo or choose one from your gallery?",
      type: "info",
      confirmText: "Take Photo",
      cancelText: "Choose Gallery",
      onConfirm: async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
          showAlert({ title: "Permission Required", message: "You need to allow camera access to take a photo.", type: "warning" });
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.5,
        });
        if (!result.canceled) {
          setImageUri(result.assets[0].uri);
        }
      },
      onCancel: async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
          showAlert({ title: "Permission Required", message: "You need to allow camera roll permissions to upload a photo.", type: "warning" });
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.5,
        });
        if (!result.canceled) {
          setImageUri(result.assets[0].uri);
        }
      }
    });
  };

  const handleSubmit = async () => {
    if (!description.trim() || !user) return;
    setIsSubmitting(true);

    try {
      let uploadedUrl = null;

      if (imageUri) {
        const uploadResult = await uploadImage(imageUri, `service_requests/${Date.now()}`);
        if (uploadResult) uploadedUrl = uploadResult;
      }

      await createServiceRequest({
        guestId: user.uid,
        guestName: userData?.name || user.displayName || 'Guest',
        roomNumber: userData?.roomNumber || 'TBD', 
        type: requestType,
        description,
        status: 'pending',
        imageUrl: uploadedUrl,
        createdAt: new Date().toISOString()
      });

      setDescription('');
      setImageUri(null);
      setShowSuccessModal(true);
      setActiveTab('history');
      
    } catch (error: any) {
      console.error("Submission failed:", error);
      showAlert({ title: "Error", message: "Failed to submit request. Please try again.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };
  // UI Helpers
  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'in_progress');
  const completedRequests = requests.filter(r => r.status === 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return theme.colors.warning;
      case 'in_progress': return theme.colors.info;
      case 'completed': return theme.colors.success;
      default: return theme.colors.textMuted;
    }
  };

  const getQuickAddOptions = () => {
    if (requestType === 'housekeeping') {
      return ["Extra Towels", "Room Cleaning", "More Toiletries", "Coffee Refill"];
    }
    return ["AC Not Working", "Light Bulb Out", "Plumbing Issue", "TV Remote"];
  };

  if (!user || userData?.status === 'visitor') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={64} color={theme.colors.gold} />
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 16, textAlign: 'center' }}>
          Room Service Locked
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Housekeeping and maintenance requests are reserved for checked-in resort residents. Please sign in to your room stay.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 24 }}
          onPress={() => router.push('/login')}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Sign In to Your Stay</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={60} color={theme.colors.success} />
            </View>
            <Text style={styles.modalTitle}>Request Sent!</Text>
            <Text style={styles.modalText}>
              Your {requestType} request has been submitted. Our team will attend to it shortly.
            </Text>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.modalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Service Portal</Text>
          <Text style={styles.headerSubtitle}>Housekeeping & Maintenance</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'new' && styles.activeTab]}
          onPress={() => setActiveTab('new')}
        >
          <Text style={[styles.tabText, activeTab === 'new' && styles.activeTabText]}>New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History ({pendingRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {activeTab === 'new' ? (
          <View style={styles.newRequestContainer}>
            
            {/* Type Selector */}
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeButton, requestType === 'housekeeping' && styles.typeButtonActiveHK]}
                onPress={() => setRequestType('housekeeping')}
              >
                <Ionicons name="home" size={20} color={requestType === 'housekeeping' ? theme.colors.textInverse : theme.colors.textMuted} />
                <Text style={[styles.typeButtonText, requestType === 'housekeeping' && styles.typeButtonTextActive]}>Housekeeping</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.typeButton, requestType === 'maintenance' && styles.typeButtonActiveMaint]}
                onPress={() => setRequestType('maintenance')}
              >
                <Ionicons name="build" size={20} color={requestType === 'maintenance' ? theme.colors.textInverse : theme.colors.textMuted} />
                <Text style={[styles.typeButtonText, requestType === 'maintenance' && styles.typeButtonTextActive]}>Maintenance</Text>
              </TouchableOpacity>
            </View>

            {/* Input Area */}
            <Text style={styles.label}>Request Details</Text>
            <TextInput
              style={styles.textInput}
              multiline
              numberOfLines={4}
              placeholder={requestType === 'housekeeping' ? "e.g., We need extra towels..." : "e.g., The AC is making a strange noise..."}
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />

            {/* Quick Add Pills */}
            <Text style={styles.quickAddLabel}>Quick Select:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickAddScroll}>
              {getQuickAddOptions().map((opt, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.quickAddPill}
                  onPress={() => setDescription(description ? `${description}, ${opt}` : opt)}
                >
                  <Text style={styles.quickAddText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Image Upload */}
            <Text style={styles.label}>Attachment (Optional)</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={pickImage}>
              {imageUri ? (
                <View style={styles.uploadedContainer}>
                  <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
                  <View style={styles.uploadOverlay}>
                    <Ionicons name="swap-horizontal" size={24} color={theme.colors.textInverse} />
                    <Text style={styles.uploadOverlayText}>Change Photo</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadEmpty}>
                  <Ionicons name="camera-outline" size={32} color={theme.colors.textMuted} />
                  <Text style={styles.uploadText}>Tap to add a photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity 
              style={[styles.submitButton, (!description.trim() || isSubmitting) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!description.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>Submit Request</Text>
              )}
            </TouchableOpacity>

          </View>
        ) : (
          
          <View style={styles.historyContainer}>
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : requests.length === 0 ? (
              <EmptyState icon="notifications-off-outline" title="No service requests yet." />
            ) : (
              <View>
                {requests.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <View style={styles.requestTypeBadge}>
                        <Ionicons 
                          name={req.type === 'housekeeping' ? 'home' : 'build'} 
                          size={14} 
                          color={req.type === 'housekeeping' ? theme.colors.info : theme.colors.warning} 
                        />
                        <Text style={styles.requestTypeText}>{req.type.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(req.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(req.status) }]}>
                          {req.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={styles.requestDesc}>{req.description}</Text>
                    
                    {req.imageUrl && (
                      <Image source={{ uri: req.imageUrl }} style={styles.requestImage} />
                    )}

                    <View style={styles.requestFooter}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.requestTime}>
                        {new Date(req.createdAt).toLocaleDateString()} at {new Date(req.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    padding: 4,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  activeTabText: {
    color: theme.colors.text,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  newRequestContainer: {
    gap: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  typeButtonActiveHK: {
    backgroundColor: theme.colors.info,
    borderColor: theme.colors.info,
  },
  typeButtonActiveMaint: {
    backgroundColor: theme.colors.warning,
    borderColor: theme.colors.warning,
  },
  typeButtonText: {
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  typeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 120,
  },
  quickAddLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: -8,
  },
  quickAddScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  quickAddPill: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  quickAddText: {
    fontSize: 12,
    color: theme.colors.info,
    fontWeight: '500',
  },
  uploadBox: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 140,
    overflow: 'hidden',
  },
  uploadEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    color: theme.colors.textMuted,
    marginTop: 8,
    fontSize: 14,
  },
  uploadedContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlayText: {
    color: theme.colors.textInverse,
    fontWeight: '600',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: theme.colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.borderStrong,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyContainer: {
    gap: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyStateText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    marginTop: 16,
  },
  requestCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  requestDesc: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 12,
  },
  requestImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  successIconContainer: {
    backgroundColor: theme.colors.successLight,
    borderRadius: 50,
    padding: 16,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: theme.colors.secondary,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
