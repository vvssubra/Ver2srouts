import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/MoreScreen";
import { ClaimsScreen } from "../screens/ClaimsScreen";
import { OvertimeScreen } from "../screens/OvertimeScreen";
import { PayslipsScreen } from "../screens/PayslipsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import type { MoreStackParamList } from "./types";

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="More" component={MoreScreen} />
      <Stack.Screen name="Claims" component={ClaimsScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Overtime" component={OvertimeScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Payslips" component={PayslipsScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}
