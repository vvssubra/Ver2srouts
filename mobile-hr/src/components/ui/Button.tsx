import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { color, font, radius } from "../../theme/tokens";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  style?: ViewStyle;
};

export function Button({ label, onPress, loading, disabled, variant = "primary", style }: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#FFFFFF" : color.primary} />
      ) : (
        <Text style={variant === "primary" ? styles.primaryLabel : styles.ghostLabel}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primary: {
    backgroundColor: color.primary,
    shadowColor: color.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  disabled: {
    opacity: 0.55,
  },
  primaryLabel: {
    fontFamily: font.semibold,
    fontSize: 15.5,
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  ghostLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: color.primary,
  },
});
