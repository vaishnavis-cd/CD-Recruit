import { CodingWorkspace } from "@/components/coding/CodingWorkspace";

interface CodingPageProps {
  question: any;
  onNext: () => void;
  updateStatus: (status: "unvisited" | "skipped" | "flagged" | "answered") => void;
}

export function CodingPage({ question, onNext, updateStatus }: CodingPageProps) {
  return (
    <CodingWorkspace
      question={question}
      onNext={onNext}
      updateStatus={updateStatus}
    />
  );
}
