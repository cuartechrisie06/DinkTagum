import { HomeScreen } from "../src/screens/HomeScreen";
import { RouteErrorState } from "../src/components/AppShell";

export default function HomeRoute() {
  return <HomeScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}
