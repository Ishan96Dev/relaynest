import { TemplatesBrowser } from "@/components/bots/templates-browser";

export const metadata = { title: "Bot Templates" };

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <TemplatesBrowser />
    </div>
  );
}