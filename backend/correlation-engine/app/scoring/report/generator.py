from typing import Dict, Any

class ReportGenerator:
    @staticmethod
    def generate_report_variants(score_data: Dict[str, Any], candidate_name: str) -> Dict[str, Any]:
        composite = score_data.get("composite_score", 0.0)
        
        # Candidate description band
        if composite >= 85:
            band = "strong hire signal"
        elif composite >= 70:
            band = "good performance signal"
        elif composite >= 50:
            band = "moderate performance signal"
        else:
            band = "development opportunity signal"
            
        return {
            "internal_report": {
                "composite_score": composite,
                "module_scores": score_data.get("module_scores", {}),
                "say_do_consistency_score": score_data.get("say_do_consistency_score", 0.0),
                "say_do_rationale": score_data.get("say_do_rationale", ""),
                "mismatches": score_data.get("mismatches", []),
                "ai_confidence": score_data.get("ai_confidence", 0.0)
            },
            "candidate_report": {
                "composite_score_band": band,
                "strengths_summary": [
                    "Demonstrated completion of all modules.",
                    "Consistent communication in context scenarios."
                ],
                "learning_hub_recommendations": [
                    "Review software design principles.",
                    "Explore advanced query optimizations."
                ],
                "effort_recognition_badge": True
            }
        }
