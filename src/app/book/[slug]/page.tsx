import { PublicLiteBookingPage } from "@/components/lite/public-lite-booking-page";

export const dynamic = "force-dynamic";

export default async function LiteBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicLiteBookingPage slug={slug} />;
}
