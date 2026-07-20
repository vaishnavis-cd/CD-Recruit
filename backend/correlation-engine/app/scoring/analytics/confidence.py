from typing import List, Dict, Any

class ConfidenceScorer:
    @staticmethod
    def calculate_overall_confidence(confidences: List[float], integrity_flags_count: int) -> float:
        """
        Calculates an aggregate confidence score for the entire session.
        Low confidence routing threshold is 0.80.
        """
        if not confidences:
            return 0.5
            
        # Overall confidence is min confidence of evaluations with a penalty for integrity flags
        base_confidence = sum(confidences) / len(confidences)
        
        # Penalty for flags
        penalty = integrity_flags_count * 0.1
        final_confidence = max(0.0, base_confidence - penalty)
        
        return round(final_confidence, 2)
