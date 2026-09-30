import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '@/design/tokens';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle" size={64} color={lightTheme.colors.error} style={styles.icon} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error?.message}</Text>
          <View style={styles.stack}>
            <Text style={styles.stackText}>{this.state.error?.stack}</Text>
          </View>
          <Button title="Reload App" onPress={() => this.setState({ hasError: false, error: null })} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.errorSoft,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: lightTheme.colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: lightTheme.colors.errorStrong,
    marginBottom: 16,
    textAlign: 'center',
  },
  stack: {
    backgroundColor: lightTheme.colors.errorSoft,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    maxWidth: '100%',
  },
  stackText: {
    fontSize: 11,
    color: lightTheme.colors.errorStrong,
    fontFamily: 'monospace',
  },
});

export default ErrorBoundary;