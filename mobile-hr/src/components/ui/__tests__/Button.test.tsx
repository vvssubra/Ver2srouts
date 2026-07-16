import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../Button";

describe("Button", () => {
  it("calls onPress when tapped", async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" onPress={onPress} />);
    fireEvent.press(screen.getByText("Sign in"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress while loading", async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" onPress={onPress} loading />);
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("does not call onPress while disabled", async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText("Sign in"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
