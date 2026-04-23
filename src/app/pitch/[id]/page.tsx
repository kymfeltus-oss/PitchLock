import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function PitchIndex({ params }: Props) {
  const { id } = await params;
  redirect(`/pitch/${id}/gate`);
}
