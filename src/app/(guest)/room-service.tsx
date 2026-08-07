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
import * as ImagePicker from 'expo-image-picker';

// UPDATED IMPORTS: Consolidated and added Firestore query tools
import { auth, db, createServiceRequest, uploadImage, listenForServiceRequests } from '../../services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface RoomServiceProps {
  onBack?: () => void;
}

export default function RoomService({ onBack }: RoomServiceProps) {
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

// Handle Native Image Picker (Camera & Gallery Options)
  const pickImage = () => {
    Alert.alert(
      "Add a Photo",
      "Would you like to take a new photo or choose one from your gallery?",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.granted === false) {
              Alert.alert("Permission Required", "You need to allow camera access to take a photo.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'], // Using the new array format to fix the warning
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.5,
            });
            if (!result.canceled) {
              setImageUri(result.assets[0].uri);
            }
          }
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.granted === false) {
              Alert.alert("Permission Required", "You need to allow camera roll permissions to upload a photo.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'], // Using the new array format to fix the warning
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.5,
            });
            if (!result.canceled) {
              setImageUri(result.assets[0].uri);
            }
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const handleSubmit = async () => {
    if (!description.trim() || !user) return;
    setIsSubmitting(true);

    try {
      let uploadedUrl = null;

      if (imageUri) {
        const uploadResult = await uploadImage(imageUri, `service_requests/${Date.now()}`);
        if (uploadResult.url) uploadedUrl = uploadResult.url;
      }

      // UPDATED: Dynamically inject name and room number from userData
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
      Alert.alert("Error", "Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  // UI Helpers
  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'in_progress');
  const completedRequests = requests.filter(r => r.status === 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'in_progress': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return '#64748b';
    }
  };

  const getQuickAddOptions = () => {
    if (requestType === 'housekeeping') {
      return ["Extra Towels", "Room Cleaning", "More Toiletries", "Coffee Refill"];
    }
    return ["AC Not Working", "Light Bulb Out", "Plumbing Issue", "TV Remote"];
  };

  return (
    <View style={styles.container}>
      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={60} color="#10b981" />
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
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
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
                <Ionicons name="home" size={20} color={requestType === 'housekeeping' ? '#fff' : '#64748b'} />
                <Text style={[styles.typeButtonText, requestType === 'housekeeping' && styles.typeButtonTextActive]}>Housekeeping</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.typeButton, requestType === 'maintenance' && styles.typeButtonActiveMaint]}
                onPress={() => setRequestType('maintenance')}
              >
                <Ionicons name="build" size={20} color={requestType === 'maintenance' ? '#fff' : '#64748b'} />
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
              placeholderTextColor="#94a3b8"
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
                    <Ionicons name="swap-horizontal" size={24} color="#fff" />
                    <Text style={styles.uploadOverlayText}>Change Photo</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadEmpty}>
                  <Ionicons name="camera-outline" size={32} color="#94a3b8" />
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
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Request</Text>
              )}
            </TouchableOpacity>

          </View>
        ) : (
          
          <View style={styles.historyContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#1e3a5f" style={{ marginTop: 40 }} />
            ) : requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-off-outline" size={60} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No service requests yet.</Text>
              </View>
            ) : (
              <View>
                {requests.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <View style={styles.requestTypeBadge}>
                        <Ionicons 
                          name={req.type === 'housekeeping' ? 'home' : 'build'} 
                          size={14} 
                          color={req.type === 'housekeeping' ? '#0284c7' : '#ea580c'} 
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
                      <Ionicons name="time-outline" size={14} color="#94a3b8" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a5f',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#c9a227',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#1e3a5f',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  typeButtonActiveHK: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  typeButtonActiveMaint: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  typeButtonText: {
    fontWeight: '600',
    color: '#64748b',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e3a5f',
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 120,
  },
  quickAddLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -8,
  },
  quickAddScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  quickAddPill: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  quickAddText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '500',
  },
  uploadBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
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
    color: '#94a3b8',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlayText: {
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#fff',
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
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 16,
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
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
    color: '#64748b',
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
    color: '#334155',
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
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  successIconContainer: {
    backgroundColor: '#ecfdf5',
    borderRadius: 50,
    padding: 16,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#1e3a5f',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
