import DictionaryApp from "../../dictionary-app";

export default async function WordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DictionaryApp initialId={id} />;
}
