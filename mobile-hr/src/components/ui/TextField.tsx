import { forwardRef, useState } from "react";
import {
  BlurEvent,
  FocusEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, space } from "../../theme/tokens";

type Props = TextInputProps & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  secureToggle?: boolean;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, icon, error, secureToggle, secureTextEntry, onFocus, onBlur, style, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecure = secureToggle ? !revealed : secureTextEntry;

  const handleFocus = (e: FocusEvent) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: BlurEvent) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={error ? color.danger : focused ? color.primary : color.inkFaint}
          style={styles.icon}
        />
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={color.inkFaint}
          secureTextEntry={isSecure}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
            style={styles.toggle}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={color.inkMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={13} color={color.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space.lg,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: space.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    height: 52,
  },
  fieldFocused: {
    borderColor: color.primary,
    shadowColor: color.primary,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fieldError: {
    borderColor: color.danger,
  },
  icon: {
    marginRight: space.sm,
  },
  input: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    color: color.ink,
    height: "100%",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  toggle: {
    paddingLeft: space.sm,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.sm,
  },
  errorText: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.danger,
  },
});
