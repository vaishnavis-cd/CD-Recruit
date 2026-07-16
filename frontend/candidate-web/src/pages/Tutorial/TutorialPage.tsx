import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { Play, ChevronRight, BookOpen, Clock, AlertCircle } from "lucide-react";

export function TutorialPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    scheduledTime?: string;
    bufferMinutes?: number;
    graceMinutes?: number;
    reducedProctoring?: boolean;
    isGracePath?: boolean;
    selfieDataUrl?: string | null;
  } | null;

  const isGrace = state?.isGracePath ?? false;
  const [step, setStep] = useState(0);

  interface TutorialStep {
    title: string;
    description: string;
    icon?: React.ReactNode;
    isPractice?: boolean;
  }

  const tutorialSteps: TutorialStep[] = [
    {
      title: "Split-Pane Layout Overview",
      description: "Your view will be split: Left pane provides assessment content (questions, logs, inbox); Right pane holds the Monaco Code Editor & terminal outputs.",
      icon: <BookOpen className="w-8 h-8 text-accent" />,
    },
    {
      title: "Server-Authoritative Timer",
      description: "A persistent timer is locked to the top menu. Expiry will trigger automatic submission. Suggested budgets are provided but navigation is fully free.",
      icon: <Clock className="w-8 h-8 text-accent" />,
    },
    {
      title: "Run vs. Submit Checks",
      description: "'Run' tests your current state against open, visible test cases. 'Submit' submits your solution and checks against all visible and hidden test configurations.",
      icon: <Play className="w-8 h-8 text-accent" />,
    },
    {
      title: "Interactive Practice Question",
      description: "Try editing this mock code function. Write a function that returns the square of the input parameter.",
      isPractice: true,
    }
  ];

  const graceSteps: TutorialStep[] = [
    {
      title: "Condensed Tour: Core Controls",
      description: "You have entered during the grace window. Below are the mandatory dashboard locations: Timer is at top right. Use the bottom navigation to save drafts or submit.",
      icon: <Clock className="w-8 h-8 text-accent" />,
    },
    {
      title: "Proctoring Details",
      description: "The proctoring system is active. Avoid browser focus drops (switching tabs) and screen exit deviations. Violations are logged silently.",
      icon: <AlertCircle className="w-8 h-8 text-accent" />,
    }
  ];

  const activeSteps = isGrace ? graceSteps : tutorialSteps;
  const currentStepData = activeSteps[step];

  const handleNext = () => {
    if (step < activeSteps.length - 1) {
      setStep(s => s + 1);
    } else {
      if (isGrace) {
        navigate("/assessment", { state });
      } else {
        navigate("/waiting-room", { state });
      }
    }
  };

  return (
    <CardLayout maxWidthClass={currentStepData?.isPractice ? "max-w-4xl" : "max-w-xl"}>
      <div className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">
          {isGrace ? "Condensed Quick Tour" : "Interactive Tutorial"}
        </h1>
        <p className="text-text-secondary text-xs mb-8">
          Step {step + 1} of {activeSteps.length}: {currentStepData?.title}
        </p>

        {currentStepData?.isPractice ? (
          <div className="text-left mb-8">
            <p className="text-sm text-text-secondary mb-4 leading-relaxed">
              {currentStepData.description}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-border-token rounded-xl overflow-hidden bg-surface">
              <div className="p-5 border-b md:border-b-0 md:border-r border-border-token bg-bg">
                <h3 className="font-bold text-sm mb-2 text-text-primary">Function: square(x)</h3>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  Write a function that receives a number and returns its square value.
                </p>
                <div className="bg-surface rounded-lg p-3 text-xs font-mono">
                  Input: 5 <br />
                  Expected Output: 25
                </div>
              </div>

              <div className="flex flex-col bg-bg">
                <div className="bg-surface border-b border-border-token px-4 py-2 text-xs font-mono text-text-secondary">
                  solution.js
                </div>
                <textarea
                  className="flex-1 p-4 font-mono text-xs bg-bg text-text-primary focus:outline-none resize-none"
                  rows={6}
                  defaultValue={`function square(x) {\n  // Write your code here\n  return x * x;\n}`}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6">
              {currentStepData?.icon}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
              {currentStepData?.description}
            </p>
          </div>
        )}

        <button
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl transition-colors cursor-pointer"
        >
          <span>{step === activeSteps.length - 1 ? (isGrace ? "Start Assessment" : "Go to Waiting Room") : "Continue"}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </CardLayout>
  );
}
