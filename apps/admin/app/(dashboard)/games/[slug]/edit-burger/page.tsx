import { EditBurgerClient } from './edit-burger-client';

export default async function EditBurgerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditBurgerClient slug={slug} />;
}
