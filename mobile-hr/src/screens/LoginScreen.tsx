import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark } from "../components/ui/BrandMark";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { color, font, space } from "../theme/tokens";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string };

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = "Enter your work email";
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = "That email doesn't look right";
    if (!password) next.password = "Enter your password";
    return next;
  }

  function handleSubmit() {
    setNotice(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setNotice(
        "This draft isn't connected to Sprout accounts yet — sign-in will work once the backend is wired up."
      );
    }, 900);
  }

  function handleForgotPassword() {
    setNotice("Password reset isn't available in this preview yet.");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <BrandMark size={44} />
            <View style={styles.brandTextCol}>
              <Text style={styles.brandName}>Sprout</Text>
              <View style={styles.tag}>
                <Text style={styles.tagText}>STAFF</Text>
              </View>
            </View>
          </View>

          <View style={styles.headingBlock}>
            <View style={styles.eyebrow} />
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.subheading}>
              Use your work account to clock in, request leave, and check your payslips.
            </Text>
          </View>

          {notice ? (
            <View style={styles.notice}>
              <Ionicons name="information-circle" size={17} color={color.primary} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextField
              label="Work email"
              icon="mail-outline"
              placeholder="you@littlegreenhearts.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextField
              ref={passwordRef}
              label="Password"
              icon="lock-closed-outline"
              placeholder="Enter your password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
              error={errors.password}
              secureToggle
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            <View style={styles.row}>
              <View style={styles.rememberRow}>
                <Switch
                  value={remember}
                  onValueChange={setRemember}
                  trackColor={{ false: color.border, true: color.primarySoft }}
                  thumbColor={remember ? color.primary : "#FFFFFF"}
                  ios_backgroundColor={color.border}
                />
                <Text style={styles.rememberLabel}>Stay signed in</Text>
              </View>
              <Pressable onPress={handleForgotPassword} hitSlop={8}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>

            <Button label="Sign in" onPress={handleSubmit} loading={loading} style={styles.submit} />
          </View>

          <View style={styles.footer}>
            <View style={styles.divider} />
            <Text style={styles.footerText}>
              Trouble signing in?{" "}
              <Text style={styles.footerLink}>Contact your center administrator.</Text>
            </Text>
            <Text style={styles.versionText}>Sprout Staff · draft build</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: color.paper,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.xxxl,
  },
  brandTextCol: {
    gap: 4,
  },
  brandName: {
    fontFamily: font.bold,
    fontSize: 19,
    color: color.ink,
  },
  tag: {
    alignSelf: "flex-start",
    backgroundColor: color.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tagText: {
    fontFamily: font.semibold,
    fontSize: 10,
    color: color.primary,
    letterSpacing: 0.8,
  },
  headingBlock: {
    marginBottom: space.xxl,
  },
  eyebrow: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.accent,
    marginBottom: space.lg,
  },
  heading: {
    fontFamily: font.extrabold,
    fontSize: 28,
    color: color.ink,
    marginBottom: space.sm,
  },
  subheading: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: color.inkMuted,
    maxWidth: 320,
  },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: color.primarySoft,
    borderRadius: 12,
    padding: space.md,
    marginBottom: space.xl,
    alignItems: "flex-start",
  },
  noticeText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: color.primaryDark,
  },
  form: {
    marginBottom: space.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.xl,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  rememberLabel: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.inkMuted,
  },
  forgotLink: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: color.primary,
  },
  submit: {
    marginTop: space.xs,
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: color.border,
    marginBottom: space.xl,
  },
  footerText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.inkMuted,
    textAlign: "center",
    lineHeight: 19,
  },
  footerLink: {
    fontFamily: font.semibold,
    color: color.ink,
  },
  versionText: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.inkFaint,
    marginTop: space.lg,
  },
});
