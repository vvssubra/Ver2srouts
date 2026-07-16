import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./Button";
import { color, font, space } from "../../theme/tokens";

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ message = "Something went wrong. Please try again.", onRetry }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={26} color={color.danger} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button label="Retry" variant="ghost" onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  message: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.inkMuted,
    textAlign: "center",
  },
  retry: {
    marginTop: space.xs,
  },
});
