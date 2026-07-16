import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, space } from "../../theme/tokens";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};

export function EmptyState({ icon, title, message }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={22} color={color.inkFaint} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
    marginBottom: 4,
    textAlign: "center",
  },
  message: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.inkMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
});
