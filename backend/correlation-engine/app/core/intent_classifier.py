from typing import Dict, Any, List

class IntentClassifier:
    @staticmethod
    def extract_stated_narratives(session_data: Dict[str, Any]) -> str:
        """
        Extract what the candidate said they would do (e.g. AI Prompting, Simulation narratives).
        """
        narratives = []
        
        # Iterate over question responses and extract narratives
        for q_id, response in session_data.get("responses", {}).items():
            payload = response.get("payload", {})
            
            # Identify AI Prompting or Simulation responses
            # Simulation payload typically includes chat log, action history, or text responses
            if "prompt" in payload or "prompts" in payload:
                narratives.append(f"AI Prompting Q-{q_id}: {payload.get('prompt') or payload.get('prompts')}")
            
            if "text" in payload:
                narratives.append(f"Simulation Narrative Q-{q_id}: {payload.get('text')}")
            elif "response" in payload and isinstance(payload["response"], str):
                narratives.append(f"Narrative Q-{q_id}: {payload.get('response')}")
            elif "response" in payload and isinstance(payload["response"], dict):
                # Contextual simulation structure
                res = payload["response"].get("response") or payload["response"].get("text") or ""
                if res:
                    narratives.append(f"Simulation Choice Narrative Q-{q_id}: {res}")

        if not narratives:
            return "No stated narratives or strategies found in session responses."
            
        return "\n\n".join(narratives)

    @staticmethod
    def extract_actual_explanations(session_data: Dict[str, Any]) -> str:
        """
        Extract code diffs, code implementations, and written explanations (SQL, Coding source code & comments).
        """
        explanations = []
        
        for q_id, response in session_data.get("responses", {}).items():
            payload = response.get("payload", {})
            
            explanation = payload.get("explanation") or payload.get("notes") or payload.get("rationale") or ""
            if explanation:
                explanations.append(f"Q-{q_id} Explanation: {explanation}")
                
            if "query" in payload:
                explanations.append(f"SQL Query Q-{q_id}: {payload.get('query')}")
            
            if "code" in payload and isinstance(payload["code"], str):
                code_text = payload["code"]
                explanations.append(f"Coding Implementation Q-{q_id}:\n```\n{code_text[:1500]}\n```")
                lines = code_text.split("\n")
                comments = [line.strip() for line in lines if line.strip().startswith(("#", "//", "/*", "*"))]
                if comments:
                    explanations.append(f"Code Comments Q-{q_id}: " + " | ".join(comments[:10]))

        if not explanations:
            return "No actual code implementations, queries, or comments found in session responses."
            
        return "\n\n".join(explanations)
