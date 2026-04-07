import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Profil</ThemedText>
      <ThemedText style={styles.subtitle}>
        Profilsiden er tilgjengelig. Legg til innstillinger og kontoinfo her.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 10,
  },
  subtitle: {
    lineHeight: 22,
  },
});
