import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LeaveScreen } from "../screens/LeaveScreen";
import type { LeaveStackParamList } from "./types";

const Stack = createNativeStackNavigator<LeaveStackParamList>();

export function LeaveStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Leave" component={LeaveScreen} />
    </Stack.Navigator>
  );
}
