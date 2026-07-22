import React, { useRef, useEffect } from "react";
import Editor, { Monaco, OnMount, BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { cdRecruitLightTheme, cdRecruitDarkTheme } from "./monacoTheme";
import { Loader2 } from "lucide-react";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  theme?: "dark" | "light";
  readOnly?: boolean;
  height?: string | number;
  minHeight?: string | number;
  options?: editor.IStandaloneEditorConstructionOptions;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  className?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = "javascript",
  theme = "dark",
  readOnly = false,
  height = "100%",
  minHeight,
  options = {},
  onMount,
  className = "",
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("cd-recruit-light", cdRecruitLightTheme);
    monaco.editor.defineTheme("cd-recruit-dark", cdRecruitDarkTheme);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const themeName = theme === "dark" ? "cd-recruit-dark" : "cd-recruit-light";
    monaco.editor.setTheme(themeName);

    if (onMount) {
      onMount(editor, monaco);
    }
  };

  useEffect(() => {
    if (monacoRef.current) {
      const themeName = theme === "dark" ? "cd-recruit-dark" : "cd-recruit-light";
      monacoRef.current.editor.setTheme(themeName);
    }
  }, [theme]);

  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', monospace",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    lineNumbers: "on",
    wordWrap: "on",
    padding: { top: 12, bottom: 12 },
    readOnly,
    tabSize: language === "python" ? 4 : 2,
    renderLineHighlight: "line",
    smoothScrolling: true,
    cursorBlinking: "smooth",
    contextmenu: true,
    ...options,
  };

  return (
    <div
      className={`relative w-full h-full min-h-0 overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      <Editor
        height={height}
        language={language}
        value={value}
        theme={theme === "dark" ? "cd-recruit-dark" : "cd-recruit-light"}
        onChange={(val) => onChange?.(val ?? "")}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        options={defaultOptions}
        loading={
          <div className="flex flex-col items-center justify-center h-full w-full bg-slate-900 text-slate-400 gap-2 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading Code View…</span>
          </div>
        }
      />
    </div>
  );
};
