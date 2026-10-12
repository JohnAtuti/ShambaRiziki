// App.tsx (excerpt)
import { BackHandler, Alert } from 'react-native';
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

// In your root navigator component:
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    // Let React Navigation handle it first
    // If no screen can go back, show exit confirmation
    if (!navigation.canGoBack()) {
      Alert.alert(
        'Exit app?',
        'Do you want to close the app? / Unataka kufunga programu?',
        [
          { text: 'No / Hapana', style: 'cancel' },
          { text: 'Yes / Ndiyo', onPress: () => BackHandler.exitApp() },
        ]
      );
      return true; // block default
    }
    return false;
  });
  return () => sub.remove();
}, [navigation]);