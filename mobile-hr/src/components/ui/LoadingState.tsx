import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { color, font, space } from "../../theme/tokens";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={color.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xxxl,
    gap: space.md,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
  },
});
