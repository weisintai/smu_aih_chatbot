import DialogflowComponent from "@/components/dialogflow-form/dialogflow-form";
import { InstallPrompt } from "@/components/install-prompt";
import { ModeToggle } from "@/components/mode-toggle";
import { SpeechToText } from "@/components/speech-to-text";

export default function Home() {
  return (
    <>
      <DialogflowComponent />
      {/* <InstallPrompt />
      <ModeToggle /> */}
    </>
  );
}
