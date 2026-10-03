import { CourtsScreen } from "../src/screens/CourtsScreen";
import { RouteErrorState } from "../src/components/AppShell";

export default function CourtsRoute() {
  return <CourtsScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}
