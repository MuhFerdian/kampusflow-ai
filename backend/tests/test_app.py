import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import Settings
from app.providers import get_provider, DisabledProvider
client = TestClient(app)
def test_health():
    assert client.get('/health').json() == {'status':'ok','phase':2,'ai_recommendations':False,'backend_configured':False}
def test_recommendations_unavailable():
    assert client.get('/recommendations').status_code == 503
def test_provider_default_and_validation():
    assert isinstance(get_provider(Settings(_env_file=None)), DisabledProvider)
    with pytest.raises(ValueError):
        get_provider(Settings(ai_provider='invalid', _env_file=None))
    with pytest.raises(ValueError):
        get_provider(Settings(ai_provider='openai_compatible', ai_api_key='', ai_model='', _env_file=None))
