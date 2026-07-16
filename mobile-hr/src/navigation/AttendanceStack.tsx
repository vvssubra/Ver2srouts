import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AttendanceScreen } from "../screens/AttendanceScreen";
import type { AttendanceStackParamList } from "./types";

const Stack = createNativeStackNavigator<AttendanceStackParamList>();

export function AttendanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Attendance" component={AttendanceScreen} />
    </Stack.Navigator>
  );
}
