import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../screens/HomeScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import type { HomeStackParamList } from "./types";

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: "Notifications" }}
      />
    </Stack.Navigator>
  );
}
