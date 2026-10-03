import { ProfileScreen } from "../src/screens/ProfileScreen";
import { RouteErrorState } from "../src/components/AppShell";

export default function ProfileRoute() {
  return <ProfileScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}
