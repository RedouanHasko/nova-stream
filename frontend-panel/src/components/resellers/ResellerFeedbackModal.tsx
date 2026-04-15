import { FeedbackModal } from "../common/FeedbackModal";

interface ResellerFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: "success" | "error" | "info";
}

export function ResellerFeedbackModal(props: ResellerFeedbackModalProps) {
  return <FeedbackModal {...props} />;
}
