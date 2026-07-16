import { NavigationContainer } from "@react-navigation/native";
import { View } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";
import { LoadingState } from "../components/ui/LoadingState";
import { LoginScreen } from "../screens/LoginScreen";
import { MainTabs } from "./MainTabs";
import { color } from "../theme/tokens";

export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, justifyContent: "center" }}>
        <LoadingState label="Getting things ready…" />
      </View>
    );
  }

  return (
    <NavigationContainer>{session ? <MainTabs /> : <LoginScreen />}</NavigationContainer>
  );
}
