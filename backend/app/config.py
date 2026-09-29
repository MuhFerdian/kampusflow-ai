from urllib.parse import urlsplit
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    ai_provider: str = 'disabled'
    ai_api_key: str = ''
    ai_base_url: str = 'https://api.openai.com/v1'
    ai_model: str = ''
    ai_timeout_seconds: float = Field(default=20, ge=1, le=60)
    supabase_url: str = ''
    supabase_publishable_key: str = ''
    cors_origins: str = 'http://localhost:3000'
    max_tasks: int = Field(default=200, ge=1, le=500)
    rate_limit_per_minute: int = Field(default=60, ge=1, le=600)
    ai_rate_limit_per_minute: int = Field(default=6, ge=1, le=60)
    @field_validator('supabase_url', 'ai_base_url')
    @classmethod
    def safe_url(cls, value):
        if not value: return value
        p=urlsplit(value)
        if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment:
            raise ValueError('Use an HTTPS URL without credentials, query or fragment.')
        return value.rstrip('/')
    @field_validator('cors_origins')
    @classmethod
    def exact_origins(cls,value):
        for origin in value.split(','):
            p=urlsplit(origin.strip())
            if p.scheme not in ('http','https') or not p.hostname or '*' in origin or p.path or p.query or p.fragment or p.username:
                raise ValueError('CORS origins must be explicit origins without a path or wildcard.')
        return value
settings = Settings()
