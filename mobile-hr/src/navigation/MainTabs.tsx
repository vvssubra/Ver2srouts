import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { HomeStack } from "./HomeStack";
import { AttendanceStack } from "./AttendanceStack";
import { LeaveStack } from "./LeaveStack";
import { MoreStack } from "./MoreStack";
import { color, font } from "../theme/tokens";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home",
  AttendanceTab: "location",
  LeaveTab: "calendar",
  MoreTab: "grid",
};

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: color.inkFaint,
        tabBarStyle: { borderTopColor: color.border },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarIcon: ({ color: tint, size }) => (
          <Ionicons name={ICONS[route.name as keyof MainTabParamList]} size={size} color={tint} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: "Home" }} />
      <Tab.Screen name="AttendanceTab" component={AttendanceStack} options={{ title: "Attendance" }} />
      <Tab.Screen name="LeaveTab" component={LeaveStack} options={{ title: "Leave" }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
