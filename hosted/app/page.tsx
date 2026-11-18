import type { PageProps } from "./request-context";
import PhonePage from "./phone/page";

export { metadata, viewport } from "./phone/page";
export const dynamic = "force-dynamic";

export default function HomePage({ context }: PageProps) {
  return <PhonePage context={context} />;
}
