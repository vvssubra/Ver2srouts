import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { Card } from "../components/ui/Card";
import { useAuth } from "../lib/auth/AuthProvider";
import { color, font, space } from "../theme/tokens";
import type { MoreStackParamList } from "../navigation/types";

const ROWS: {
  key: keyof MoreStackParamList;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "Claims", label: "Claims", description: "Submit and track expense claims", icon: "receipt-outline" },
  { key: "Overtime", label: "Overtime", description: "Submit and track OT requests", icon: "time-outline" },
  { key: "Payslips", label: "Payslips", description: "View your pay history", icon: "document-text-outline" },
  { key: "Profile", label: "Profile", description: "Your details and documents", icon: "person-outline" },
];

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { signOut } = useAuth();

  return (
    <ScreenContainer>
      <ScreenHeader title="More" />
      <View style={styles.list}>
        {ROWS.map((row) => (
          <Card key={row.key} onPress={() => navigation.navigate(row.key as never)} style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name={row.icon} size={18} color={color.primary} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowDescription}>{row.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.inkFaint} />
          </Card>
        ))}

        <Card onPress={signOut} style={[styles.row, styles.signOutRow]}>
          <View style={[styles.rowIcon, styles.signOutIcon]}>
            <Ionicons name="log-out-outline" size={18} color={color.danger} />
          </View>
          <View style={styles.rowTextCol}>
            <Text style={[styles.rowLabel, styles.signOutLabel]}>Sign out</Text>
          </View>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextCol: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  rowDescription: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  signOutRow: {
    marginTop: space.lg,
  },
  signOutIcon: {
    backgroundColor: color.dangerSoft,
  },
  signOutLabel: {
    color: color.danger,
  },
});
