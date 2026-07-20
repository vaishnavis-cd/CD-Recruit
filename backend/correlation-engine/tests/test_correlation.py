import pytest
from app.services.llm_client import LLMClient

def test_fallback_json():
    client = LLMClient()
    schema = {
        "properties": {
            "consistency_score": {"type": "number"},
            "rationale": {"type": "string"},
            "mismatches": {"type": "array"}
        }
    }
    fallback = client._get_fallback_json(schema)
    assert fallback["consistency_score"] == 0.0
    assert isinstance(fallback["rationale"], str)
    assert isinstance(fallback["mismatches"], list)
