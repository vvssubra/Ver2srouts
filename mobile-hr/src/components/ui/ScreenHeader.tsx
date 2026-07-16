import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, font, space } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function ScreenHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: font.extrabold,
    fontSize: 24,
    color: color.ink,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.inkMuted,
  },
});
