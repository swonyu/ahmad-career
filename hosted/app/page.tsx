import PhonePage from "./phone/page";

export { metadata, viewport } from "./phone/page";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  return PhonePage();
}
