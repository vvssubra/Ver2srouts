import Svg, { Path } from "react-native-svg";
import { View, StyleSheet } from "react-native";
import { color, radius } from "../../theme/tokens";

/**
 * Abstract two-leaf sprout glyph, hand-drawn — deliberately not the
 * cartoon mascot used on the parent-facing app. Staff tools read as
 * professional software, not a kids' product.
 */
function SproutGlyph({ size = 22, tone = "#FFFFFF" }: { size?: number; tone?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M24 41L24 30" stroke={tone} strokeWidth={2.75} strokeLinecap="round" />
      <Path
        d="M24 30C13.76 26.75 9.34 19.61 11 9C18.69 13.83 23.11 20.97 24 30Z"
        fill={tone}
      />
      <Path
        d="M24 30C34.24 26.75 38.66 19.61 37 9C29.31 13.83 24.89 20.97 24 30Z"
        fill={tone}
        opacity={0.88}
      />
    </Svg>
  );
}

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius.lg },
      ]}
    >
      <SproutGlyph size={size * 0.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
