import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../services/firebase-services';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';

interface Message {
  id: string;
  text: string;
  sender: 'guest' | 'concierge';
  timestamp: Date;
}

export default function ConciergeScreen() {
  const user = auth.currentUser;
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Initial Greeting
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      text: `Welcome to Azure Horizon, ${user?.displayName?.split(' ')[0] || 'Guest'}! I am your digital concierge. How can I assist you today?`,
      sender: 'concierge',
      timestamp: new Date()
    }
  ]);

  // Auto-scroll to bottom when a new message arrives
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newGuestMsg: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'guest',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newGuestMsg]);
    setInputText('');
    Keyboard.dismiss();
    
    // Simulate Concierge Reply for Presentation Purposes
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const autoReply: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'd be happy to help you with that right away. I have notified the front desk team, and they will attend to your request momentarily.",
        sender: 'concierge',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, autoReply]);
    }, 1500); // 1.5 second delay makes it feel real!
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Screen scroll={false} padded={false}>
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Digital Concierge</Text>
          <Text style={styles.headerSubtitle}>Online • Replies instantly</Text>
        </View>
        <TouchableOpacity style={styles.callBtn}>
          <Ionicons name="call" size={22} color={theme.colors.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={styles.chatContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateChip}>
          <Text style={styles.dateText}>Today</Text>
        </View>

        {messages.map((msg) => {
          const isGuest = msg.sender === 'guest';
          return (
            <View key={msg.id} style={[styles.messageWrapper, isGuest ? styles.messageWrapperGuest : styles.messageWrapperConcierge]}>
              {!isGuest && (
                <View style={styles.avatar}>
<Ionicons name="sparkles" size={16} color={theme.colors.textInverse} />
                </View>
              )}
              
              <View style={[styles.messageBubble, isGuest ? styles.bubbleGuest : styles.bubbleConcierge]}>
                <Text style={[styles.messageText, isGuest ? styles.textGuest : styles.textConcierge]}>
                  {msg.text}
                </Text>
                <Text style={[styles.timeText, isGuest ? styles.timeGuest : styles.timeConcierge]}>
                  {formatTime(msg.timestamp)}
                </Text>
              </View>
            </View>
          );
        })}

        {isTyping && (
          <View style={[styles.messageWrapper, styles.messageWrapperConcierge]}>
            <View style={styles.avatar}>
              <Ionicons name="sparkles" size={16} color={theme.colors.textInverse} />
            </View>
            <View style={[styles.messageBubble, styles.bubbleConcierge, { paddingVertical: 12 }]}>
              <Text style={styles.typingText}>Concierge is typing...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* INPUT AREA */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachBtn}>
          <Ionicons name="add-circle-outline" size={28} color={theme.colors.textMuted} />
        </TouchableOpacity>
        
        <TextInput
          style={styles.input}
          placeholder="Type your request here..."
          placeholderTextColor={theme.colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={200}
        />
        
        <TouchableOpacity 
          style={[styles.sendBtn, inputText.trim() ? styles.sendBtnActive : styles.sendBtnInactive]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={18} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceVariant },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  headerSubtitle: { fontSize: 11, color: theme.colors.success, marginTop: 2 },
  callBtn: { padding: 4, marginRight: -4, backgroundColor: theme.colors.surfaceVariant, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chatContainer: { padding: 20, paddingBottom: 40 },
  dateChip: { alignSelf: 'center', backgroundColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 20 },
  dateText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: 'bold' },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, maxWidth: '85%' },
  messageWrapperGuest: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageWrapperConcierge: { alignSelf: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 'auto' },
  messageBubble: { padding: 14, borderRadius: 20 },
  bubbleGuest: { backgroundColor: theme.colors.secondary, borderBottomRightRadius: 4 },
  bubbleConcierge: { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  messageText: { fontSize: 15, lineHeight: 22 },
  textGuest: { color: theme.colors.textInverse },
  textConcierge: { color: theme.colors.text },
  timeText: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end' },
  timeGuest: { color: theme.colors.textMuted },
  timeConcierge: { color: theme.colors.textMuted },
  typingText: { color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingBottom: 30 },
  attachBtn: { padding: 8 },
  input: { flex: 1, backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxHeight: 100, fontSize: 15, marginHorizontal: 8, color: theme.colors.text },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  sendBtnActive: { backgroundColor: theme.colors.primary },
  sendBtnInactive: { backgroundColor: theme.colors.borderStrong }
});
