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
    title: `Jobs near ${zip} | JobFray`,
    description:
      `Browse local jobs and quick work opportunities near ZIP ${zip}.`,
  };
}

export default async function JobsZipPage({
  params,
}: Props): Promise<never> {
  const { zip } = await params;

  redirect(`/jobs?zip=${zip}&radius=10`);
}