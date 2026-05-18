import type { Metadata } from "next";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{
    zip: string;
  }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { zip } = await params;

  return {
    title: `Free stuff near ${zip} | JobFray`,
    description:
      `Browse free local items and curb alerts near ZIP ${zip}.`,
  };
}

export default async function FreeStuffZipPage({
  params,
}: Props): Promise<never> {
  const { zip } = await params;

  redirect(`/free-stuff?zip=${zip}&radius=10`);
}