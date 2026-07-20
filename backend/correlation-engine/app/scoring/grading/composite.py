from typing import Dict, Any, List

class CompositeCalculator:
    @staticmethod
    def calculate_composite(module_scores: Dict[str, float], weighting_preset: Dict[str, float]) -> float:
        """
        Calculates the weighted composite score based on the role template presets.
        """
        if not module_scores:
            return 0.0
            
        total_weight = 0.0
        weighted_sum = 0.0
        
        # Use presets if available, else default equal weights
        for module, score in module_scores.items():
            weight = weighting_preset.get(module, 1.0)
            weighted_sum += score * weight
            total_weight += weight
            
        if total_weight == 0.0:
            return 0.0
            
        return round(weighted_sum / total_weight, 2)
