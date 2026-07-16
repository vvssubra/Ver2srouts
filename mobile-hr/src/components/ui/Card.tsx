import { Pressable, StyleSheet, View, ViewProps } from "react-native";
import { color, radius, space } from "../../theme/tokens";

type Props = ViewProps & {
  onPress?: () => void;
};

export function Card({ style, onPress, children, ...rest }: Props) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style as object]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
